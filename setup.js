#!/usr/bin/env node
import { createInterface } from "readline"
import { createServer } from "http"
import { execFile } from "child_process"
import { google } from "googleapis"

const REDIRECT_PORT = 8391
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`
const SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((resolve) => rl.question(q, resolve))

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
console.log("3. Set the OAuth app's publishing status to 'In production'")
console.log(
  "   (youtube.force-ssl is a sensitive scope — in 'Testing' the refresh token expires after 7 days)",
)
console.log("4. Create an OAuth client ID of type 'Desktop app'")
console.log(
  "   (Desktop app clients auto-trust any localhost redirect — no need to register one)\n",
)

const clientId = (await ask("Client ID: ")).trim()
const clientSecret = (await ask("Client Secret: ")).trim()

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

// Nothing is written to disk. The server reads these three values from the
// environment only — stash them wherever you like (keychain, secrets manager,
// MCP client `env` block) and export them into the process that runs the server.
const refreshToken = tokens.refresh_token

console.log("\nSetup complete — nothing was written to disk.\n")
console.log("Export these into the environment that runs the MCP server:\n")
console.log(`  export MCP_YOUTUBE_CLIENT_ID='${clientId}'`)
console.log(`  export MCP_YOUTUBE_CLIENT_SECRET='${clientSecret}'`)
console.log(`  export MCP_YOUTUBE_REFRESH_TOKEN='${refreshToken}'`)
console.log(
  "\nTip: keep the values in your keychain and source them, e.g.\n" +
    "  export MCP_YOUTUBE_REFRESH_TOKEN=$(security find-generic-password -s mcp-youtube-refresh-token -w)\n",
)
console.log("Or paste into an MCP client `env` block (.mcp.json):\n")
console.log(
  JSON.stringify(
    {
      env: {
        MCP_YOUTUBE_CLIENT_ID: clientId,
        MCP_YOUTUBE_CLIENT_SECRET: clientSecret,
        MCP_YOUTUBE_REFRESH_TOKEN: refreshToken,
      },
    },
    null,
    2,
  ),
)
