import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { Readable } from "stream"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.MCP_YOUTUBE_CLIENT_ID = "test-client-id"
  process.env.MCP_YOUTUBE_CLIENT_SECRET = "test-client-secret"
  process.env.MCP_YOUTUBE_REFRESH_TOKEN = "test-refresh-token"
})

// createReadStream is mocked to an in-memory stream — media.body is never
// actually consumed by the mocked googleapis client, and fs.createReadStream
// opens its fd asynchronously, so a real file can race afterAll's cleanup
// and throw an unhandled ENOENT after the test that used it has finished.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>()
  return {
    ...actual,
    createReadStream: vi.fn(() =>
      Readable.from(["fixture-bytes"]),
    ) as unknown as typeof actual.createReadStream,
  }
})

const { youtubeMock } = vi.hoisted(() => {
  const youtubeMock = {
    search: { list: vi.fn() },
    playlists: {
      list: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    playlistItems: {
      list: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    videos: {
      list: vi.fn(),
      update: vi.fn(),
      rate: vi.fn(),
      getRating: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
      reportAbuse: vi.fn(),
    },
    channels: { list: vi.fn(), update: vi.fn() },
    channelSections: {
      list: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    subscriptions: { list: vi.fn(), insert: vi.fn(), delete: vi.fn() },
    comments: {
      list: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      setModerationStatus: vi.fn(),
    },
    commentThreads: { list: vi.fn(), insert: vi.fn() },
    captions: {
      list: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    },
    thumbnails: { set: vi.fn() },
    watermarks: { set: vi.fn(), unset: vi.fn() },
    activities: { list: vi.fn() },
    playlistImages: {
      list: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    members: { list: vi.fn() },
    membershipsLevels: { list: vi.fn() },
    videoCategories: { list: vi.fn() },
    i18nLanguages: { list: vi.fn() },
    i18nRegions: { list: vi.fn() },
    videoAbuseReportReasons: { list: vi.fn() },
  }
  return { youtubeMock }
})

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = vi.fn()
      },
    },
    youtube: vi.fn(() => youtubeMock),
  },
}))

import {
  addToPlaylist,
  cleanPlaylist,
  createChannelSection,
  createCommentThread,
  createPlaylist,
  deleteCaption,
  deleteChannelSection,
  deleteComment,
  deletePlaylist,
  deletePlaylistImage,
  deleteVideo,
  downloadCaption,
  getPlaylist,
  getVideoRating,
  listActivities,
  listCaptions,
  listChannels,
  listChannelSections,
  listComments,
  listCommentThreads,
  listI18nLanguages,
  listI18nRegions,
  listMembers,
  listMembershipLevels,
  listPlaylistImages,
  listPlaylists,
  listSubscriptions,
  listVideoAbuseReportReasons,
  listVideoCategories,
  listVideos,
  rateVideo,
  removeFromPlaylist,
  replyToComment,
  reportVideoAbuse,
  search,
  setCommentModerationStatus,
  setThumbnail,
  setWatermark,
  subscribe,
  unsetWatermark,
  unsubscribe,
  updateCaption,
  updateChannel,
  updateChannelSection,
  updateComment,
  updatePlaylist,
  updatePlaylistImage,
  updatePlaylistItem,
  updateVideo,
  uploadCaption,
  uploadPlaylistImage,
  uploadVideo,
} from "../index.js"

beforeEach(() => {
  vi.clearAllMocks()
})

const text = (result: { content: Array<{ text: string }> }) =>
  result.content[0].text

const testDir = mkdtempSync(join(tmpdir(), "mcp-youtube-test-"))
const testFilePath = join(testDir, "fixture.mp4")

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe("search", () => {
  it("returns mapped results on success", async () => {
    youtubeMock.search.list.mockResolvedValue({
      data: {
        items: [
          {
            id: { videoId: "abc123" },
            snippet: {
              title: "Test Video",
              channelTitle: "Chan",
              publishedAt: "2024-01-01T00:00:00Z",
              description: "desc",
            },
          },
        ],
      },
    })
    const result = await search({ query: "test" })
    expect(text(result)).toContain("Test Video")
    expect(text(result)).toContain("abc123")
    expect(youtubeMock.search.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: "test", type: ["video"] }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.search.list.mockRejectedValue(new Error("quota exceeded"))
    const result = await search({ query: "test" })
    expect(text(result)).toContain("Error:")
  })
})

describe("listPlaylists", () => {
  it("returns mapped playlists on success", async () => {
    youtubeMock.playlists.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "pl1",
            snippet: { title: "My Playlist", description: "" },
            contentDetails: { itemCount: 3 },
            status: { privacyStatus: "private" },
          },
        ],
        nextPageToken: null,
      },
    })
    const result = await listPlaylists({})
    expect(text(result)).toContain("My Playlist")
    expect(youtubeMock.playlists.list).toHaveBeenCalledWith(
      expect.objectContaining({ mine: true }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlists.list.mockRejectedValue(new Error("boom"))
    const result = await listPlaylists({})
    expect(text(result)).toContain("Error:")
  })
})

