#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createReadStream, createWriteStream } from "fs"
import { google, youtube_v3 } from "googleapis"
import { extname } from "path"
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

// Credentials are read from the environment only. Where the values come from —
// a keychain-backed shell export, the MCP client's `env` block, a secrets
// manager — is the operator's concern; the server stays store-agnostic.
const CLIENT_ID = process.env["MCP_YOUTUBE_CLIENT_ID"]
const CLIENT_SECRET = process.env["MCP_YOUTUBE_CLIENT_SECRET"]
const REFRESH_TOKEN = process.env["MCP_YOUTUBE_REFRESH_TOKEN"]

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

const mapVideo = (item: youtube_v3.Schema$Video) => ({
  videoId: item.id,
  title: item.snippet?.title,
  description: item.snippet?.description,
  channelId: item.snippet?.channelId,
  channelTitle: item.snippet?.channelTitle,
  categoryId: item.snippet?.categoryId,
  tags: item.snippet?.tags,
  publishedAt: item.snippet?.publishedAt,
  privacyStatus: item.status?.privacyStatus,
  embeddable: item.status?.embeddable,
  license: item.status?.license,
  madeForKids: item.status?.madeForKids,
  uploadStatus: item.status?.uploadStatus,
  viewCount: item.statistics?.viewCount,
  likeCount: item.statistics?.likeCount,
  commentCount: item.statistics?.commentCount,
  duration: item.contentDetails?.duration,
})

const mapChannel = (item: youtube_v3.Schema$Channel) => ({
  channelId: item.id,
  title: item.snippet?.title,
  description: item.snippet?.description,
  customUrl: item.snippet?.customUrl,
  publishedAt: item.snippet?.publishedAt,
  country: item.snippet?.country,
  subscriberCount: item.statistics?.subscriberCount,
  videoCount: item.statistics?.videoCount,
  viewCount: item.statistics?.viewCount,
  privacyStatus: item.status?.privacyStatus,
})

const mapChannelSection = (item: youtube_v3.Schema$ChannelSection) => ({
  channelSectionId: item.id,
  type: item.snippet?.type,
  style: item.snippet?.style,
  title: item.snippet?.title,
  position: item.snippet?.position,
  playlists: item.contentDetails?.playlists,
  channels: item.contentDetails?.channels,
})

const mapComment = (item: youtube_v3.Schema$Comment) => ({
  commentId: item.id,
  authorDisplayName: item.snippet?.authorDisplayName,
  textDisplay: item.snippet?.textDisplay,
  likeCount: item.snippet?.likeCount,
  publishedAt: item.snippet?.publishedAt,
  updatedAt: item.snippet?.updatedAt,
  moderationStatus: item.snippet?.moderationStatus,
  parentId: item.snippet?.parentId,
  videoId: item.snippet?.videoId,
})

const mapCommentThread = (item: youtube_v3.Schema$CommentThread) => ({
  commentThreadId: item.id,
  videoId: item.snippet?.videoId,
  channelId: item.snippet?.channelId,
  totalReplyCount: item.snippet?.totalReplyCount,
  topLevelComment: item.snippet?.topLevelComment
    ? mapComment(item.snippet.topLevelComment)
    : undefined,
})

const mapSubscription = (item: youtube_v3.Schema$Subscription) => ({
  subscriptionId: item.id,
  channelId: item.snippet?.resourceId?.channelId,
  title: item.snippet?.title,
  description: item.snippet?.description,
  publishedAt: item.snippet?.publishedAt,
})

const mapCaption = (item: youtube_v3.Schema$Caption) => ({
  captionId: item.id,
  videoId: item.snippet?.videoId,
  language: item.snippet?.language,
  name: item.snippet?.name,
  trackKind: item.snippet?.trackKind,
  isDraft: item.snippet?.isDraft,
  isAutoSynced: item.snippet?.isAutoSynced,
  status: item.snippet?.status,
  lastUpdated: item.snippet?.lastUpdated,
})

const mapPlaylistImage = (item: youtube_v3.Schema$PlaylistImage) => ({
  playlistImageId: item.id,
  playlistId: item.snippet?.playlistId,
  type: item.snippet?.type,
  width: item.snippet?.width,
  height: item.snippet?.height,
})

const mapActivity = (item: youtube_v3.Schema$Activity) => ({
  activityId: item.id,
  type: item.snippet?.type,
  title: item.snippet?.title,
  description: item.snippet?.description,
  channelId: item.snippet?.channelId,
  channelTitle: item.snippet?.channelTitle,
  publishedAt: item.snippet?.publishedAt,
})

const mapMember = (item: youtube_v3.Schema$Member) => ({
  channelId: item.snippet?.memberDetails?.channelId,
  displayName: item.snippet?.memberDetails?.displayName,
  highestAccessibleLevel:
    item.snippet?.membershipsDetails?.highestAccessibleLevel,
  highestAccessibleLevelDisplayName:
    item.snippet?.membershipsDetails?.highestAccessibleLevelDisplayName,
})

const mapMembershipsLevel = (item: youtube_v3.Schema$MembershipsLevel) => ({
  levelId: item.id,
  displayName: item.snippet?.levelDetails?.displayName,
})

const mapVideoCategory = (item: youtube_v3.Schema$VideoCategory) => ({
  categoryId: item.id,
  title: item.snippet?.title,
  assignable: item.snippet?.assignable,
})

const mapI18nLanguage = (item: youtube_v3.Schema$I18nLanguage) => ({
  languageCode: item.id,
  name: item.snippet?.name,
})

const mapI18nRegion = (item: youtube_v3.Schema$I18nRegion) => ({
  regionCode: item.id,
  name: item.snippet?.name,
})

const mapVideoAbuseReportReason = (
  item: youtube_v3.Schema$VideoAbuseReportReason,
) => ({
  reasonId: item.id,
  label: item.snippet?.label,
  secondaryReasons: item.snippet?.secondaryReasons?.map((reason) => ({
    id: reason.id,
    label: reason.label,
  })),
})

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".flv": "video/x-flv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".srt": "application/x-subrip",
  ".vtt": "text/vtt",
  ".sbv": "text/plain",
  ".ttml": "application/ttml+xml",
}

const mimeTypeFor = (filePath: string): string =>
  MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"

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

