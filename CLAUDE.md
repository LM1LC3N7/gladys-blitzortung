# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
reads the live feed of the **Blitzortung.org** lightning network (the
websocket of map.blitzortung.org) and turns the strikes near each located
house into a device, scene triggers ("lightning within X km", "storm over",
"storm approaching"), a scene action and a storm widget. Unofficial: not
affiliated with Blitzortung.org.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js                  SDK wiring only (handlers registered before connect())
src/app.js                BlitzortungApp: houses, discovery, feed on/off, strikes
                          per house, 15 s tick, scene action, widget, button
src/blitzortung/feed.js   the ONLY network access: one websocket, server
                          rotation, backoff, watchdog, socket factory
src/blitzortung/decode.js the LZW decoding of a frame (pure)
src/model.js              strike -> nearby strike -> house reading, zones,
                          approach (pure)
src/geo.js                distance, bearing, compass point, bounding box (pure)
src/devices.js            the area device, feature keys, states (pure)
src/triggers.js           two readings -> scene events (pure)
src/widget.js             the "storm" widget (pure)
src/config.js             config_schema normalized, the `servers` grammar
src/constants.js          servers, pacing, thresholds, manifest keys
src/i18n.js               runtime texts (en/fr)
test/fixtures/            36 real frames (2026-10-14), their decoded text, the
                          reference decoder (kept tiny: see the fixtures section)
test/helpers/             fake socket + LZW encoder, fake timers; Gladys is the
                          SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with Blitzortung.org". Never use the Blitzortung logo.
- **The data terms.** Blitzortung.org data comes from volunteers, for
  private, non-commercial use: **one connection, never resell, credit
  Blitzortung.org** (the widget caption does). Nothing is stored or
  forwarded; only the strikes near the houses are kept, in memory.
- **Not a safety system**: the docs, the config section and the widget say
  so. Never word a feature as a protection.
- **Keys are forever**: the manifest keys (`src/constants.js`), the feature
  keys (`FEATURE` in `src/devices.js`), the external id shape
  `area:<houseSelector>` and the trigger distances (`DISTANCE_THRESHOLDS`)
  are stored in user scenes and dashboards. Never rename them.
- **Be polite with the volunteers**: ONE websocket at a time, opened only
  while a house device exists; on failure the next server after 5 s, 10 s,
  20 s... up to 5 minutes (`RECONNECT`). Only a connection that delivered
  strikes for a minute (`STABLE_AFTER`) counts as recycled by the server:
  the next server then after 1 s and the backoff restarts. A connection
  silent for 2 minutes is replaced (`WATCHDOG`).
- **Cheap per strike**: the feed is worldwide (several frames per second,
  about 9 KB/s). A frame is decoded and parsed once (about 50 µs), a
  bounding box per house discards it before any trigonometry; nothing else
  runs per strike unless it is within the radius.
- **States at most every 15 s** (`PUBLISH_INTERVAL`, through
  `publishChangedStates`); scene events fire at once, one per transition
  (`src/triggers.js`): the first reading fires nothing, a zone fires once
  per storm and re-arms after the quiet period.
- **Windows run on the reception time** (the container's clock), the
  strike's own time is only displayed: a skewed host clock cannot empty a
  window.
- **Built from observation**: the frame format, `{"a":111}`, the `latc` /
  `lonc` corrections and the `timeout` message come from the map's own
  script (`live_lightning_maps.js`); keep every Blitzortung-specific name in
  `src/blitzortung/` and `strikeOf` so a change of the feed is fixed in one
  place.
- **Read-only rootfs**: write nothing on disk.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (the feed takes a socket factory; the
  default one throws in the tests).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.

## The feed, as measured on 2026-10-14

- `wss://ws1|ws7|ws8.blitzortung.org/` open (ws3 refused); after `open`,
  send `{"a":111}`; one strike per text message. `{"sig":false}` (the map's
  detector switch) is ignored by the servers today: every frame carries the
  detector list, about 1.6 KB per frame.
- 00:58-01:38 UTC: 9,635 frames in 30 minutes (5.4 per second, about
  9 KB/s, 0.75 GB a day); the longest silence between two messages was
  2.3 s (99th percentile 1.1 s). `WATCHDOG` (2 minutes) keeps a wide
  margin for the quietest hours of the world.
- The servers close every connection after **363 s** (code 1005, about 2 s
  after their last frame), on ws1, ws7 and ws8 alike, even when the client
  talks; an unrelated websocket through the same network stayed open: it is
  the servers. Hence the 1 s reconnection after a stable connection
  (`RECONNECT.afterStable`) and no red status for it.
- The same strike arrives several times (regional solvers, same `time`,
  positions a few metres apart): the houses deduplicate by `time`.

## The fixtures: a handful of frames, and it stays that way

`test/fixtures/frames.txt` holds **36 real frames** (60 KB) captured on
2026-10-14, and `frames.decoded.jsonl` their text decoded by an independent
Python port of the map's decoder (`reference-decode.py`). The set is small
on purpose and **must stay small (40 frames at most, a test enforces it)**:
the repository is public, Blitzortung.org's terms forbid redistributing its
data, and every frame embeds the list of the volunteer detectors with their
positions. A few frames prove the decoder; a dump of the feed would be a
redistribution.

What the 36 frames cover: the 30 frames within 30 km of the test house at
35.10, -99.95 (the Oklahoma storm of the capture, 2 of them duplicates, the
end-to-end test replays them), the first frame of the capture (used by the
decoder and feed tests), one frame of each other region seen (1, 2, 4, 5)
and the shortest one. Among them: codes past 1,000 dictionary entries and
26 frames where the server emits the code it is defining (`prev + prev[0]`);
`test/decode.test.js` checks that both stay covered, and a hand-built input
covers the latter too.

To refresh them, capture into a scratch directory **outside the
repository**, keep at most 40 frames chosen for the same purposes, then
regenerate the expected text with the independent decoder (never with
`src/blitzortung/decode.js` itself):

```bash
python3 -I test/fixtures/reference-decode.py test/fixtures/frames.txt test/fixtures/frames.decoded.jsonl
```

The expected counts of the end-to-end test (`test/app.test.js`) follow the
frames near the test house.