describe("getPlaylist", () => {
  it("returns mapped items on success", async () => {
    youtubeMock.playlistItems.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "pi1",
            snippet: {
              title: "Good Video",
              resourceId: { videoId: "vid1" },
              position: 0,
            },
          },
        ],
        nextPageToken: null,
      },
    })
    const result = await getPlaylist({ playlistId: "pl1" })
    expect(text(result)).toContain("Good Video")
    expect(youtubeMock.playlistItems.list).toHaveBeenCalledWith(
      expect.objectContaining({ playlistId: "pl1" }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlistItems.list.mockRejectedValue(new Error("boom"))
    const result = await getPlaylist({ playlistId: "pl1" })
    expect(text(result)).toContain("Error:")
  })
})

describe("createPlaylist", () => {
  it("returns the created playlist on success", async () => {
    youtubeMock.playlists.insert.mockResolvedValue({
      data: {
        id: "pl2",
        snippet: { title: "New Playlist", description: "" },
        status: { privacyStatus: "private" },
      },
    })
    const result = await createPlaylist({ title: "New Playlist" })
    expect(text(result)).toContain("New Playlist")
    expect(youtubeMock.playlists.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          snippet: expect.objectContaining({ title: "New Playlist" }),
        }),
      }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlists.insert.mockRejectedValue(new Error("boom"))
    const result = await createPlaylist({ title: "New Playlist" })
    expect(text(result)).toContain("Error:")
  })
})

describe("updatePlaylist", () => {
  it("merges provided fields with the existing playlist and updates", async () => {
    youtubeMock.playlists.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "pl1",
            snippet: { title: "Old Title", description: "Old desc" },
            status: { privacyStatus: "private" },
          },
        ],
      },
    })
    youtubeMock.playlists.update.mockResolvedValue({
      data: {
        id: "pl1",
        snippet: { title: "New Title", description: "Old desc" },
        status: { privacyStatus: "private" },
      },
    })
    const result = await updatePlaylist({
      playlistId: "pl1",
      title: "New Title",
    })
    expect(text(result)).toContain("New Title")
    expect(youtubeMock.playlists.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          snippet: expect.objectContaining({
            title: "New Title",
            description: "Old desc",
          }),
        }),
      }),
    )
  })

  it("returns error when the playlist is not found", async () => {
    youtubeMock.playlists.list.mockResolvedValue({ data: { items: [] } })
    const result = await updatePlaylist({ playlistId: "pl1", title: "X" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.playlists.update).not.toHaveBeenCalled()
  })
})

