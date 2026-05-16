# Flower Tower Mail Feed

Public broadcast mail feed for Flower Tower / Flower Power.

This repository is intentionally small: it hosts static JSON for one-way player mail, plus local authoring and validation tools. Do not put secrets, private roadmap notes, per-user compensation, or support-only grants in this public feed.

## Live Feed

Once GitHub Pages is enabled, the app should read:

```text
https://jerimiah555.github.io/flowertower-mail-feed/mail/v1/feed.json
```

The game app should set:

```text
EXPO_PUBLIC_MAIL_FEED_URL=https://jerimiah555.github.io/flowertower-mail-feed/mail/v1/feed.json
```

## Quick Start

```bash
npm run mail:new
npm run mail:validate
npm run mail:publish
```

`mail:new` asks for the message, optional rewards, and optional delivery gates. It writes the newest item to `docs/mail/v1/feed.json`.

`mail:validate` checks the feed structure, duplicate IDs, date ordering, reward values, and delivery gates.

`mail:publish` validates, stages the feed file, commits it, and pushes to GitHub Pages.

## Mail Item Example

```json
{
  "id": "2026-05-16-welcome-gems",
  "title": "Welcome gift",
  "body": "A few gems to brighten the Bloom.",
  "publishedAt": "2026-05-16T12:00:00.000Z",
  "expiresAt": "2026-06-16T12:00:00.000Z",
  "reward": {
    "gems": 25
  }
}
```

## Reward Fields

Supported reward fields:

- `gems`
- `pollen`
- `wildDNA`
- `strandDNA`
- `bloomGrowth`
- `bloomGrowthVariantId`: `mass`, `velocity`, `sporeburst`, or `tangle`

Leave `reward` out for message-only mail.

## Delivery Gates

Optional `gates` can limit broad public broadcasts:

```json
{
  "gates": {
    "platforms": ["ios", "android"],
    "appEnvironments": ["preview", "production"],
    "minBuildNumber": 20,
    "maxBuildNumber": 40
  }
}
```

Keep gates simple. If a message needs per-player targeting or support compensation, it does not belong in this public feed.

## Feed Shape

The live file is always:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

Schema reference: `schema/player-mail.schema.json`.
