// -----------------------------------------------------------------------------
// Two consecutive readings of a house -> scene events. Pure. Nothing fires on
// the first reading (no transition without a previous value), and each event
// is one transition of a zone:
//   lightning_nearby   a zone goes from quiet to active (once per storm)
//   storm_over         a zone goes from active to quiet (re-arms the above)
//   storm_approaching  the approach is detected, once per storm
// -----------------------------------------------------------------------------

import { DISTANCE_THRESHOLDS, SCENE_TRIGGERS } from './constants.js';
import { isoSeconds } from './devices.js';
import { compassPoint } from './geo.js';

const iso = (ms) => (ms ? isoSeconds(ms) : null);

/** The events of a house between two readings. */
export function areaEvents(deviceId, previous, current, { language = 'en', quietMinutes } = {}) {
  if (!previous) {
    return [];
  }
  const events = [];
  const direction = current.bearing === null ? null : compassPoint(current.bearing, language);
  for (const distance of DISTANCE_THRESHOLDS) {
    const before = previous.zones?.[distance];
    const zone = current.zones[distance];
    if (!before?.active && zone.active) {
      events.push({
        key: SCENE_TRIGGERS.NEARBY,
        data: {
          area: deviceId,
          distance: String(distance),
          km: current.nearestKm,
          bearing: current.bearing,
          direction,
          count: current.count,
          strike_at: iso(zone.lastTime),
        },
      });
    } else if (before?.active && !zone.active) {
      events.push({
        key: SCENE_TRIGGERS.OVER,
        data: {
          area: deviceId,
          distance: String(distance),
          last_strike_at: iso(before.lastTime),
          quiet_minutes: quietMinutes ?? null,
        },
      });
    }
  }
  if (!previous.approachLatched && current.approachLatched) {
    events.push({
      key: SCENE_TRIGGERS.APPROACHING,
      data: {
        area: deviceId,
        km: current.nearestKm,
        bearing: current.bearing,
        direction,
        speed_kmh: current.speedKmh,
        count: current.count,
      },
    });
  }
  return events;
}