describe("addToPlaylist", () => {
  it("adds all videos on success", async () => {
    youtubeMock.playlistItems.insert.mockResolvedValue({ data: {} })
    const result = await addToPlaylist({
      playlistId: "pl1",
      videoIds: ["vid1", "vid2"],
    })
    expect(text(result)).toContain('"added"')
    expect(text(result)).toContain("vid1")
    expect(youtubeMock.playlistItems.insert).toHaveBeenCalledTimes(2)
  })

  it("returns error when every add fails", async () => {
    youtubeMock.playlistItems.insert.mockRejectedValue(new Error("boom"))
    const result = await addToPlaylist({
      playlistId: "pl1",
      videoIds: ["vid1"],
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("removeFromPlaylist", () => {
  it("refuses to remove without confirm", async () => {
    const result = await removeFromPlaylist({ playlistItemIds: ["pi1"] })
    expect(text(result)).toContain("Error:")
    expect(text(result)).toContain("confirm")
    expect(youtubeMock.playlistItems.delete).not.toHaveBeenCalled()
  })

  it("removes items when confirmed", async () => {
    youtubeMock.playlistItems.delete.mockResolvedValue({ data: {} })
    const result = await removeFromPlaylist({
      playlistItemIds: ["pi1"],
      confirm: true,
    })
    expect(text(result)).toContain("pi1")
    expect(youtubeMock.playlistItems.delete).toHaveBeenCalledWith({ id: "pi1" })
  })
})

describe("deletePlaylist", () => {
  it("refuses to delete without confirm", async () => {
    const result = await deletePlaylist({ playlistId: "pl1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.playlists.delete).not.toHaveBeenCalled()
  })

  it("deletes the playlist when confirmed", async () => {
    youtubeMock.playlists.delete.mockResolvedValue({ data: {} })
    const result = await deletePlaylist({ playlistId: "pl1", confirm: true })
    expect(text(result)).toContain("pl1")
    expect(youtubeMock.playlists.delete).toHaveBeenCalledWith({ id: "pl1" })
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlists.delete.mockRejectedValue(new Error("boom"))
    const result = await deletePlaylist({ playlistId: "pl1", confirm: true })
    expect(text(result)).toContain("Error:")
  })
})

describe("cleanPlaylist", () => {
  const scanItems = [
    {
      id: "pi-tombstone",
      snippet: {
        title: "Deleted video",
        resourceId: { videoId: "vidDead" },
        position: 0,
      },
    },
    {
      id: "pi-good",
      snippet: {
        title: "Good Video",
        resourceId: { videoId: "vidGood" },
        position: 1,
        videoOwnerChannelId: "chanA",
      },
    },
  ]

  it("defaults to dry-run and does not delete anything", async () => {
    youtubeMock.playlistItems.list.mockResolvedValue({
      data: { items: scanItems, nextPageToken: null },
    })
    const result = await cleanPlaylist({ playlistId: "pl1" })
    expect(text(result)).toContain('"dryRun": true')
    expect(text(result)).toContain("pi-tombstone")
    expect(youtubeMock.playlistItems.delete).not.toHaveBeenCalled()
  })

  it("deletes only the flagged items when dryRun is false", async () => {
    youtubeMock.playlistItems.list.mockResolvedValue({
      data: { items: scanItems, nextPageToken: null },
    })
    youtubeMock.playlistItems.delete.mockResolvedValue({ data: {} })
    const result = await cleanPlaylist({ playlistId: "pl1", dryRun: false })
    expect(text(result)).toContain('"deleted": 1')
    expect(youtubeMock.playlistItems.delete).toHaveBeenCalledTimes(1)
    expect(youtubeMock.playlistItems.delete).toHaveBeenCalledWith({
      id: "pi-tombstone",
    })
  })

  it("dedupes and prunes by channel when requested", async () => {
    youtubeMock.playlistItems.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "pi1",
            snippet: {
              title: "Video A",
              resourceId: { videoId: "vidA" },
              position: 0,
              videoOwnerChannelId: "chanA",
            },
          },
          {
            id: "pi2",
            snippet: {
              title: "Video A dup",
              resourceId: { videoId: "vidA" },
              position: 1,
              videoOwnerChannelId: "chanA",
            },
          },
          {
            id: "pi3",
            snippet: {
              title: "Video B",
              resourceId: { videoId: "vidB" },
              position: 2,
              videoOwnerChannelId: "chanB",
            },
          },
        ],
        nextPageToken: null,
      },
    })
    const result = await cleanPlaylist({
      playlistId: "pl1",
      removeTombstones: false,
      dedupe: true,
      pruneChannelIds: ["chanB"],
    })
    expect(text(result)).toContain('"plannedDeletes": 2')
    expect(text(result)).toContain("pi2")
    expect(text(result)).toContain("pi3")
  })

  it("returns error when the scan fails", async () => {
    youtubeMock.playlistItems.list.mockRejectedValue(new Error("boom"))
    const result = await cleanPlaylist({ playlistId: "pl1" })
    expect(text(result)).toContain("Error:")
  })
})

describe("updatePlaylistItem", () => {
  it("moves the item to the given position", async () => {
    youtubeMock.playlistItems.update.mockResolvedValue({
      data: {
        id: "pi1",
        snippet: { resourceId: { videoId: "vid1" }, position: 3 },
      },
    })
    const result = await updatePlaylistItem({
      playlistItemId: "pi1",
      playlistId: "pl1",
      videoId: "vid1",
      position: 3,
    })
    expect(text(result)).toContain('"position": 3')
    expect(youtubeMock.playlistItems.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          id: "pi1",
          snippet: expect.objectContaining({ playlistId: "pl1", position: 3 }),
        }),
      }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlistItems.update.mockRejectedValue(new Error("boom"))
    const result = await updatePlaylistItem({
      playlistItemId: "pi1",
      playlistId: "pl1",
      videoId: "vid1",
      position: 3,
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("listVideos", () => {
  it("returns mapped videos on success", async () => {
    youtubeMock.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "vid1",
            snippet: { title: "A Video", channelId: "chan1" },
            status: { privacyStatus: "public" },
            statistics: { viewCount: "10" },
          },
        ],
      },
    })
    const result = await listVideos({ videoIds: ["vid1"] })
    expect(text(result)).toContain("A Video")
    expect(youtubeMock.videos.list).toHaveBeenCalledWith(
      expect.objectContaining({ id: ["vid1"] }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.videos.list.mockRejectedValue(new Error("boom"))
    const result = await listVideos({ videoIds: ["vid1"] })
    expect(text(result)).toContain("Error:")
  })
})

describe("updateVideo", () => {
  it("merges provided fields with the existing video and updates", async () => {
    youtubeMock.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "vid1",
            snippet: { title: "Old Title", categoryId: "22", tags: ["a"] },
            status: { privacyStatus: "private" },
          },
        ],
      },
    })
    youtubeMock.videos.update.mockResolvedValue({
      data: {
        id: "vid1",
        snippet: { title: "New Title", categoryId: "22", tags: ["a"] },
        status: { privacyStatus: "private" },
      },
    })
    const result = await updateVideo({ videoId: "vid1", title: "New Title" })
    expect(text(result)).toContain("New Title")
    expect(youtubeMock.videos.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          snippet: expect.objectContaining({
            title: "New Title",
            categoryId: "22",
          }),
        }),
      }),
    )
  })

  it("returns error when the video is not found", async () => {
    youtubeMock.videos.list.mockResolvedValue({ data: { items: [] } })
    const result = await updateVideo({ videoId: "vid1", title: "X" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.videos.update).not.toHaveBeenCalled()
  })
})

