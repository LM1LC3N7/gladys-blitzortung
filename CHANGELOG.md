# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Fixed

- Docs: the outputs of the scene actions come from the variable list
  (`{{<step>.<action>.<key>}}`), not `{{<key>}}`.

## [0.1.1] - 2026-10-14

### Added

- One device per located house of Gladys: strikes within the radius during
  the counting window, distance, bearing and direction of the nearest one,
  time of the last nearby strike.
- Scene triggers "lightning within a distance" (5 to 200 km, once per
  storm), "storm over" (after the quiet period) and "storm approaching".
- Scene action "lightning status": count, nearest distance, direction,
  minutes since the last strike, storm in progress.
- Dashboard widget "Lightning": calm or storm at X km in a direction, with
  the count, the nearest and the last strike.
- Configuration: radius (30 km by default, up to 200 km), counting window,
  quiet period, language of the directions, and the feed servers.
- "Test the feed" button.
- The live feed of Blitzortung.org (one connection, opened only while a
  device exists, next server with a backoff on failure, watchdog after 2
  minutes of silence).

[Unreleased]: https://github.com/LM1LC3N7/gladys-blitzortung/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-blitzortung/releases/tag/v0.1.1