export const updatePlaylist = async ({
  playlistId,
  title,
  description,
  privacyStatus,
}: {
  playlistId: string
  title?: string
  description?: string
  privacyStatus?: "private" | "unlisted" | "public"
}) => {
  const current = await callApi(() =>
    youtube.playlists.list({ part: ["snippet", "status"], id: [playlistId] }),
  )
  const existing = current?.items?.[0]
  if (!existing) return err(`playlist ${playlistId} not found`)
  const data = await callApi(() =>
    youtube.playlists.update({
      part: ["snippet", "status"],
      requestBody: {
        id: playlistId,
        snippet: {
          title: title ?? existing.snippet?.title,
          description: description ?? existing.snippet?.description,
        },
        status: {
          privacyStatus: privacyStatus ?? existing.status?.privacyStatus,
        },
      },
    }),
  )
  return data
    ? ok(mapPlaylist(data))
    : err(`failed to update playlist ${playlistId}`)
}

// ─── Playlist Items ───

export const updatePlaylistItem = async ({
  playlistItemId,
  playlistId,
  videoId,
  position,
}: {
  playlistItemId: string
  playlistId: string
  videoId: string
  position: number
}) => {
  const data = await callApi(() =>
    youtube.playlistItems.update({
      part: ["snippet"],
      requestBody: {
        id: playlistItemId,
        snippet: {
          playlistId,
          position,
          resourceId: { kind: "youtube#video", videoId },
        },
      },
    }),
  )
  return data
    ? ok(mapPlaylistItem(data))
    : err(`failed to update playlist item ${playlistItemId}`)
}

// ─── Videos ───

export const listVideos = async ({ videoIds }: { videoIds: string[] }) => {
  const data = await callApi(() =>
    youtube.videos.list({
      part: ["snippet", "contentDetails", "status", "statistics"],
      id: videoIds,
    }),
  )
  return data
    ? ok((data.items ?? []).map(mapVideo))
    : err(`failed to fetch videos ${videoIds.join(", ")}`)
}

export const updateVideo = async ({
  videoId,
  title,
  description,
  categoryId,
  tags,
  privacyStatus,
  embeddable,
  license,
  publicStatsViewable,
  selfDeclaredMadeForKids,
}: {
  videoId: string
  title?: string
  description?: string
  categoryId?: string
  tags?: string[]
  privacyStatus?: "private" | "unlisted" | "public"
  embeddable?: boolean
  license?: "youtube" | "creativeCommon"
  publicStatsViewable?: boolean
  selfDeclaredMadeForKids?: boolean
}) => {
  const current = await callApi(() =>
    youtube.videos.list({ part: ["snippet", "status"], id: [videoId] }),
  )
  const existing = current?.items?.[0]
  if (!existing) return err(`video ${videoId} not found`)
  const data = await callApi(() =>
    youtube.videos.update({
      part: ["snippet", "status"],
      requestBody: {
        id: videoId,
        snippet: {
          title: title ?? existing.snippet?.title,
          description: description ?? existing.snippet?.description,
          categoryId: categoryId ?? existing.snippet?.categoryId,
          tags: tags ?? existing.snippet?.tags,
        },
        status: {
          privacyStatus: privacyStatus ?? existing.status?.privacyStatus,
          embeddable: embeddable ?? existing.status?.embeddable,
          license: license ?? existing.status?.license,
          publicStatsViewable:
            publicStatsViewable ?? existing.status?.publicStatsViewable,
          selfDeclaredMadeForKids:
            selfDeclaredMadeForKids ?? existing.status?.selfDeclaredMadeForKids,
        },
      },
    }),
  )
  return data ? ok(mapVideo(data)) : err(`failed to update video ${videoId}`)
}

export const rateVideo = async ({
  videoId,
  rating,
}: {
  videoId: string
  rating: "like" | "dislike" | "none"
}) => {
  try {
    await youtube.videos.rate({ id: videoId, rating })
    return ok({ videoId, rating, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to rate video ${videoId}:`, errorMessage(e))
    return err(`failed to rate video ${videoId}`)
  }
}

export const getVideoRating = async ({ videoIds }: { videoIds: string[] }) => {
  const data = await callApi(() => youtube.videos.getRating({ id: videoIds }))
  return data
    ? ok(
        (data.items ?? []).map((item) => ({
          videoId: item.videoId,
          rating: item.rating,
        })),
      )
    : err(`failed to fetch rating for ${videoIds.join(", ")}`)
}

export const deleteVideo = async ({
  videoId,
  confirm = false,
}: {
  videoId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(`confirm must be true to permanently delete video ${videoId}`)
  }
  try {
    await youtube.videos.delete({ id: videoId })
    return ok({ deleted: videoId, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to delete video ${videoId}:`, errorMessage(e))
    return err(`failed to delete video ${videoId}`)
  }
}

export const uploadVideo = async ({
  filePath,
  title,
  description = "",
  categoryId = "22",
  tags,
  privacyStatus = "private",
}: {
  filePath: string
  title: string
  description?: string
  categoryId?: string
  tags?: string[]
  privacyStatus?: "private" | "unlisted" | "public"
}) => {
  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description, categoryId, tags },
        status: { privacyStatus },
      },
      media: {
        mimeType: mimeTypeFor(filePath),
        body: createReadStream(filePath),
      },
    })
    return ok({ ...mapVideo(res.data), quotaCost: 1600 })
  } catch (e) {
    console.error(`Failed to upload video from ${filePath}:`, errorMessage(e))
    return err(`failed to upload video from ${filePath}`)
  }
}

export const reportVideoAbuse = async ({
  videoId,
  reasonId,
  secondaryReasonId,
  comments,
  language,
  confirm = false,
}: {
  videoId: string
  reasonId: string
  secondaryReasonId?: string
  comments?: string
  language?: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to report video ${videoId} for abuse — YouTube reviews this against your account`,
    )
  }
  try {
    await youtube.videos.reportAbuse({
      requestBody: {
        videoId,
        reasonId,
        secondaryReasonId,
        comments,
        language,
      },
    })
    return ok({ reported: videoId, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to report video ${videoId}:`, errorMessage(e))
    return err(`failed to report video ${videoId}`)
  }
}

// ─── Channels ───