describe("rateVideo", () => {
  it("rates the video", async () => {
    youtubeMock.videos.rate.mockResolvedValue({ data: {} })
    const result = await rateVideo({ videoId: "vid1", rating: "like" })
    expect(text(result)).toContain('"rating": "like"')
    expect(youtubeMock.videos.rate).toHaveBeenCalledWith({
      id: "vid1",
      rating: "like",
    })
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.videos.rate.mockRejectedValue(new Error("boom"))
    const result = await rateVideo({ videoId: "vid1", rating: "like" })
    expect(text(result)).toContain("Error:")
  })
})

describe("getVideoRating", () => {
  it("returns the rating for each video", async () => {
    youtubeMock.videos.getRating.mockResolvedValue({
      data: { items: [{ videoId: "vid1", rating: "like" }] },
    })
    const result = await getVideoRating({ videoIds: ["vid1"] })
    expect(text(result)).toContain("like")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.videos.getRating.mockRejectedValue(new Error("boom"))
    const result = await getVideoRating({ videoIds: ["vid1"] })
    expect(text(result)).toContain("Error:")
  })
})

describe("deleteVideo", () => {
  it("refuses to delete without confirm", async () => {
    const result = await deleteVideo({ videoId: "vid1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.videos.delete).not.toHaveBeenCalled()
  })

  it("deletes the video when confirmed", async () => {
    youtubeMock.videos.delete.mockResolvedValue({ data: {} })
    const result = await deleteVideo({ videoId: "vid1", confirm: true })
    expect(text(result)).toContain("vid1")
    expect(youtubeMock.videos.delete).toHaveBeenCalledWith({ id: "vid1" })
  })
})

describe("uploadVideo", () => {
  it("uploads the video from the given file path", async () => {
    youtubeMock.videos.insert.mockResolvedValue({
      data: { id: "vid1", snippet: { title: "Uploaded" } },
    })
    const result = await uploadVideo({
      filePath: testFilePath,
      title: "Uploaded",
    })
    expect(text(result)).toContain("Uploaded")
    expect(text(result)).toContain('"quotaCost": 1600')
    expect(youtubeMock.videos.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          snippet: expect.objectContaining({ title: "Uploaded" }),
        }),
        media: expect.objectContaining({ mimeType: "video/mp4" }),
      }),
    )
  })

  it("returns error when the upload fails", async () => {
    youtubeMock.videos.insert.mockRejectedValue(new Error("boom"))
    const result = await uploadVideo({
      filePath: testFilePath,
      title: "Uploaded",
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("reportVideoAbuse", () => {
  it("refuses to report without confirm", async () => {
    const result = await reportVideoAbuse({ videoId: "vid1", reasonId: "R1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.videos.reportAbuse).not.toHaveBeenCalled()
  })

  it("reports the video when confirmed", async () => {
    youtubeMock.videos.reportAbuse.mockResolvedValue({ data: {} })
    const result = await reportVideoAbuse({
      videoId: "vid1",
      reasonId: "R1",
      confirm: true,
    })
    expect(text(result)).toContain("vid1")
    expect(youtubeMock.videos.reportAbuse).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          videoId: "vid1",
          reasonId: "R1",
        }),
      }),
    )
  })
})

describe("updateChannel", () => {
  it("merges provided fields with the existing branding settings", async () => {
    youtubeMock.channels.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "chan1",
            brandingSettings: { channel: { title: "Old", keywords: "kw" } },
          },
        ],
      },
    })
    youtubeMock.channels.update.mockResolvedValue({
      data: { id: "chan1", snippet: { title: "New" } },
    })
    const result = await updateChannel({ channelId: "chan1", title: "New" })
    expect(text(result)).toContain("chan1")
    expect(youtubeMock.channels.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          brandingSettings: expect.objectContaining({
            channel: expect.objectContaining({ title: "New", keywords: "kw" }),
          }),
        }),
      }),
    )
  })

  it("returns error when the channel is not found", async () => {
    youtubeMock.channels.list.mockResolvedValue({ data: { items: [] } })
    const result = await updateChannel({ channelId: "chan1", title: "New" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.channels.update).not.toHaveBeenCalled()
  })
})

