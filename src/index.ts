#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { google, youtube_v3 } from "googleapis"
import { readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { z } from "zod"

// Vitest sets VITEST=true in the test process. Import-time side effects
// (credential exits, starting the real transport, spawning setup.js) must be
// skipped under test — the generated tests do `import * as api from
// "../index.js"` to exercise tool handlers, and importing must stay pure or
// it either kills the runner via process.exit(1) or opens a real
// StdioServerTransport.
const runningUnderTest = process.env.VITEST === "true"

if (process.argv[2] === "setup" && !runningUnderTest) {
  const { spawnSync } = await import("child_process")
  const { dirname, join: pathJoin } = await import("path")
  const { fileURLToPath } = await import("url")
  const setupScript = pathJoin(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "setup.js",
  )
  const result = spawnSync(process.execPath, [setupScript], {
    stdio: "inherit",
  })
  process.exit(result.status ?? 0)
}

type YoutubeConfig = {
  clientId?: string
  clientSecret?: string
  refreshToken?: string
}

const loadConfig = (): YoutubeConfig => {
  try {
    return JSON.parse(
      readFileSync(join(homedir(), ".config", "youtube.json"), "utf8"),
    )
  } catch {
    return {}
  }
}

const config = loadConfig()

const CLIENT_ID = process.env["MCP_YOUTUBE_CLIENT_ID"] ?? config.clientId
const CLIENT_SECRET =
  process.env["MCP_YOUTUBE_CLIENT_SECRET"] ?? config.clientSecret
const REFRESH_TOKEN =
  process.env["MCP_YOUTUBE_REFRESH_TOKEN"] ?? config.refreshToken

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN })

export const youtube = google.youtube({ version: "v3", auth: oauth2Client })

export const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
})

export const err = (msg: string) => ({
  content: [{ type: "text" as const, text: `Error: ${msg}` }],
})

const errorMessage = (e: unknown): string =>
  e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : String(e)

const callApi = async <T>(
  fn: () => Promise<{ data: T }>,
): Promise<T | null> => {
  try {
    const res = await fn()
    return res.data
  } catch (e) {
    console.error("YouTube API error:", errorMessage(e))
    return null
  }
}

const mapSearchResult = (item: youtube_v3.Schema$SearchResult) => ({
  videoId: item.id?.videoId,
  channelId: item.id?.channelId,
  playlistId: item.id?.playlistId,
  title: item.snippet?.title,
  channelTitle: item.snippet?.channelTitle,
  publishedAt: item.snippet?.publishedAt,
  description: item.snippet?.description,
})

const mapPlaylist = (item: youtube_v3.Schema$Playlist) => ({
  playlistId: item.id,
  title: item.snippet?.title,
  description: item.snippet?.description,
  itemCount: item.contentDetails?.itemCount,
  privacyStatus: item.status?.privacyStatus,
})

const mapPlaylistItem = (item: youtube_v3.Schema$PlaylistItem) => ({
  playlistItemId: item.id,
  videoId: item.snippet?.resourceId?.videoId,
  title: item.snippet?.title,
  channelTitle: item.snippet?.videoOwnerChannelTitle,
  channelId: item.snippet?.videoOwnerChannelId,
  position: item.snippet?.position,
  publishedAt: item.contentDetails?.videoPublishedAt,
})

const TOMBSTONE_TITLES = new Set(["Deleted video", "Private video"])

const isTombstone = (item: youtube_v3.Schema$PlaylistItem) =>
  TOMBSTONE_TITLES.has(item.snippet?.title ?? "")

const fetchAllPlaylistItems = async (
  playlistId: string,
): Promise<youtube_v3.Schema$PlaylistItem[] | null> => {
  const items: youtube_v3.Schema$PlaylistItem[] = []
  let pageToken: string | undefined
  do {
    const data = await callApi(() =>
      youtube.playlistItems.list({
        part: ["snippet", "contentDetails", "status"],
        playlistId,
        maxResults: 50,
        pageToken,
      }),
    )
    if (!data) return null
    items.push(...(data.items ?? []))
    pageToken = data.nextPageToken ?? undefined
  } while (pageToken)
  return items
}

// ─── Search ───

export const search = async ({
  query,
  maxResults = 10,
  type = "video",
}: {
  query: string
  maxResults?: number
  type?: "video" | "channel" | "playlist"
}) => {
  const data = await callApi(() =>
    youtube.search.list({
      part: ["snippet"],
      q: query,
      maxResults,
      type: [type],
    }),
  )
  return data
    ? ok((data.items ?? []).map(mapSearchResult))
    : err(`search failed for query "${query}"`)
}

// ─── Playlists ───