export const updateChannel = async ({
  channelId,
  title,
  description,
  keywords,
  unsubscribedTrailer,
  defaultLanguage,
  country,
}: {
  channelId: string
  title?: string
  description?: string
  keywords?: string
  unsubscribedTrailer?: string
  defaultLanguage?: string
  country?: string
}) => {
  const current = await callApi(() =>
    youtube.channels.list({ part: ["brandingSettings"], id: [channelId] }),
  )
  const existing = current?.items?.[0]
  if (!existing) return err(`channel ${channelId} not found`)
  const channel = existing.brandingSettings?.channel ?? {}
  const data = await callApi(() =>
    youtube.channels.update({
      part: ["brandingSettings"],
      requestBody: {
        id: channelId,
        brandingSettings: {
          channel: {
            title: title ?? channel.title,
            description: description ?? channel.description,
            keywords: keywords ?? channel.keywords,
            unsubscribedTrailer:
              unsubscribedTrailer ?? channel.unsubscribedTrailer,
            defaultLanguage: defaultLanguage ?? channel.defaultLanguage,
            country: country ?? channel.country,
          },
        },
      },
    }),
  )
  return data
    ? ok(mapChannel(data))
    : err(`failed to update channel ${channelId}`)
}

export const listChannels = async () => {
  const data = await callApi(() =>
    youtube.channels.list({
      part: ["snippet", "statistics", "status"],
      mine: true,
    }),
  )
  return data
    ? ok((data.items ?? []).map(mapChannel))
    : err("failed to list channels")
}

// ─── Channel Sections ───

export const listChannelSections = async ({
  channelId,
}: {
  channelId?: string
}) => {
  const data = await callApi(() =>
    youtube.channelSections.list({
      part: ["snippet", "contentDetails"],
      ...(channelId ? { channelId } : { mine: true }),
    }),
  )
  return data
    ? ok((data.items ?? []).map(mapChannelSection))
    : err("failed to list channel sections")
}

export const createChannelSection = async ({
  type,
  title,
  style = "horizontalRow",
  position,
  playlistIds,
  channelIds,
}: {
  type: string
  title?: string
  style?: "horizontalRow" | "verticalList"
  position?: number
  playlistIds?: string[]
  channelIds?: string[]
}) => {
  const data = await callApi(() =>
    youtube.channelSections.insert({
      part: ["snippet", "contentDetails"],
      requestBody: {
        snippet: { type, title, style, position },
        contentDetails: { playlists: playlistIds, channels: channelIds },
      },
    }),
  )
  return data
    ? ok(mapChannelSection(data))
    : err(`failed to create channel section "${type}"`)
}

export const updateChannelSection = async ({
  channelSectionId,
  type,
  title,
  style,
  position,
  playlistIds,
  channelIds,
}: {
  channelSectionId: string
  type?: string
  title?: string
  style?: "horizontalRow" | "verticalList"
  position?: number
  playlistIds?: string[]
  channelIds?: string[]
}) => {
  const current = await callApi(() =>
    youtube.channelSections.list({
      part: ["snippet", "contentDetails"],
      id: [channelSectionId],
    }),
  )
  const existing = current?.items?.[0]
  if (!existing) return err(`channel section ${channelSectionId} not found`)
  const data = await callApi(() =>
    youtube.channelSections.update({
      part: ["snippet", "contentDetails"],
      requestBody: {
        id: channelSectionId,
        snippet: {
          type: type ?? existing.snippet?.type,
          title: title ?? existing.snippet?.title,
          style: style ?? existing.snippet?.style,
          position: position ?? existing.snippet?.position,
        },
        contentDetails: {
          playlists: playlistIds ?? existing.contentDetails?.playlists,
          channels: channelIds ?? existing.contentDetails?.channels,
        },
      },
    }),
  )
  return data
    ? ok(mapChannelSection(data))
    : err(`failed to update channel section ${channelSectionId}`)
}

export const deleteChannelSection = async ({
  channelSectionId,
  confirm = false,
}: {
  channelSectionId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to permanently delete channel section ${channelSectionId}`,
    )
  }
  try {
    await youtube.channelSections.delete({ id: channelSectionId })
    return ok({ deleted: channelSectionId, quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to delete channel section ${channelSectionId}:`,
      errorMessage(e),
    )
    return err(`failed to delete channel section ${channelSectionId}`)
  }
}

// ─── Subscriptions ───