describe("listChannels", () => {
  it("returns the authenticated user's channels", async () => {
    youtubeMock.channels.list.mockResolvedValue({
      data: { items: [{ id: "chan1", snippet: { title: "My Channel" } }] },
    })
    const result = await listChannels()
    expect(text(result)).toContain("My Channel")
    expect(youtubeMock.channels.list).toHaveBeenCalledWith(
      expect.objectContaining({ mine: true }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.channels.list.mockRejectedValue(new Error("boom"))
    const result = await listChannels()
    expect(text(result)).toContain("Error:")
  })
})

describe("listChannelSections", () => {
  it("returns mapped channel sections", async () => {
    youtubeMock.channelSections.list.mockResolvedValue({
      data: {
        items: [
          { id: "cs1", snippet: { title: "Featured", type: "recentUploads" } },
        ],
      },
    })
    const result = await listChannelSections({})
    expect(text(result)).toContain("Featured")
    expect(youtubeMock.channelSections.list).toHaveBeenCalledWith(
      expect.objectContaining({ mine: true }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.channelSections.list.mockRejectedValue(new Error("boom"))
    const result = await listChannelSections({})
    expect(text(result)).toContain("Error:")
  })
})

describe("createChannelSection", () => {
  it("creates the section", async () => {
    youtubeMock.channelSections.insert.mockResolvedValue({
      data: { id: "cs1", snippet: { type: "singlePlaylist" } },
    })
    const result = await createChannelSection({ type: "singlePlaylist" })
    expect(text(result)).toContain("cs1")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.channelSections.insert.mockRejectedValue(new Error("boom"))
    const result = await createChannelSection({ type: "singlePlaylist" })
    expect(text(result)).toContain("Error:")
  })
})

describe("updateChannelSection", () => {
  it("merges provided fields with the existing section", async () => {
    youtubeMock.channelSections.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "cs1",
            snippet: {
              type: "singlePlaylist",
              title: "Old",
              style: "horizontalRow",
            },
            contentDetails: { playlists: ["pl1"] },
          },
        ],
      },
    })
    youtubeMock.channelSections.update.mockResolvedValue({
      data: { id: "cs1", snippet: { title: "New" } },
    })
    const result = await updateChannelSection({
      channelSectionId: "cs1",
      title: "New",
    })
    expect(text(result)).toContain("cs1")
    expect(youtubeMock.channelSections.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          snippet: expect.objectContaining({
            title: "New",
            type: "singlePlaylist",
          }),
        }),
      }),
    )
  })

  it("returns error when the section is not found", async () => {
    youtubeMock.channelSections.list.mockResolvedValue({ data: { items: [] } })
    const result = await updateChannelSection({ channelSectionId: "cs1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.channelSections.update).not.toHaveBeenCalled()
  })
})

describe("deleteChannelSection", () => {
  it("refuses to delete without confirm", async () => {
    const result = await deleteChannelSection({ channelSectionId: "cs1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.channelSections.delete).not.toHaveBeenCalled()
  })

  it("deletes the section when confirmed", async () => {
    youtubeMock.channelSections.delete.mockResolvedValue({ data: {} })
    const result = await deleteChannelSection({
      channelSectionId: "cs1",
      confirm: true,
    })
    expect(text(result)).toContain("cs1")
  })
})

describe("listSubscriptions", () => {
  it("returns mapped subscriptions", async () => {
    youtubeMock.subscriptions.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "sub1",
            snippet: { title: "Chan A", resourceId: { channelId: "chan1" } },
          },
        ],
        nextPageToken: null,
      },
    })
    const result = await listSubscriptions({})
    expect(text(result)).toContain("Chan A")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.subscriptions.list.mockRejectedValue(new Error("boom"))
    const result = await listSubscriptions({})
    expect(text(result)).toContain("Error:")
  })
})

describe("subscribe", () => {
  it("subscribes to the channel", async () => {
    youtubeMock.subscriptions.insert.mockResolvedValue({
      data: { id: "sub1", snippet: { resourceId: { channelId: "chan1" } } },
    })
    const result = await subscribe({ channelId: "chan1" })
    expect(text(result)).toContain("chan1")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.subscriptions.insert.mockRejectedValue(new Error("boom"))
    const result = await subscribe({ channelId: "chan1" })
    expect(text(result)).toContain("Error:")
  })
})

