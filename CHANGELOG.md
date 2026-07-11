# Changelog

All notable changes to this project are documented here.

---

## 0.2.0 — 2026-07-12

### Highlights

- The server now covers the full read/write surface of the YouTube Data API v3 reachable under the `youtube.force-ssl` scope, growing from 8 tools to 52. New coverage includes full videos CRUD plus upload, rate, and report-abuse; `playlists.update` and playlist-item reordering; channels and channel-sections; subscriptions; comments, comment-threads, and moderation; captions (list/upload/update/download/delete); thumbnails, watermarks, and playlist cover images; and read-only reference data (categories, i18n regions/languages, abuse-report reasons, members). ([765ec55](https://github.com/kud/mcp-youtube/commit/765ec55264f89ecd5be423f3a6f5f7eb1ca00233))
- Destructive or outward-irreversible tools — deletes, ratings, abuse reports, moderation actions, and the like — now require an explicit `confirm: true`, guarding against accidental one-shot calls. ([765ec55](https://github.com/kud/mcp-youtube/commit/765ec55264f89ecd5be423f3a6f5f7eb1ca00233))
- Update tools (video, playlist, channel, channel-section) now read the current resource before writing, merging in only the changed fields — YouTube's update endpoints replace the whole resource, so this prevents unspecified fields from being silently wiped. ([765ec55](https://github.com/kud/mcp-youtube/commit/765ec55264f89ecd5be423f3a6f5f7eb1ca00233))

### Documentation

- Docs expanded to match the 52-tool surface, with new per-category pages (captions-and-media, channels-and-sections, community, reference-data, videos) alongside updates to the README and existing guides. ([765ec55](https://github.com/kud/mcp-youtube/commit/765ec55264f89ecd5be423f3a6f5f7eb1ca00233))