export const listSubscriptions = async ({
  maxResults = 25,
  pageToken,
}: {
  maxResults?: number
  pageToken?: string
}) => {
  const data = await callApi(() =>
    youtube.subscriptions.list({
      part: ["snippet"],
      mine: true,
      maxResults,
      pageToken,
    }),
  )
  return data
    ? ok({
        subscriptions: (data.items ?? []).map(mapSubscription),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err("failed to list subscriptions")
}

export const subscribe = async ({ channelId }: { channelId: string }) => {
  const data = await callApi(() =>
    youtube.subscriptions.insert({
      part: ["snippet"],
      requestBody: {
        snippet: { resourceId: { kind: "youtube#channel", channelId } },
      },
    }),
  )
  return data
    ? ok(mapSubscription(data))
    : err(`failed to subscribe to channel ${channelId}`)
}

export const unsubscribe = async ({
  subscriptionId,
  confirm = false,
}: {
  subscriptionId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to unsubscribe (subscription ${subscriptionId})`,
    )
  }
  try {
    await youtube.subscriptions.delete({ id: subscriptionId })
    return ok({ unsubscribed: subscriptionId, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to unsubscribe ${subscriptionId}:`, errorMessage(e))
    return err(`failed to unsubscribe ${subscriptionId}`)
  }
}

// ─── Comments ───

export const listComments = async ({
  parentId,
  maxResults = 25,
  pageToken,
}: {
  parentId: string
  maxResults?: number
  pageToken?: string
}) => {
  const data = await callApi(() =>
    youtube.comments.list({
      part: ["snippet"],
      parentId,
      maxResults,
      pageToken,
    }),
  )
  return data
    ? ok({
        comments: (data.items ?? []).map(mapComment),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err(`failed to list replies for comment ${parentId}`)
}

export const replyToComment = async ({
  parentId,
  text,
}: {
  parentId: string
  text: string
}) => {
  const data = await callApi(() =>
    youtube.comments.insert({
      part: ["snippet"],
      requestBody: { snippet: { parentId, textOriginal: text } },
    }),
  )
  return data
    ? ok(mapComment(data))
    : err(`failed to reply to comment ${parentId}`)
}

export const updateComment = async ({
  commentId,
  text,
}: {
  commentId: string
  text: string
}) => {
  const data = await callApi(() =>
    youtube.comments.update({
      part: ["snippet"],
      requestBody: { id: commentId, snippet: { textOriginal: text } },
    }),
  )
  return data
    ? ok(mapComment(data))
    : err(`failed to update comment ${commentId}`)
}

export const deleteComment = async ({
  commentId,
  confirm = false,
}: {
  commentId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to permanently delete comment ${commentId}`,
    )
  }
  try {
    await youtube.comments.delete({ id: commentId })
    return ok({ deleted: commentId, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to delete comment ${commentId}:`, errorMessage(e))
    return err(`failed to delete comment ${commentId}`)
  }
}

export const setCommentModerationStatus = async ({
  commentIds,
  moderationStatus,
  banAuthor = false,
  confirm = false,
}: {
  commentIds: string[]
  moderationStatus: "heldForReview" | "published" | "rejected"
  banAuthor?: boolean
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to set moderation status "${moderationStatus}" on ${commentIds.length} comment(s) — "rejected" hides the comment from public view`,
    )
  }
  try {
    await youtube.comments.setModerationStatus({
      id: commentIds,
      moderationStatus,
      banAuthor,
    })
    return ok({ commentIds, moderationStatus, banAuthor, quotaCost: 50 })
  } catch (e) {
    console.error("Failed to set comment moderation status:", errorMessage(e))
    return err("failed to set comment moderation status")
  }
}

// ─── Comment Threads ───

export const listCommentThreads = async ({
  videoId,
  channelId,
  order = "time",
  maxResults = 25,
  pageToken,
}: {
  videoId?: string
  channelId?: string
  order?: "time" | "relevance"
  maxResults?: number
  pageToken?: string
}) => {
  const data = await callApi(() =>
    youtube.commentThreads.list({
      part: ["snippet"],
      videoId,
      allThreadsRelatedToChannelId: channelId,
      order,
      maxResults,
      pageToken,
    }),
  )
  return data
    ? ok({
        threads: (data.items ?? []).map(mapCommentThread),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err("failed to list comment threads")
}

export const createCommentThread = async ({
  videoId,
  channelId,
  text,
}: {
  videoId?: string
  channelId?: string
  text: string
}) => {
  const data = await callApi(() =>
    youtube.commentThreads.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId,
          channelId,
          topLevelComment: { snippet: { textOriginal: text } },
        },
      },
    }),
  )
  return data
    ? ok(mapCommentThread(data))
    : err("failed to create comment thread")
}

// ─── Captions ───

export const listCaptions = async ({ videoId }: { videoId: string }) => {
  const data = await callApi(() =>
    youtube.captions.list({ part: ["snippet"], videoId }),
  )
  return data
    ? ok((data.items ?? []).map(mapCaption))
    : err(`failed to list captions for video ${videoId}`)
}

export const uploadCaption = async ({
  videoId,
  filePath,
  language,
  name,
  isDraft = false,
}: {
  videoId: string
  filePath: string
  language: string
  name: string
  isDraft?: boolean
}) => {
  try {
    const res = await youtube.captions.insert({
      part: ["snippet"],
      requestBody: { snippet: { videoId, language, name, isDraft } },
      media: {
        mimeType: mimeTypeFor(filePath),
        body: createReadStream(filePath),
      },
    })
    return ok({ ...mapCaption(res.data), quotaCost: 400 })
  } catch (e) {
    console.error(
      `Failed to upload caption for video ${videoId}:`,
      errorMessage(e),
    )
    return err(`failed to upload caption for video ${videoId}`)
  }
}

export const updateCaption = async ({
  captionId,
  filePath,
  isDraft,
}: {
  captionId: string
  filePath?: string
  isDraft?: boolean
}) => {
  try {
    const res = await youtube.captions.update({
      part: ["snippet"],
      requestBody: { id: captionId, snippet: { isDraft } },
      ...(filePath
        ? {
            media: {
              mimeType: mimeTypeFor(filePath),
              body: createReadStream(filePath),
            },
          }
        : {}),
    })
    return ok({ ...mapCaption(res.data), quotaCost: 450 })
  } catch (e) {
    console.error(`Failed to update caption ${captionId}:`, errorMessage(e))
    return err(`failed to update caption ${captionId}`)
  }
}

export const downloadCaption = async ({
  captionId,
  outputPath,
  format,
  language,
}: {
  captionId: string
  outputPath: string
  format?: string
  language?: string
}) => {
  try {
    const res = await youtube.captions.download(
      { id: captionId, tfmt: format, tlang: language },
      { responseType: "stream" },
    )
    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(outputPath)
      res.data
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", reject)
    })
    return ok({ captionId, savedTo: outputPath, quotaCost: 200 })
  } catch (e) {
    console.error(`Failed to download caption ${captionId}:`, errorMessage(e))
    return err(`failed to download caption ${captionId}`)
  }
}

export const deleteCaption = async ({
  captionId,
  confirm = false,
}: {
  captionId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to permanently delete caption ${captionId}`,
    )
  }
  try {
    await youtube.captions.delete({ id: captionId })
    return ok({ deleted: captionId, quotaCost: 50 })
  } catch (e) {
    console.error(`Failed to delete caption ${captionId}:`, errorMessage(e))
    return err(`failed to delete caption ${captionId}`)
  }
}

// ─── Thumbnails ───

export const setThumbnail = async ({
  videoId,
  filePath,
}: {
  videoId: string
  filePath: string
}) => {
  try {
    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: mimeTypeFor(filePath),
        body: createReadStream(filePath),
      },
    })
    return ok({ videoId, quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to set thumbnail for video ${videoId}:`,
      errorMessage(e),
    )
    return err(`failed to set thumbnail for video ${videoId}`)
  }
}

// ─── Watermarks ───

export const setWatermark = async ({
  channelId,
  filePath,
  position = "bottomRight",
  offsetMs = "0",
  durationMs,
}: {
  channelId: string
  filePath: string
  position?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
  offsetMs?: string
  durationMs?: string
}) => {
  try {
    await youtube.watermarks.set({
      channelId,
      requestBody: {
        position: { type: "corner", cornerPosition: position },
        timing: {
          type: "offsetFromEnd",
          offsetMs,
          ...(durationMs ? { durationMs } : {}),
        },
      },
      media: {
        mimeType: mimeTypeFor(filePath),
        body: createReadStream(filePath),
      },
    })
    return ok({ channelId, quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to set watermark for channel ${channelId}:`,
      errorMessage(e),
    )
    return err(`failed to set watermark for channel ${channelId}`)
  }
}