describe("unsubscribe", () => {
  it("refuses to unsubscribe without confirm", async () => {
    const result = await unsubscribe({ subscriptionId: "sub1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.subscriptions.delete).not.toHaveBeenCalled()
  })

  it("unsubscribes when confirmed", async () => {
    youtubeMock.subscriptions.delete.mockResolvedValue({ data: {} })
    const result = await unsubscribe({ subscriptionId: "sub1", confirm: true })
    expect(text(result)).toContain("sub1")
  })
})

describe("listComments", () => {
  it("returns mapped replies", async () => {
    youtubeMock.comments.list.mockResolvedValue({
      data: {
        items: [{ id: "c1", snippet: { textDisplay: "Nice video" } }],
        nextPageToken: null,
      },
    })
    const result = await listComments({ parentId: "c0" })
    expect(text(result)).toContain("Nice video")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.comments.list.mockRejectedValue(new Error("boom"))
    const result = await listComments({ parentId: "c0" })
    expect(text(result)).toContain("Error:")
  })
})

describe("replyToComment", () => {
  it("posts the reply", async () => {
    youtubeMock.comments.insert.mockResolvedValue({
      data: { id: "c1", snippet: { textDisplay: "Thanks!" } },
    })
    const result = await replyToComment({ parentId: "c0", text: "Thanks!" })
    expect(text(result)).toContain("Thanks!")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.comments.insert.mockRejectedValue(new Error("boom"))
    const result = await replyToComment({ parentId: "c0", text: "Thanks!" })
    expect(text(result)).toContain("Error:")
  })
})

describe("updateComment", () => {
  it("updates the comment text", async () => {
    youtubeMock.comments.update.mockResolvedValue({
      data: { id: "c1", snippet: { textDisplay: "Edited" } },
    })
    const result = await updateComment({ commentId: "c1", text: "Edited" })
    expect(text(result)).toContain("Edited")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.comments.update.mockRejectedValue(new Error("boom"))
    const result = await updateComment({ commentId: "c1", text: "Edited" })
    expect(text(result)).toContain("Error:")
  })
})

describe("deleteComment", () => {
  it("refuses to delete without confirm", async () => {
    const result = await deleteComment({ commentId: "c1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.comments.delete).not.toHaveBeenCalled()
  })

  it("deletes the comment when confirmed", async () => {
    youtubeMock.comments.delete.mockResolvedValue({ data: {} })
    const result = await deleteComment({ commentId: "c1", confirm: true })
    expect(text(result)).toContain("c1")
  })
})

describe("setCommentModerationStatus", () => {
  it("refuses to apply without confirm", async () => {
    const result = await setCommentModerationStatus({
      commentIds: ["c1"],
      moderationStatus: "rejected",
    })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.comments.setModerationStatus).not.toHaveBeenCalled()
  })

  it("applies the moderation status when confirmed", async () => {
    youtubeMock.comments.setModerationStatus.mockResolvedValue({ data: {} })
    const result = await setCommentModerationStatus({
      commentIds: ["c1"],
      moderationStatus: "rejected",
      confirm: true,
    })
    expect(text(result)).toContain("rejected")
    expect(youtubeMock.comments.setModerationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: ["c1"], moderationStatus: "rejected" }),
    )
  })
})

describe("listCommentThreads", () => {
  it("returns mapped comment threads", async () => {
    youtubeMock.commentThreads.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "ct1",
            snippet: {
              videoId: "vid1",
              topLevelComment: { id: "c1", snippet: { textDisplay: "First!" } },
            },
          },
        ],
        nextPageToken: null,
      },
    })
    const result = await listCommentThreads({ videoId: "vid1" })
    expect(text(result)).toContain("First!")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.commentThreads.list.mockRejectedValue(new Error("boom"))
    const result = await listCommentThreads({ videoId: "vid1" })
    expect(text(result)).toContain("Error:")
  })
})

describe("createCommentThread", () => {
  it("posts a top-level comment", async () => {
    youtubeMock.commentThreads.insert.mockResolvedValue({
      data: {
        id: "ct1",
        snippet: { topLevelComment: { snippet: { textDisplay: "Nice!" } } },
      },
    })
    const result = await createCommentThread({ videoId: "vid1", text: "Nice!" })
    expect(text(result)).toContain("Nice!")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.commentThreads.insert.mockRejectedValue(new Error("boom"))
    const result = await createCommentThread({ videoId: "vid1", text: "Nice!" })
    expect(text(result)).toContain("Error:")
  })
})

describe("listCaptions", () => {
  it("returns mapped caption tracks", async () => {
    youtubeMock.captions.list.mockResolvedValue({
      data: {
        items: [{ id: "cap1", snippet: { language: "en", name: "English" } }],
      },
    })
    const result = await listCaptions({ videoId: "vid1" })
    expect(text(result)).toContain("English")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.captions.list.mockRejectedValue(new Error("boom"))
    const result = await listCaptions({ videoId: "vid1" })
    expect(text(result)).toContain("Error:")
  })
})

