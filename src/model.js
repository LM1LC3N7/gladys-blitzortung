// -----------------------------------------------------------------------------
// Strikes of the feed -> the readings of one house. Pure: `now` is a
// parameter (milliseconds). Every Blitzortung field name lives here and in
// src/blitzortung/, so a change of the feed is fixed in one place.
// -----------------------------------------------------------------------------

import { APPROACH, DISTANCE_THRESHOLDS } from './constants.js';
import { bearingDeg, distanceKm, inBox } from './geo.js';

/** The strike time to milliseconds: the feed sends nanoseconds since 1970. */
function epochMs(time) {
  if (time > 1e17) {
    return Math.round(time / 1e6); // nanoseconds (what the feed sends)
  }
  if (time > 1e14) {
    return Math.round(time / 1e3); // microseconds
  }
  return time > 1e11 ? Math.round(time) : Math.round(time * 1000); // ms or s
}

/**
 * One decoded frame -> { id, time, latitude, longitude }, or undefined when it
 * is not a strike. The map adds `latc` / `lonc` (corrections, 0 so far) to the
 * position; so do we. `sig` (the detectors) and the rest are ignored.
 */
export function strikeOf(raw) {
  if (!raw || typeof raw !== 'object' || !('time' in raw) || !('lat' in raw) || !('lon' in raw)) {
    return undefined;
  }
  const time = Number(raw.time);
  const latitude = Number(raw.lat) + (Number(raw.latc) || 0);
  const longitude = Number(raw.lon) + (Number(raw.lonc) || 0);
  if (![time, latitude, longitude].every(Number.isFinite) || time <= 0) {
    return undefined;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return undefined;
  }
  // The same strike comes back from several regional solvers, with the same
  // `time` and a position a few metres apart: `time` identifies it.
  return { id: time, time: epochMs(time), latitude, longitude };
}

/**
 * The strike as seen from a house, or undefined when it is beyond `radiusKm`:
 * the bounding box discards almost every strike of the world before the
 * haversine. `area` is { latitude, longitude, box }.
 *
 * `at` is the time of reception, on the clock of the container: the windows
 * and the quiet periods are measured on it, so a host clock a few minutes
 * off cannot empty them. `time` is the strike's own time, for display.
 */
export function nearbyStrike(strike, area, radiusKm, receivedAt) {
  if (!inBox(area.box, strike.latitude, strike.longitude)) {
    return undefined;
  }
  const km = distanceKm(area, strike);
  if (km > radiusKm) {
    return undefined;
  }
  return {
    id: strike.id,
    at: receivedAt,
    time: strike.time,
    km: Math.round(km * 10) / 10,
    bearing: bearingDeg(area, strike),
  };
}

/** Keep the strikes younger than `keepMs`, at most `max` (the newest). */
export function pruneStrikes(strikes, now, keepMs, max) {
  const kept = strikes.filter((s) => s.at >= now - keepMs);
  return kept.length > max ? kept.slice(kept.length - max) : kept;
}

/** The later of two strikes: received later, or struck later when received together. */
const later = (a, b) => (!a || b.at > a.at || (b.at === a.at && b.time > a.time) ? b : a);

const nearestOf = (strikes) =>
  strikes.reduce(
    (best, s) => (!best || s.km < best.km || (s.km === best.km && s.at > best.at) ? s : best),
    undefined,
  );

/**
 * "Storm approaching": the window cut in three slices, the nearest strike of
 * each getting closer by at least APPROACH.minStepKm, each slice holding at
 * least APPROACH.minStrikes strikes (one stray strike proves nothing).
 */
export function approachOf(strikes, now, windowMs) {
  const sliceMs = windowMs / APPROACH.slices;
  const nearest = [];
  for (let k = 0; k < APPROACH.slices; k += 1) {
    const start = now - windowMs + k * sliceMs;
    const end = k === APPROACH.slices - 1 ? Infinity : start + sliceMs;
    const slice = strikes.filter((s) => s.at >= start && s.at < end);
    if (slice.length < APPROACH.minStrikes) {
      return { approaching: false, speedKmh: null };
    }
    nearest.push(nearestOf(slice).km);
  }
  for (let k = 1; k < nearest.length; k += 1) {
    if (nearest[k - 1] - nearest[k] < APPROACH.minStepKm) {
      return { approaching: false, speedKmh: null };
    }
  }
  const hours = ((APPROACH.slices - 1) * sliceMs) / 3_600_000;
  const speedKmh = Math.round((nearest[0] - nearest[nearest.length - 1]) / hours);
  return { approaching: true, speedKmh };
}

/**
 * The reading of one house at `now`, from its nearby strikes:
 *   count / nearestKm / bearing   strikes of the window, the nearest one
 *   lastAt / lastTime              the last nearby strike, received / struck
 *                                  (kept across readings)
 *   zones[X]                       per trigger distance: active while a strike
 *                                  within min(X, radius) is younger than the
 *                                  quiet period
 *   storm                          the radius zone is active
 *   approaching / approachLatched  the approach of the storm, latched until
 *                                  the storm is over (announced once)
 */
export function areaReading(
  strikes,
  { now, radiusKm, windowMinutes, quietMinutes },
  previous = undefined,
) {
  const windowMs = windowMinutes * 60_000;
  const quietStart = now - quietMinutes * 60_000;
  const inRadius = strikes.filter((s) => s.km <= radiusKm);
  const inWindow = inRadius.filter((s) => s.at >= now - windowMs);
  const nearest = nearestOf(inWindow);
  const last = inRadius.reduce(later, undefined);
  const zones = {};
  for (const distance of DISTANCE_THRESHOLDS) {
    const reach = Math.min(distance, radiusKm);
    let latest;
    for (const s of inRadius) {
      if (s.km <= reach) {
        latest = later(latest, s);
      }
    }
    zones[distance] = {
      active: latest !== undefined && latest.at > quietStart,
      lastAt: latest?.at ?? null,
      lastTime: latest?.time ?? null,
    };
  }
  const storm = last !== undefined && last.at > quietStart;
  const { approaching, speedKmh } = approachOf(inWindow, now, windowMs);
  const newer = last && (!previous?.lastAt || last.at >= previous.lastAt);
  return {
    at: now,
    count: inWindow.length,
    nearestKm: nearest?.km ?? null,
    bearing: nearest?.bearing ?? null,
    lastAt: newer ? last.at : (previous?.lastAt ?? null),
    lastTime: newer ? last.time : (previous?.lastTime ?? null),
    storm,
    approaching,
    speedKmh,
    approachLatched: storm && (approaching || previous?.approachLatched === true),
    zones,
  };
}

/** Whole minutes since the last nearby strike, or null when none was seen. */
export function minutesSince(reading, now) {
  return reading?.lastAt ? Math.max(0, Math.floor((now - reading.lastAt) / 60_000)) : null;
}
