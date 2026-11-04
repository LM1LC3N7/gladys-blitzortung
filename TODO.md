# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+: discovery with a located house, the device
      states during a real storm, the widget, "lightning within 10 km" and
      "storm over" in a scene.
- [ ] Run it a full day: the reconnections (the servers close every
      connection after 363 s), the memory, the CPU on a Raspberry Pi, the
      bandwidth (0.75 GB a day at the rate measured at night).
- [ ] Reserve the integration in the forum, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).
- [ ] Consider asking Blitzortung.org whether they are fine with a home
      automation integration reading the map's feed (private use, one
      connection per installation, credited).

## To confirm

- [ ] The longest silence of the worldwide feed at the quietest hour (around
      08:00-10:00 UTC in the northern winter): `WATCHDOG` is 2 minutes.
- [ ] `latc` / `lonc` were 0 in every captured frame: the map adds them to
      the position, so do we; check the sign the day they are not 0.
- [ ] The meaning of the strike `status` and `region` fields (ignored: the
      same strike comes from several regions, deduplicated by `time`).
- [ ] `getHouses()` is granted with `location: true` on the install screen,
      and a house without coordinates is skipped quietly.
- [ ] The `angle-sensor` feature in degrees and the `distance-sensor` in km
      render well in the device page.

## Ideas

- A regional relay (like the MQTT relay of the Home Assistant integration)
  would cut the bandwidth from the worldwide feed to a few strikes.
- "Lightning within X km" with a choice of the strike status (only the
  well-located strikes).
- A chart of the strikes per 5 minutes in the widget.

## Decisions

- **SDK `^0.16.0`** (2026-11-04, migration wave 8): it adds the ai, tts and
  music types; no effect here (no `poll_frequency`: the devices are never
  polled). Every feature already had a numeric `min` and `max` (text features
  0/0); `test/helpers/coreFeature.js` now checks each one against the core
  model. `npm test` runs with `--test-timeout=60000`. `keywords`, `countries`
  and `gladys_version >= 5.3.0` wait until Gladys 5.3 is widespread.