export const listPlaylists = async ({
  maxResults = 25,
  pageToken,
}: {
  maxResults?: number
  pageToken?: string
}) => {
  const data = await callApi(() =>
    youtube.playlists.list({
      part: ["snippet", "contentDetails", "status"],
      mine: true,
      maxResults,
      pageToken,
    }),
  )
  return data
    ? ok({
        playlists: (data.items ?? []).map(mapPlaylist),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err("failed to list playlists")
}

export const getPlaylist = async ({
  playlistId,
  maxResults = 50,
  pageToken,
}: {
  playlistId: string
  maxResults?: number
  pageToken?: string
}) => {
  const data = await callApi(() =>
    youtube.playlistItems.list({
      part: ["snippet", "contentDetails", "status"],
      playlistId,
      maxResults,
      pageToken,
    }),
  )
  return data
    ? ok({
        items: (data.items ?? []).map(mapPlaylistItem),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err(`failed to fetch playlist ${playlistId}`)
}

export const createPlaylist = async ({
  title,
  description = "",
  privacyStatus = "private",
}: {
  title: string
  description?: string
  privacyStatus?: "private" | "unlisted" | "public"
}) => {
  const data = await callApi(() =>
    youtube.playlists.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus },
      },
    }),
  )
  return data
    ? ok(mapPlaylist(data))
    : err(`failed to create playlist "${title}"`)
}

export const addToPlaylist = async ({
  playlistId,
  videoIds,
}: {
  playlistId: string
  videoIds: string[]
}) => {
  const added: string[] = []
  const failed: string[] = []
  for (const videoId of videoIds) {
    try {
      await youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId,
            resourceId: { kind: "youtube#video", videoId },
          },
        },
      })
      added.push(videoId)
    } catch (e) {
      console.error(`Failed to add video ${videoId}:`, errorMessage(e))
      failed.push(videoId)
    }
  }
  return failed.length === videoIds.length
    ? err(`failed to add any videos to playlist ${playlistId}`)
    : ok({ playlistId, added, failed, quotaCost: added.length * 50 })
}

