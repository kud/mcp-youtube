import { describe, it, expect, vi, beforeEach } from "vitest"

vi.hoisted(() => {
  process.env.MCP_YOUTUBE_CLIENT_ID = "test-client-id"
  process.env.MCP_YOUTUBE_CLIENT_SECRET = "test-client-secret"
  process.env.MCP_YOUTUBE_REFRESH_TOKEN = "test-refresh-token"
})

const { youtubeMock } = vi.hoisted(() => {
  const youtubeMock = {
    search: { list: vi.fn() },
    playlists: { list: vi.fn(), insert: vi.fn(), delete: vi.fn() },
    playlistItems: {
      list: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    },
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
  search,
  listPlaylists,
  getPlaylist,
  createPlaylist,
  addToPlaylist,
  removeFromPlaylist,
  cleanPlaylist,
  deletePlaylist,
} from "../index.js"

beforeEach(() => {
  vi.clearAllMocks()
})

const text = (result: { content: Array<{ text: string }> }) =>
  result.content[0].text

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