describe("uploadCaption", () => {
  it("uploads the caption file", async () => {
    youtubeMock.captions.insert.mockResolvedValue({
      data: { id: "cap1", snippet: { language: "en", name: "English" } },
    })
    const result = await uploadCaption({
      videoId: "vid1",
      filePath: testFilePath,
      language: "en",
      name: "English",
    })
    expect(text(result)).toContain("English")
    expect(text(result)).toContain('"quotaCost": 400')
  })

  it("returns error when the upload fails", async () => {
    youtubeMock.captions.insert.mockRejectedValue(new Error("boom"))
    const result = await uploadCaption({
      videoId: "vid1",
      filePath: testFilePath,
      language: "en",
      name: "English",
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("updateCaption", () => {
  it("updates the caption track", async () => {
    youtubeMock.captions.update.mockResolvedValue({
      data: { id: "cap1", snippet: { isDraft: false } },
    })
    const result = await updateCaption({ captionId: "cap1", isDraft: false })
    expect(text(result)).toContain("cap1")
    expect(text(result)).toContain('"quotaCost": 450')
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.captions.update.mockRejectedValue(new Error("boom"))
    const result = await updateCaption({ captionId: "cap1", isDraft: false })
    expect(text(result)).toContain("Error:")
  })
})

describe("downloadCaption", () => {
  it("downloads the caption track to the given path", async () => {
    const outputPath = join(testDir, "output.srt")
    youtubeMock.captions.download.mockResolvedValue({
      data: Readable.from(["1\n00:00:00,000 --> 00:00:01,000\nHello\n"]),
    })
    const result = await downloadCaption({ captionId: "cap1", outputPath })
    expect(text(result)).toContain(outputPath)
    expect(youtubeMock.captions.download).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cap1" }),
      { responseType: "stream" },
    )
  })

  it("returns error when the download fails", async () => {
    youtubeMock.captions.download.mockRejectedValue(new Error("boom"))
    const result = await downloadCaption({
      captionId: "cap1",
      outputPath: join(testDir, "fail.srt"),
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("deleteCaption", () => {
  it("refuses to delete without confirm", async () => {
    const result = await deleteCaption({ captionId: "cap1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.captions.delete).not.toHaveBeenCalled()
  })

  it("deletes the caption when confirmed", async () => {
    youtubeMock.captions.delete.mockResolvedValue({ data: {} })
    const result = await deleteCaption({ captionId: "cap1", confirm: true })
    expect(text(result)).toContain("cap1")
  })
})

describe("setThumbnail", () => {
  it("sets the thumbnail", async () => {
    youtubeMock.thumbnails.set.mockResolvedValue({ data: {} })
    const result = await setThumbnail({
      videoId: "vid1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("vid1")
    expect(youtubeMock.thumbnails.set).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "vid1" }),
    )
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.thumbnails.set.mockRejectedValue(new Error("boom"))
    const result = await setThumbnail({
      videoId: "vid1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("setWatermark", () => {
  it("sets the watermark", async () => {
    youtubeMock.watermarks.set.mockResolvedValue({ data: {} })
    const result = await setWatermark({
      channelId: "chan1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("chan1")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.watermarks.set.mockRejectedValue(new Error("boom"))
    const result = await setWatermark({
      channelId: "chan1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("unsetWatermark", () => {
  it("refuses to unset without confirm", async () => {
    const result = await unsetWatermark({ channelId: "chan1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.watermarks.unset).not.toHaveBeenCalled()
  })

  it("unsets the watermark when confirmed", async () => {
    youtubeMock.watermarks.unset.mockResolvedValue({ data: {} })
    const result = await unsetWatermark({ channelId: "chan1", confirm: true })
    expect(text(result)).toContain("chan1")
  })
})

describe("listActivities", () => {
  it("returns mapped activities", async () => {
    youtubeMock.activities.list.mockResolvedValue({
      data: {
        items: [
          { id: "act1", snippet: { type: "upload", title: "New upload" } },
        ],
        nextPageToken: null,
      },
    })
    const result = await listActivities({})
    expect(text(result)).toContain("New upload")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.activities.list.mockRejectedValue(new Error("boom"))
    const result = await listActivities({})
    expect(text(result)).toContain("Error:")
  })
})

describe("listPlaylistImages", () => {
  it("returns mapped playlist images", async () => {
    youtubeMock.playlistImages.list.mockResolvedValue({
      data: { items: [{ id: "img1", snippet: { playlistId: "pl1" } }] },
    })
    const result = await listPlaylistImages({ parent: "pl1" })
    expect(text(result)).toContain("img1")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlistImages.list.mockRejectedValue(new Error("boom"))
    const result = await listPlaylistImages({ parent: "pl1" })
    expect(text(result)).toContain("Error:")
  })
})

describe("uploadPlaylistImage", () => {
  it("uploads the playlist image", async () => {
    youtubeMock.playlistImages.insert.mockResolvedValue({
      data: { id: "img1", snippet: { playlistId: "pl1" } },
    })
    const result = await uploadPlaylistImage({
      playlistId: "pl1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("img1")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlistImages.insert.mockRejectedValue(new Error("boom"))
    const result = await uploadPlaylistImage({
      playlistId: "pl1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("updatePlaylistImage", () => {
  it("updates the playlist image", async () => {
    youtubeMock.playlistImages.update.mockResolvedValue({
      data: { id: "img1", snippet: { playlistId: "pl1" } },
    })
    const result = await updatePlaylistImage({
      playlistImageId: "img1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("img1")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.playlistImages.update.mockRejectedValue(new Error("boom"))
    const result = await updatePlaylistImage({
      playlistImageId: "img1",
      filePath: testFilePath,
    })
    expect(text(result)).toContain("Error:")
  })
})

describe("deletePlaylistImage", () => {
  it("refuses to delete without confirm", async () => {
    const result = await deletePlaylistImage({ playlistImageId: "img1" })
    expect(text(result)).toContain("Error:")
    expect(youtubeMock.playlistImages.delete).not.toHaveBeenCalled()
  })

  it("deletes the image when confirmed", async () => {
    youtubeMock.playlistImages.delete.mockResolvedValue({ data: {} })
    const result = await deletePlaylistImage({
      playlistImageId: "img1",
      confirm: true,
    })
    expect(text(result)).toContain("img1")
  })
})

describe("listMembers", () => {
  it("returns mapped members", async () => {
    youtubeMock.members.list.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              memberDetails: { channelId: "chan1", displayName: "Fan" },
            },
          },
        ],
        nextPageToken: null,
      },
    })
    const result = await listMembers({})
    expect(text(result)).toContain("Fan")
  })

  it("returns error when the API call fails (e.g. non-partner channel)", async () => {
    youtubeMock.members.list.mockRejectedValue(new Error("403"))
    const result = await listMembers({})
    expect(text(result)).toContain("Error:")
  })
})

describe("listMembershipLevels", () => {
  it("returns mapped membership levels", async () => {
    youtubeMock.membershipsLevels.list.mockResolvedValue({
      data: {
        items: [
          { id: "lvl1", snippet: { levelDetails: { displayName: "Gold" } } },
        ],
      },
    })
    const result = await listMembershipLevels()
    expect(text(result)).toContain("Gold")
  })

  it("returns error when the API call fails (e.g. non-partner channel)", async () => {
    youtubeMock.membershipsLevels.list.mockRejectedValue(new Error("403"))
    const result = await listMembershipLevels()
    expect(text(result)).toContain("Error:")
  })
})

describe("listVideoCategories", () => {
  it("returns mapped categories", async () => {
    youtubeMock.videoCategories.list.mockResolvedValue({
      data: { items: [{ id: "22", snippet: { title: "People & Blogs" } }] },
    })
    const result = await listVideoCategories({})
    expect(text(result)).toContain("People & Blogs")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.videoCategories.list.mockRejectedValue(new Error("boom"))
    const result = await listVideoCategories({})
    expect(text(result)).toContain("Error:")
  })
})

describe("listI18nLanguages", () => {
  it("returns mapped languages", async () => {
    youtubeMock.i18nLanguages.list.mockResolvedValue({
      data: { items: [{ id: "en", snippet: { name: "English" } }] },
    })
    const result = await listI18nLanguages()
    expect(text(result)).toContain("English")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.i18nLanguages.list.mockRejectedValue(new Error("boom"))
    const result = await listI18nLanguages()
    expect(text(result)).toContain("Error:")
  })
})

describe("listI18nRegions", () => {
  it("returns mapped regions", async () => {
    youtubeMock.i18nRegions.list.mockResolvedValue({
      data: { items: [{ id: "US", snippet: { name: "United States" } }] },
    })
    const result = await listI18nRegions()
    expect(text(result)).toContain("United States")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.i18nRegions.list.mockRejectedValue(new Error("boom"))
    const result = await listI18nRegions()
    expect(text(result)).toContain("Error:")
  })
})

describe("listVideoAbuseReportReasons", () => {
  it("returns mapped reasons", async () => {
    youtubeMock.videoAbuseReportReasons.list.mockResolvedValue({
      data: { items: [{ id: "R1", snippet: { label: "Spam" } }] },
    })
    const result = await listVideoAbuseReportReasons()
    expect(text(result)).toContain("Spam")
  })

  it("returns error when the API call fails", async () => {
    youtubeMock.videoAbuseReportReasons.list.mockRejectedValue(
      new Error("boom"),
    )
    const result = await listVideoAbuseReportReasons()
    expect(text(result)).toContain("Error:")
  })
})
