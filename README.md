# gladys-blitzortung

[Gladys Assistant](https://gladysassistant.com) external integration for
**Blitzortung** (lightning detection): nearby strikes with distance and
direction, a "lightning within X km" scene trigger and a storm widget.
**Unofficial, not affiliated with Blitzortung.org.**

The strikes come from the [Blitzortung.org](https://www.blitzortung.org/)
community network, whose detectors are run by volunteers: the data is for
**private, non-commercial use**. Lightning detection here is informative,
**not a safety system**.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (BlitzortungApp)
                 ├─ src/blitzortung/feed.js    one websocket (ws1/ws7/ws8), rotation, backoff, watchdog
                 ├─ src/blitzortung/decode.js  the LZW coding of the frames (pure)
                 ├─ src/model.js               strike -> nearby strike -> house reading (pure)
                 ├─ src/geo.js                 distance, bearing, bounding box (pure)
                 ├─ src/devices.js             one device per located house, states (pure)
                 ├─ src/triggers.js            two readings -> scene events (pure)
                 └─ src/widget.js              the storm widget (pure)
```

- **Discovery** offers one device per house of Gladys that has a location
  (`location: true`, `getHouses()`).
- **The feed** (the websocket of the live map, worldwide) is opened only
  while at least one device exists, one connection at a time. Each frame is
  decoded, the strike kept only if it falls within the radius of a house
  (bounding box first, then the haversine), deduplicated by its time.
- **States** (strikes in the window, nearest distance, bearing, direction,
  last strike) are published every 15 s at most through
  `publishChangedStates`; **scene events** fire at once, one per transition
  of a distance zone (once per storm, re-armed after the quiet period).

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/frames.txt` holds 36 real frames of the feed recorded on
2026-10-14, and `frames.decoded.jsonl` their text decoded by an independent
Python port of the map's decoder (`reference-decode.py`). The set is kept
tiny on purpose (Blitzortung.org's data is not ours to redistribute): see
CLAUDE.md.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0. The lightning data belongs to Blitzortung.org and its
volunteers, under their own terms.