export const removeFromPlaylist = async ({
  playlistItemIds,
  confirm = false,
}: {
  playlistItemIds: string[]
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to remove ${playlistItemIds.length} item(s) — this permanently deletes playlist entries at 50 units each`,
    )
  }
  const removed: string[] = []
  const failed: string[] = []
  for (const id of playlistItemIds) {
    try {
      await youtube.playlistItems.delete({ id })
      removed.push(id)
    } catch (e) {
      console.error(`Failed to remove playlist item ${id}:`, errorMessage(e))
      failed.push(id)
    }
  }
  return failed.length === playlistItemIds.length
    ? err("failed to remove any items")
    : ok({ removed, failed, quotaCost: removed.length * 50 })
}

export const deletePlaylist = async ({
  playlistId,
  confirm = false,
}: {
  playlistId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to permanently delete playlist ${playlistId}`,
    )
  }
  try {
    await youtube.playlists.delete({ id: playlistId })
    return ok({ deleted: playlistId, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to delete playlist ${playlistId}:`, errorMessage(e))
    return err(`failed to delete playlist ${playlistId}`)
  }
}

export const cleanPlaylist = async ({
  playlistId,
  removeTombstones = true,
  dedupe = false,
  pruneChannelIds = [],
  dryRun = true,
}: {
  playlistId: string
  removeTombstones?: boolean
  dedupe?: boolean
  pruneChannelIds?: string[]
  dryRun?: boolean
}) => {
  const items = await fetchAllPlaylistItems(playlistId)
  if (!items) return err(`failed to scan playlist ${playlistId}`)

  const seenVideoIds = new Set<string>()
  const pruneSet = new Set(pruneChannelIds)
  const toDelete: youtube_v3.Schema$PlaylistItem[] = []

  for (const item of items) {
    const videoId = item.snippet?.resourceId?.videoId ?? ""
    const channelId = item.snippet?.videoOwnerChannelId ?? ""
    const tombstone = removeTombstones && isTombstone(item)
    const duplicate = dedupe && videoId !== "" && seenVideoIds.has(videoId)
    const pruned = pruneSet.has(channelId)
    if (!tombstone && videoId) seenVideoIds.add(videoId)
    if (tombstone || duplicate || pruned) toDelete.push(item)
  }

  const plan = toDelete.map((item) => ({
    playlistItemId: item.id,
    videoId: item.snippet?.resourceId?.videoId,
    title: item.snippet?.title,
  }))

  if (dryRun) {
    return ok({
      dryRun: true,
      playlistId,
      scanned: items.length,
      plannedDeletes: plan.length,
      estimatedQuotaCost: plan.length * 50,
      items: plan,
    })
  }

  const deleted: string[] = []
  const failed: string[] = []
  for (const item of toDelete) {
    if (!item.id) continue
    try {
      await youtube.playlistItems.delete({ id: item.id })
      deleted.push(item.id)
    } catch (e) {
      console.error(
        `Failed to delete playlist item ${item.id}:`,
        errorMessage(e),
      )
      failed.push(item.id)
    }
    if (!runningUnderTest)
      await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return ok({
    dryRun: false,
    playlistId,
    scanned: items.length,
    deleted: deleted.length,
    failed: failed.length,
    quotaCost: deleted.length * 50,
  })
}

const server = new McpServer({ name: "youtube", version: "0.1.0" })

// ─── Search ───
server.registerTool(
  "search",
  {
    description:
      "Search YouTube for videos, channels, or playlists. Costs 100 quota units per call — use sparingly.",
    inputSchema: {
      query: z.string().describe("Search query"),
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Max results (1-50)"),
      type: z
        .enum(["video", "channel", "playlist"])
        .default("video")
        .describe("Resource type to search for"),
    },
  },
  search,
)

// ─── Playlists ───
server.registerTool(
  "list-playlists",
  {
    description:
      "List the authenticated user's playlists. Costs 1 quota unit per call.",
    inputSchema: {
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(25)
        .describe("Max results (1-50)"),
      pageToken: z
        .string()
        .optional()
        .describe("Page token from a previous call"),
    },
  },
  listPlaylists,
)

server.registerTool(
  "get-playlist",
  {
    description:
      "Read a playlist's items/contents. Costs 1 quota unit per call.",
    inputSchema: {
      playlistId: z.string().describe("Playlist ID"),
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(50)
        .describe("Max results (1-50)"),
      pageToken: z
        .string()
        .optional()
        .describe("Page token from a previous call"),
    },
  },
  getPlaylist,
)

server.registerTool(
  "create-playlist",
  {
    description: "Create a new playlist. Costs 50 quota units.",
    inputSchema: {
      title: z.string().describe("Playlist title"),
      description: z.string().default("").describe("Playlist description"),
      privacyStatus: z
        .enum(["private", "unlisted", "public"])
        .default("private")
        .describe("Playlist visibility"),
    },
  },
  createPlaylist,
)

server.registerTool(
  "add-to-playlist",
  {
    description:
      "Add one or more videos to a playlist. Costs 50 quota units per video.",
    inputSchema: {
      playlistId: z.string().describe("Playlist ID"),
      videoIds: z.array(z.string()).min(1).describe("Video IDs to add"),
    },
  },
  addToPlaylist,
)

server.registerTool(
  "remove-from-playlist",
  {
    description:
      "Permanently remove specific items from a playlist by playlist-item ID. Costs 50 quota units per item. Requires confirm: true.",
    inputSchema: {
      playlistItemIds: z
        .array(z.string())
        .min(1)
        .describe("Playlist item IDs to remove"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually remove"),
    },
  },
  removeFromPlaylist,
)

server.registerTool(
  "clean-playlist",
  {
    description:
      "Scan a playlist (1 unit/page) and plan removal of [Deleted video]/[Private video] tombstones, duplicates, and/or videos from given channels. Defaults to dry-run (dryRun: true) — returns the plan without deleting. Pass dryRun: false to actually delete, at 50 quota units per item.",
    inputSchema: {
      playlistId: z.string().describe("Playlist ID"),
      removeTombstones: z
        .boolean()
        .default(true)
        .describe("Remove [Deleted video]/[Private video] tombstones"),
      dedupe: z
        .boolean()
        .default(false)
        .describe("Remove duplicate videos, keeping the first occurrence"),
      pruneChannelIds: z
        .array(z.string())
        .default([])
        .describe("Channel IDs whose videos should be removed"),
      dryRun: z
        .boolean()
        .default(true)
        .describe(
          "When true (default), only returns the plan — no deletes performed",
        ),
    },
  },
  cleanPlaylist,
)

server.registerTool(
  "delete-playlist",
  {
    description:
      "Permanently delete an entire playlist. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      playlistId: z.string().describe("Playlist ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually delete"),
    },
  },
  deletePlaylist,
)

const main = async () => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error(
      "Missing YouTube OAuth credentials — run `npm run setup` (or set MCP_YOUTUBE_CLIENT_ID / MCP_YOUTUBE_CLIENT_SECRET / MCP_YOUTUBE_REFRESH_TOKEN)",
    )
    process.exit(1)
  }
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("mcp-youtube running")
}

// Tests import this module to exercise tool handlers against a mocked
// googleapis client; without this guard, importing would run the credential
// check above and a real StdioServerTransport, aborting the test runner or
// leaving an unhandled rejection. The real CLI still starts normally —
// VITEST is only ever set by the vitest process itself.
if (!runningUnderTest) {
  main().catch((e) => {
    console.error("Fatal:", e)
    process.exit(1)
  })
}
