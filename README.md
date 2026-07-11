<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![npm](https://img.shields.io/npm/v/%40kud%2Fmcp-youtube?style=flat-square&color=CB3837)
![MIT](https://img.shields.io/badge/licence-MIT-22C55E?style=flat-square)

**▶️ MCP server for the full YouTube Data API v3 — playlists, videos, channels, community, captions, and media, conversationally from Claude**

<a href="https://kud.io/projects/mcp-youtube">Website</a> · <a href="https://kud.io/projects/mcp-youtube/docs">Documentation</a>

</div>

## Features

- **Full YouTube Data API v3 coverage** — 52 tools spanning playlists, videos, channels & sections, subscriptions, comments, captions, thumbnails, watermarks, playlist cover images, and read-only reference data, all under the `youtube.force-ssl` scope
- **Quota-aware by design** — every tool documents its cost up front, from 1-unit reads to the 1600-unit `upload-video`
- **Guarded destructive actions** — every delete, unsubscribe, moderation action, or other irreversible/outward tool refuses to run without `confirm: true`
- **Full-replace done safely** — YouTube's `update` methods overwrite an entire resource part; tools like `update-video`, `update-playlist`, `update-channel`, and `update-channel-section` read the current resource first so an update that only changes one field never silently blanks the rest
- **Safe bulk cleanup** — `clean-playlist` scans for `[Deleted video]`/`[Private video]` tombstones, duplicates, and videos from named channels, then defaults to a dry run so you see the plan before anything is removed
- **Local-file media uploads** — videos, captions, thumbnails, watermarks, and playlist cover images all upload from a local file path via resumable upload where the API requires it
- **One-time OAuth setup** — a desktop-flow `npm run setup` handles Google authorisation and prints a refresh token; you supply it (and the client id/secret) to the server via environment variables, from any store you like
- **Typed end to end** — Zod-validated tool schemas and a Vitest suite covering every handler

## Install

Install as a Claude plugin:

```sh
/plugin install youtube@kud
```

Or install the package directly:

```sh
npm install -g @kud/mcp-youtube
```

Either way, run the one-time OAuth setup before first use:

```sh
npm run setup
```

This walks you through creating a Google Cloud OAuth client (Desktop app type), opens a browser to authorise the `youtube.force-ssl` scope, and **prints** the resulting credentials — it writes nothing to disk. Stash them wherever you keep secrets (keychain, secrets manager, your MCP client's `env` block) and expose them to the server as environment variables:

| Variable                    | Holds                    |
| --------------------------- | ------------------------ |
| `MCP_YOUTUBE_CLIENT_ID`     | OAuth client ID          |
| `MCP_YOUTUBE_CLIENT_SECRET` | OAuth client secret      |
| `MCP_YOUTUBE_REFRESH_TOKEN` | long-lived refresh token |

The server reads these three from the environment only — it's store-agnostic, so how they get there is up to you. A keychain-backed export works well:

```sh
export MCP_YOUTUBE_REFRESH_TOKEN=$(security find-generic-password -s mcp-youtube-refresh-token -w)
```

> **Tip:** set the OAuth app's publishing status to **In production** in Google Cloud. `youtube.force-ssl` is a _sensitive_ scope, and while the app sits in _Testing_ the refresh token expires after 7 days.

## Usage

YouTube's Data API v3 gives every project a fixed **10,000 quota units/day**. A single careless `search`, bulk delete, or video upload can burn through a meaningful chunk of that, so every tool documents its cost up front — and every destructive or outward-irreversible tool requires an explicit `confirm: true`.

52 tools cover the full read/write surface reachable under the `youtube.force-ssl` scope:

| Category            | Tools                                                                                                                                                                                                                                             | Docs                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Searching           | `search`, `list-playlists`, `get-playlist`                                                                                                                                                                                                        | [Searching](https://kud.io/projects/mcp-youtube/docs/searching)                       |
| Playlists           | `create-playlist`, `update-playlist`, `add-to-playlist`, `update-playlist-item`                                                                                                                                                                   | [Creating & Adding](https://kud.io/projects/mcp-youtube/docs/creating-and-adding)     |
| Cleaning            | `clean-playlist`                                                                                                                                                                                                                                  | [Cleaning Playlists](https://kud.io/projects/mcp-youtube/docs/cleaning-playlists)     |
| Deleting            | `remove-from-playlist`, `delete-playlist`                                                                                                                                                                                                         | [Deleting & Pruning](https://kud.io/projects/mcp-youtube/docs/deleting-and-pruning)   |
| Videos              | `list-videos`, `update-video`, `rate-video`, `get-video-rating`, `delete-video`, `upload-video`, `report-video-abuse`                                                                                                                             | [Videos](https://kud.io/projects/mcp-youtube/docs/videos)                             |
| Channels & sections | `update-channel`, `list-channels`, `list-channel-sections`, `create-channel-section`, `update-channel-section`, `delete-channel-section`                                                                                                          | [Channels & Sections](https://kud.io/projects/mcp-youtube/docs/channels-and-sections) |
| Community           | `list-subscriptions`, `subscribe`, `unsubscribe`, `list-comment-threads`, `create-comment-thread`, `list-comments`, `reply-to-comment`, `update-comment`, `delete-comment`, `set-comment-moderation-status`                                       | [Community](https://kud.io/projects/mcp-youtube/docs/community)                       |
| Captions & media    | `list-captions`, `upload-caption`, `update-caption`, `download-caption`, `delete-caption`, `set-thumbnail`, `set-watermark`, `unset-watermark`, `list-playlist-images`, `upload-playlist-image`, `update-playlist-image`, `delete-playlist-image` | [Captions & Media](https://kud.io/projects/mcp-youtube/docs/captions-and-media)       |
| Reference data      | `list-activities`, `list-video-categories`, `list-i18n-languages`, `list-i18n-regions`, `list-video-abuse-report-reasons`, `list-members`, `list-membership-levels`                                                                               | [Reference Data](https://kud.io/projects/mcp-youtube/docs/reference-data)             |

Once installed, just talk to Claude:

```console
> Clean up the tombstones in my "Focus" playlist

Scanned 214 items — found 6 tombstones ([Deleted video]/[Private video]).
This is a dry run, no changes made. Estimated cost to delete: 300 units.
Want me to go ahead?

> Yes, and dedupe it too

Deleted 6 tombstones and 3 duplicates (9 items, 450 units).
```

`clean-playlist` always returns its plan first — pass `dryRun: false` (or just confirm in conversation) to actually delete.

## Development

```sh
git clone https://github.com/kud/mcp-youtube.git
cd mcp-youtube
npm install
npm run dev
```

| Script                | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `npm run dev`         | Run the server directly from source (`tsx`) |
| `npm run build`       | Compile to `dist/`                          |
| `npm test`            | Run the Vitest suite                        |
| `npm run typecheck`   | Type-check without emitting                 |
| `npm run inspect:dev` | Launch the MCP Inspector against source     |

📚 **Full documentation → [mcp-youtube/docs](https://kud.io/projects/mcp-youtube/docs)**
