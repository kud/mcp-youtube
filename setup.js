#!/usr/bin/env node
import { createInterface } from "readline"
import { createServer } from "http"
import { execFile } from "child_process"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"
import { google } from "googleapis"

const CONFIG_PATH = join(homedir(), ".config", "youtube.json")
const REDIRECT_PORT = 8391
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`
const SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((resolve) => rl.question(q, resolve))

const readExistingConfig = () => {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"))
  } catch {
    return {}
  }
}

const openBrowser = (url) => {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open"
  execFile(opener, [url], () => {})
}

const waitForAuthCode = (server) =>
  new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url, REDIRECT_URI)
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404)
        res.end()
        return
      }
      const code = url.searchParams.get("code")
      const error = url.searchParams.get("error")
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(
        error
          ? `<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`
          : "<h1>Authorization complete</h1><p>You can close this tab and return to the terminal.</p>",
      )
      if (error) reject(new Error(error))
      else resolve(code)
    })
  })

console.log("YouTube MCP Setup")
console.log("─────────────────")
console.log("1. Go to https://console.cloud.google.com/apis/credentials")
console.log("2. Enable the 'YouTube Data API v3' for your project")
console.log("3. Create an OAuth client ID of type 'Desktop app'")
console.log(`4. Add this authorized redirect URI: ${REDIRECT_URI}\n`)

const existing = readExistingConfig()

const clientId =
  (
    await ask(
      `Client ID${existing.clientId ? ` [${existing.clientId.slice(0, 12)}…]` : ""}: `,
    )
  ).trim() || existing.clientId
const clientSecret =
  (
    await ask(`Client Secret${existing.clientSecret ? " [unchanged]" : ""}: `)
  ).trim() || existing.clientSecret

if (!clientId || !clientSecret) {
  console.error("Both client ID and secret are required.")
  rl.close()
  process.exit(1)
}

rl.close()

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI,
)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
})

const server = createServer()
server.listen(REDIRECT_PORT)

console.log(`Opening browser for authorization:\n${authUrl}\n`)
openBrowser(authUrl)

const code = await waitForAuthCode(server)
server.close()

const { tokens } = await oauth2Client.getToken(code)

if (!tokens.refresh_token) {
  console.error(
    "\nNo refresh token returned. Revoke prior access at https://myaccount.google.com/permissions and run setup again.",
  )
  process.exit(1)
}

mkdirSync(dirname(CONFIG_PATH), { recursive: true })
writeFileSync(
  CONFIG_PATH,
  JSON.stringify(
    { clientId, clientSecret, refreshToken: tokens.refresh_token },
    null,
    2,
  ),
  { mode: 0o600 },
)

console.log(`\nSaved credentials to ${CONFIG_PATH}`)
console.log("Setup complete.")