export const unsetWatermark = async ({
  channelId,
  confirm = false,
}: {
  channelId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to remove the watermark for channel ${channelId}`,
    )
  }
  try {
    await youtube.watermarks.unset({ channelId })
    return ok({ channelId, watermarkRemoved: true, quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to unset watermark for channel ${channelId}:`,
      errorMessage(e),
    )
    return err(`failed to unset watermark for channel ${channelId}`)
  }
}

// ─── Activities ───

export const listActivities = async ({
  channelId,
  maxResults = 25,
  pageToken,
}: {
  channelId?: string
  maxResults?: number
  pageToken?: string
}) => {
  const data = await callApi(() =>
    youtube.activities.list({
      part: ["snippet", "contentDetails"],
      ...(channelId ? { channelId } : { mine: true }),
      maxResults,
      pageToken,
    }),
  )
  return data
    ? ok({
        activities: (data.items ?? []).map(mapActivity),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err("failed to list activities")
}

// ─── Playlist Images ───

export const listPlaylistImages = async ({ parent }: { parent: string }) => {
  const data = await callApi(() =>
    youtube.playlistImages.list({ part: ["snippet"], parent }),
  )
  return data
    ? ok((data.items ?? []).map(mapPlaylistImage))
    : err(`failed to list images for playlist ${parent}`)
}

export const uploadPlaylistImage = async ({
  playlistId,
  filePath,
}: {
  playlistId: string
  filePath: string
}) => {
  try {
    const res = await youtube.playlistImages.insert({
      part: ["snippet"],
      requestBody: { snippet: { playlistId } },
      media: {
        mimeType: mimeTypeFor(filePath),
        body: createReadStream(filePath),
      },
    })
    return ok({ ...mapPlaylistImage(res.data), quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to upload image for playlist ${playlistId}:`,
      errorMessage(e),
    )
    return err(`failed to upload image for playlist ${playlistId}`)
  }
}

export const updatePlaylistImage = async ({
  playlistImageId,
  filePath,
}: {
  playlistImageId: string
  filePath: string
}) => {
  try {
    const res = await youtube.playlistImages.update({
      part: ["snippet"],
      requestBody: { id: playlistImageId },
      media: {
        mimeType: mimeTypeFor(filePath),
        body: createReadStream(filePath),
      },
    })
    return ok({ ...mapPlaylistImage(res.data), quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to update playlist image ${playlistImageId}:`,
      errorMessage(e),
    )
    return err(`failed to update playlist image ${playlistImageId}`)
  }
}

export const deletePlaylistImage = async ({
  playlistImageId,
  confirm = false,
}: {
  playlistImageId: string
  confirm?: boolean
}) => {
  if (!confirm) {
    return err(
      `confirm must be true to permanently delete playlist image ${playlistImageId}`,
    )
  }
  try {
    await youtube.playlistImages.delete({ id: playlistImageId })
    return ok({ deleted: playlistImageId, quotaCost: 50 })
  } catch (e) {
    console.error(
      `Failed to delete playlist image ${playlistImageId}:`,
      errorMessage(e),
    )
    return err(`failed to delete playlist image ${playlistImageId}`)
  }
}

// ─── Reference Lists ───

export const listMembers = async ({
  maxResults = 25,
  pageToken,
  hasAccessToLevel,
  mode = "all_current",
}: {
  maxResults?: number
  pageToken?: string
  hasAccessToLevel?: string
  mode?: "all_current" | "updates"
}) => {
  const data = await callApi(() =>
    youtube.members.list({
      part: ["snippet"],
      maxResults,
      pageToken,
      hasAccessToLevel,
      mode,
    }),
  )
  return data
    ? ok({
        members: (data.items ?? []).map(mapMember),
        nextPageToken: data.nextPageToken ?? null,
      })
    : err(
        "failed to list channel members — requires an active YouTube Partner Program channel with memberships enabled",
      )
}

export const listMembershipLevels = async () => {
  const data = await callApi(() =>
    youtube.membershipsLevels.list({ part: ["snippet"] }),
  )
  return data
    ? ok((data.items ?? []).map(mapMembershipsLevel))
    : err(
        "failed to list membership levels — requires an active YouTube Partner Program channel with memberships enabled",
      )
}

export const listVideoCategories = async ({
  regionCode = "US",
}: {
  regionCode?: string
}) => {
  const data = await callApi(() =>
    youtube.videoCategories.list({ part: ["snippet"], regionCode }),
  )
  return data
    ? ok((data.items ?? []).map(mapVideoCategory))
    : err(`failed to list video categories for region ${regionCode}`)
}

export const listI18nLanguages = async () => {
  const data = await callApi(() =>
    youtube.i18nLanguages.list({ part: ["snippet"] }),
  )
  return data
    ? ok((data.items ?? []).map(mapI18nLanguage))
    : err("failed to list i18n languages")
}

export const listI18nRegions = async () => {
  const data = await callApi(() =>
    youtube.i18nRegions.list({ part: ["snippet"] }),
  )
  return data
    ? ok((data.items ?? []).map(mapI18nRegion))
    : err("failed to list i18n regions")
}

export const listVideoAbuseReportReasons = async () => {
  const data = await callApi(() =>
    youtube.videoAbuseReportReasons.list({ part: ["snippet"] }),
  )
  return data
    ? ok((data.items ?? []).map(mapVideoAbuseReportReason))
    : err("failed to list video abuse report reasons")
}

const server = new McpServer({ name: "youtube", version: "0.1.2" })

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

server.registerTool(
  "update-playlist",
  {
    description:
      "Rename, re-describe, or change the privacy of a playlist. Full-replace on the snippet/status parts — reads the current playlist first so omitted fields aren't blanked. Costs 50 quota units.",
    inputSchema: {
      playlistId: z.string().describe("Playlist ID"),
      title: z.string().optional().describe("New title (unchanged if omitted)"),
      description: z
        .string()
        .optional()
        .describe("New description (unchanged if omitted)"),
      privacyStatus: z
        .enum(["private", "unlisted", "public"])
        .optional()
        .describe("New visibility (unchanged if omitted)"),
    },
  },
  updatePlaylist,
)

// ─── Playlist Items ───
server.registerTool(
  "update-playlist-item",
  {
    description:
      "Move a playlist item to a new position (reorder). Costs 50 quota units.",
    inputSchema: {
      playlistItemId: z.string().describe("Playlist item ID to move"),
      playlistId: z.string().describe("Playlist ID the item belongs to"),
      videoId: z.string().describe("Video ID of the item"),
      position: z
        .number()
        .min(0)
        .describe("New zero-based position in the playlist"),
    },
  },
  updatePlaylistItem,
)

// ─── Videos ───
server.registerTool(
  "list-videos",
  {
    description:
      "Fetch metadata, status, and statistics for up to 50 videos by ID. Costs 1 quota unit per call.",
    inputSchema: {
      videoIds: z.array(z.string()).min(1).max(50).describe("Video IDs"),
    },
  },
  listVideos,
)

server.registerTool(
  "update-video",
  {
    description:
      "Update a video's title, description, category, tags, privacy, and related status flags. Full-replace on the snippet/status parts — reads the current video first so omitted fields aren't blanked. Costs 50 quota units.",
    inputSchema: {
      videoId: z.string().describe("Video ID"),
      title: z.string().optional().describe("New title (unchanged if omitted)"),
      description: z
        .string()
        .optional()
        .describe("New description (unchanged if omitted)"),
      categoryId: z
        .string()
        .optional()
        .describe("New video category ID (unchanged if omitted)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("New tag list, replaces all tags (unchanged if omitted)"),
      privacyStatus: z
        .enum(["private", "unlisted", "public"])
        .optional()
        .describe("New visibility (unchanged if omitted)"),
      embeddable: z
        .boolean()
        .optional()
        .describe("Whether the video can be embedded (unchanged if omitted)"),
      license: z
        .enum(["youtube", "creativeCommon"])
        .optional()
        .describe("Video licence (unchanged if omitted)"),
      publicStatsViewable: z
        .boolean()
        .optional()
        .describe("Whether public stats are viewable (unchanged if omitted)"),
      selfDeclaredMadeForKids: z
        .boolean()
        .optional()
        .describe("Self-declared made-for-kids flag (unchanged if omitted)"),
    },
  },
  updateVideo,
)

server.registerTool(
  "rate-video",
  {
    description:
      "Like, dislike, or clear your rating on a video. Costs 50 quota units.",
    inputSchema: {
      videoId: z.string().describe("Video ID"),
      rating: z.enum(["like", "dislike", "none"]).describe("Rating to apply"),
    },
  },
  rateVideo,
)

server.registerTool(
  "get-video-rating",
  {
    description:
      "Get the authenticated user's rating (like/dislike/none) for up to 50 videos. Costs 1 quota unit per call.",
    inputSchema: {
      videoIds: z.array(z.string()).min(1).max(50).describe("Video IDs"),
    },
  },
  getVideoRating,
)

server.registerTool(
  "delete-video",
  {
    description:
      "Permanently delete a video you own. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      videoId: z.string().describe("Video ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually delete"),
    },
  },
  deleteVideo,
)

server.registerTool(
  "upload-video",
  {
    description:
      "Upload a video from a local file path via resumable upload. This is the most expensive tool in the server — costs 1600 quota units, 16% of the default daily budget.",
    inputSchema: {
      filePath: z.string().describe("Absolute local path to the video file"),
      title: z.string().describe("Video title"),
      description: z.string().default("").describe("Video description"),
      categoryId: z
        .string()
        .default("22")
        .describe("Video category ID (default 22 = People & Blogs)"),
      tags: z.array(z.string()).optional().describe("Video tags"),
      privacyStatus: z
        .enum(["private", "unlisted", "public"])
        .default("private")
        .describe("Video visibility"),
    },
  },
  uploadVideo,
)

server.registerTool(
  "report-video-abuse",
  {
    description:
      "Report a video to YouTube for abuse/policy violation. Costs 50 quota units. Irreversible outward action — requires confirm: true.",
    inputSchema: {
      videoId: z.string().describe("Video ID to report"),
      reasonId: z
        .string()
        .describe(
          "Abuse reason ID — fetch valid values with list-video-abuse-report-reasons",
        ),
      secondaryReasonId: z
        .string()
        .optional()
        .describe("Secondary reason ID, if the reason supports one"),
      comments: z.string().optional().describe("Additional free-text comments"),
      language: z
        .string()
        .optional()
        .describe("Language of the comments (e.g. en)"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually report"),
    },
  },
  reportVideoAbuse,
)

// ─── Channels ───
server.registerTool(
  "update-channel",
  {
    description:
      "Update your channel's branding metadata (title, description, keywords, trailer, language, country). Full-replace on the brandingSettings part — reads the current settings first so omitted fields aren't blanked. Costs 50 quota units.",
    inputSchema: {
      channelId: z.string().describe("Channel ID"),
      title: z
        .string()
        .optional()
        .describe("New channel display title (unchanged if omitted)"),
      description: z
        .string()
        .optional()
        .describe("New channel description (unchanged if omitted)"),
      keywords: z
        .string()
        .optional()
        .describe("Space-separated keywords (unchanged if omitted)"),
      unsubscribedTrailer: z
        .string()
        .optional()
        .describe(
          "Video ID to feature for non-subscribers (unchanged if omitted)",
        ),
      defaultLanguage: z
        .string()
        .optional()
        .describe("Default metadata language (unchanged if omitted)"),
      country: z
        .string()
        .optional()
        .describe("Channel country (unchanged if omitted)"),
    },
  },
  updateChannel,
)

server.registerTool(
  "list-channels",
  {
    description:
      "List the authenticated user's own channel(s) with snippet, statistics, and status. Costs 1 quota unit per call.",
    inputSchema: {},
  },
  listChannels,
)

// ─── Channel Sections ───
server.registerTool(
  "list-channel-sections",
  {
    description:
      "List channel sections (the shelves shown on a channel's homepage) for a channel, or your own if channelId is omitted. Costs 1 quota unit per call.",
    inputSchema: {
      channelId: z
        .string()
        .optional()
        .describe(
          "Channel ID to list; defaults to the authenticated user's channel",
        ),
    },
  },
  listChannelSections,
)

server.registerTool(
  "create-channel-section",
  {
    description:
      "Create a new channel section (homepage shelf). Costs 50 quota units.",
    inputSchema: {
      type: z
        .string()
        .describe(
          "Section content type, e.g. singlePlaylist, multiplePlaylists, allPlaylists, multipleChannels",
        ),
      title: z
        .string()
        .optional()
        .describe("Section title (required for multi-item types)"),
      style: z
        .enum(["horizontalRow", "verticalList"])
        .default("horizontalRow")
        .describe("Section layout style"),
      position: z
        .number()
        .min(0)
        .optional()
        .describe("Zero-based position on the channel page"),
      playlistIds: z
        .array(z.string())
        .optional()
        .describe("Playlist IDs, for playlist-type sections"),
      channelIds: z
        .array(z.string())
        .optional()
        .describe("Channel IDs, for multipleChannels-type sections"),
    },
  },
  createChannelSection,
)

server.registerTool(
  "update-channel-section",
  {
    description:
      "Update an existing channel section. Full-replace on the snippet/contentDetails parts — reads the current section first so omitted fields aren't blanked. Costs 50 quota units.",
    inputSchema: {
      channelSectionId: z.string().describe("Channel section ID"),
      type: z
        .string()
        .optional()
        .describe("New content type (unchanged if omitted)"),
      title: z.string().optional().describe("New title (unchanged if omitted)"),
      style: z
        .enum(["horizontalRow", "verticalList"])
        .optional()
        .describe("New layout style (unchanged if omitted)"),
      position: z
        .number()
        .min(0)
        .optional()
        .describe("New position (unchanged if omitted)"),
      playlistIds: z
        .array(z.string())
        .optional()
        .describe("New playlist ID list (unchanged if omitted)"),
      channelIds: z
        .array(z.string())
        .optional()
        .describe("New channel ID list (unchanged if omitted)"),
    },
  },
  updateChannelSection,
)

server.registerTool(
  "delete-channel-section",
  {
    description:
      "Permanently delete a channel section. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      channelSectionId: z.string().describe("Channel section ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually delete"),
    },
  },
  deleteChannelSection,
)

// ─── Subscriptions ───
server.registerTool(
  "list-subscriptions",
  {
    description:
      "List the authenticated user's channel subscriptions. Costs 1 quota unit per call.",
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
  listSubscriptions,
)

server.registerTool(
  "subscribe",
  {
    description: "Subscribe to a channel. Costs 50 quota units.",
    inputSchema: {
      channelId: z.string().describe("Channel ID to subscribe to"),
    },
  },
  subscribe,
)

server.registerTool(
  "unsubscribe",
  {
    description:
      "Unsubscribe from a channel. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      subscriptionId: z
        .string()
        .describe(
          "Subscription ID (from list-subscriptions), not the channel ID",
        ),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually unsubscribe"),
    },
  },
  unsubscribe,
)

// ─── Comments ───
server.registerTool(
  "list-comments",
  {
    description:
      "List replies under a top-level comment. Costs 1 quota unit per call.",
    inputSchema: {
      parentId: z.string().describe("Parent (top-level) comment ID"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("Max results (1-100)"),
      pageToken: z
        .string()
        .optional()
        .describe("Page token from a previous call"),
    },
  },
  listComments,
)

server.registerTool(
  "reply-to-comment",
  {
    description:
      "Reply to an existing top-level comment. Costs 50 quota units.",
    inputSchema: {
      parentId: z.string().describe("Top-level comment ID to reply to"),
      text: z.string().describe("Reply text"),
    },
  },
  replyToComment,
)

server.registerTool(
  "update-comment",
  {
    description: "Edit the text of a comment you posted. Costs 50 quota units.",
    inputSchema: {
      commentId: z.string().describe("Comment ID"),
      text: z.string().describe("New comment text"),
    },
  },
  updateComment,
)

server.registerTool(
  "delete-comment",
  {
    description:
      "Permanently delete a comment. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      commentId: z.string().describe("Comment ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually delete"),
    },
  },
  deleteComment,
)

server.registerTool(
  "set-comment-moderation-status",
  {
    description:
      "Set the moderation status of one or more comments on your videos — publish, hold for review, or reject (hide from public view; the current replacement for the removed markAsSpam method). Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      commentIds: z
        .array(z.string())
        .min(1)
        .describe("Comment IDs to moderate"),
      moderationStatus: z
        .enum(["heldForReview", "published", "rejected"])
        .describe("Status to apply"),
      banAuthor: z
        .boolean()
        .default(false)
        .describe("Also ban the author from commenting on your channel"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually apply the moderation status"),
    },
  },
  setCommentModerationStatus,
)

// ─── Comment Threads ───
server.registerTool(
  "list-comment-threads",
  {
    description:
      "List top-level comment threads for a video or channel. Costs 1 quota unit per call.",
    inputSchema: {
      videoId: z.string().optional().describe("Video ID to list threads for"),
      channelId: z
        .string()
        .optional()
        .describe("Channel ID to list threads for (all videos on the channel)"),
      order: z
        .enum(["time", "relevance"])
        .default("time")
        .describe("Sort order"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("Max results (1-100)"),
      pageToken: z
        .string()
        .optional()
        .describe("Page token from a previous call"),
    },
  },
  listCommentThreads,
)

server.registerTool(
  "create-comment-thread",
  {
    description:
      "Post a new top-level comment on a video or channel. Costs 50 quota units.",
    inputSchema: {
      videoId: z.string().optional().describe("Video ID to comment on"),
      channelId: z.string().optional().describe("Channel ID to comment on"),
      text: z.string().describe("Comment text"),
    },
  },
  createCommentThread,
)

// ─── Captions ───
server.registerTool(
  "list-captions",
  {
    description: "List caption tracks for a video. Costs 50 quota units.",
    inputSchema: {
      videoId: z.string().describe("Video ID"),
    },
  },
  listCaptions,
)

server.registerTool(
  "upload-caption",
  {
    description:
      "Upload a new caption track from a local file (SRT/VTT/SBV/TTML). Costs 400 quota units.",
    inputSchema: {
      videoId: z.string().describe("Video ID"),
      filePath: z.string().describe("Absolute local path to the caption file"),
      language: z.string().describe("BCP-47 language code, e.g. en"),
      name: z.string().describe("Track name shown to viewers"),
      isDraft: z
        .boolean()
        .default(false)
        .describe("Whether the track is unpublished"),
    },
  },
  uploadCaption,
)

server.registerTool(
  "update-caption",
  {
    description:
      "Update a caption track's draft status, optionally re-uploading its file from a local path. Costs 450 quota units.",
    inputSchema: {
      captionId: z.string().describe("Caption track ID"),
      filePath: z
        .string()
        .optional()
        .describe("Absolute local path to replace the track's content"),
      isDraft: z
        .boolean()
        .optional()
        .describe("Whether the track is unpublished"),
    },
  },
  updateCaption,
)

server.registerTool(
  "download-caption",
  {
    description:
      "Download a caption track to a local file path. Costs 200 quota units.",
    inputSchema: {
      captionId: z.string().describe("Caption track ID"),
      outputPath: z
        .string()
        .describe("Absolute local path to write the caption file to"),
      format: z
        .string()
        .optional()
        .describe("Caption format to convert to, e.g. srt, vtt, ttml"),
      language: z
        .string()
        .optional()
        .describe("Language to translate the track to"),
    },
  },
  downloadCaption,
)

server.registerTool(
  "delete-caption",
  {
    description:
      "Permanently delete a caption track. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      captionId: z.string().describe("Caption track ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually delete"),
    },
  },
  deleteCaption,
)

// ─── Thumbnails ───
server.registerTool(
  "set-thumbnail",
  {
    description:
      "Upload and set a video's custom thumbnail from a local image file. Costs 50 quota units.",
    inputSchema: {
      videoId: z.string().describe("Video ID"),
      filePath: z
        .string()
        .describe("Absolute local path to the thumbnail image"),
    },
  },
  setThumbnail,
)

// ─── Watermarks ───
server.registerTool(
  "set-watermark",
  {
    description:
      "Upload and set a channel's video watermark from a local image file. Costs 50 quota units.",
    inputSchema: {
      channelId: z.string().describe("Channel ID"),
      filePath: z
        .string()
        .describe("Absolute local path to the watermark image"),
      position: z
        .enum(["topLeft", "topRight", "bottomLeft", "bottomRight"])
        .default("bottomRight")
        .describe("Corner to display the watermark in"),
      offsetMs: z
        .string()
        .default("0")
        .describe("Offset in milliseconds from the timing anchor"),
      durationMs: z
        .string()
        .optional()
        .describe("How long the watermark displays, in milliseconds"),
    },
  },
  setWatermark,
)

server.registerTool(
  "unset-watermark",
  {
    description:
      "Remove a channel's video watermark. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      channelId: z.string().describe("Channel ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually remove"),
    },
  },
  unsetWatermark,
)

// ─── Activities ───
server.registerTool(
  "list-activities",
  {
    description:
      "List recent channel activity (uploads, likes, playlist additions, etc.) for a channel, or your own if channelId is omitted. Costs 1 quota unit per call.",
    inputSchema: {
      channelId: z
        .string()
        .optional()
        .describe(
          "Channel ID to list activity for; defaults to the authenticated user's channel",
        ),
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
  listActivities,
)

// ─── Playlist Images ───
server.registerTool(
  "list-playlist-images",
  {
    description:
      "List cover images for a playlist. Costs 1 quota unit per call.",
    inputSchema: {
      parent: z.string().describe("Playlist ID"),
    },
  },
  listPlaylistImages,
)

server.registerTool(
  "upload-playlist-image",
  {
    description:
      "Upload a cover image for a playlist from a local file. Costs 50 quota units.",
    inputSchema: {
      playlistId: z.string().describe("Playlist ID"),
      filePath: z.string().describe("Absolute local path to the image file"),
    },
  },
  uploadPlaylistImage,
)

server.registerTool(
  "update-playlist-image",
  {
    description: "Replace a playlist cover image's file. Costs 50 quota units.",
    inputSchema: {
      playlistImageId: z.string().describe("Playlist image ID"),
      filePath: z
        .string()
        .describe("Absolute local path to the replacement image file"),
    },
  },
  updatePlaylistImage,
)

server.registerTool(
  "delete-playlist-image",
  {
    description:
      "Permanently delete a playlist cover image. Costs 50 quota units. Requires confirm: true.",
    inputSchema: {
      playlistImageId: z.string().describe("Playlist image ID"),
      confirm: z
        .boolean()
        .default(false)
        .describe("Must be true to actually delete"),
    },
  },
  deletePlaylistImage,
)

// ─── Reference Lists ───
server.registerTool(
  "list-members",
  {
    description:
      "List members of your channel's memberships program. Costs 1 quota unit per call. MONETISATION-GATED: 403s unless the channel is an active YouTube Partner Program channel with memberships enabled.",
    inputSchema: {
      maxResults: z
        .number()
        .min(1)
        .max(1000)
        .default(25)
        .describe("Max results (1-1000)"),
      pageToken: z
        .string()
        .optional()
        .describe("Page token from a previous call"),
      hasAccessToLevel: z
        .string()
        .optional()
        .describe("Filter to members with access to this membership level ID"),
      mode: z
        .enum(["all_current", "updates"])
        .default("all_current")
        .describe(
          "all_current lists current members; updates lists recent changes",
        ),
    },
  },
  listMembers,
)

server.registerTool(
  "list-membership-levels",
  {
    description:
      "List your channel's membership pricing levels. Costs 1 quota unit per call. MONETISATION-GATED: 403s unless the channel is an active YouTube Partner Program channel with memberships enabled.",
    inputSchema: {},
  },
  listMembershipLevels,
)

server.registerTool(
  "list-video-categories",
  {
    description:
      "List assignable video categories for a region. Costs 1 quota unit per call.",
    inputSchema: {
      regionCode: z
        .string()
        .default("US")
        .describe("ISO 3166-1 alpha-2 region code"),
    },
  },
  listVideoCategories,
)

server.registerTool(
  "list-i18n-languages",
  {
    description:
      "List the application languages supported by YouTube. Costs 1 quota unit per call.",
    inputSchema: {},
  },
  listI18nLanguages,
)

server.registerTool(
  "list-i18n-regions",
  {
    description:
      "List the content regions supported by YouTube. Costs 1 quota unit per call.",
    inputSchema: {},
  },
  listI18nRegions,
)

server.registerTool(
  "list-video-abuse-report-reasons",
  {
    description:
      "List the reason IDs accepted by report-video-abuse. Costs 1 quota unit per call.",
    inputSchema: {},
  },
  listVideoAbuseReportReasons,
)

const main = async () => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error(
      "Missing YouTube OAuth credentials — set MCP_YOUTUBE_CLIENT_ID / MCP_YOUTUBE_CLIENT_SECRET / MCP_YOUTUBE_REFRESH_TOKEN in the environment (run `npm run setup` to mint a refresh token)",
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
