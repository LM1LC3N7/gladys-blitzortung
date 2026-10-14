import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrame } from '../src/blitzortung/decode.js';
import { normalizeConfig, parseServers } from '../src/config.js';
import { boundingBox, bearingDeg, compassPoint, distanceKm, inBox } from '../src/geo.js';
import {
  approachOf,
  areaReading,
  minutesSince,
  nearbyStrike,
  pruneStrikes,
  strikeOf,
} from '../src/model.js';
import { realFrames } from './helpers/fakeSocket.js';

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const BRUSSELS = { latitude: 50.8503, longitude: 4.3517 };
const NOW = 1_800_000_000_000;
const MIN = 60_000;
const options = { now: NOW, radiusKm: 30, windowMinutes: 15, quietMinutes: 30 };
/** A nearby strike received `ago` minutes before NOW. */
const s = (km, ago = 0, bearing = 90, id = Math.random()) => ({
  id,
  at: NOW - ago * MIN,
  time: NOW - ago * MIN - 4000,
  km,
  bearing,
});

test('distance, bearing and compass points', () => {
  assert.equal(Math.round(distanceKm(PARIS, BRUSSELS)), 264);
  assert.equal(bearingDeg(PARIS, BRUSSELS), 32);
  assert.equal(bearingDeg(BRUSSELS, PARIS), 214);
  assert.equal(compassPoint(34, 'en'), 'NE');
  assert.equal(compassPoint(215, 'fr'), 'SO');
  assert.equal(compassPoint(270, 'fr'), 'O');
  assert.equal(compassPoint(270, 'en'), 'W');
  assert.equal(compassPoint(359, 'en'), 'N');
  assert.equal(compassPoint(330, 'en'), 'NW');
  assert.equal(compassPoint(338, 'en'), 'N', 'past 337.5');
});

test('the bounding box keeps every point within the radius, across the antimeridian too', () => {
  const box = boundingBox(PARIS, 30);
  assert.ok(inBox(box, 48.9, 2.6));
  assert.ok(!inBox(box, 49.2, 2.35), '38 km north');
  assert.ok(!inBox(box, 48.85, 2.85), '37 km east');
  const fiji = boundingBox({ latitude: -17.8, longitude: 179.9 }, 50);
  assert.ok(inBox(fiji, -17.8, -179.9), 'just across the antimeridian');
  const pole = boundingBox({ latitude: 89.8, longitude: 0 }, 50);
  assert.ok(inBox(pole, 89.7, 180), 'near a pole every longitude is close');
  // Nothing within the radius is ever cut by the box.
  for (let bearing = 0; bearing < 360; bearing += 15) {
    const rad = (bearing * Math.PI) / 180;
    const lat = PARIS.latitude + (29.9 / 111.2) * Math.cos(rad);
    const lon =
      PARIS.longitude +
      ((29.9 / 111.2) * Math.sin(rad)) / Math.cos((PARIS.latitude * Math.PI) / 180);
    assert.ok(inBox(box, lat, lon), `bearing ${bearing}`);
  }
});

test('a decoded frame becomes a strike; corrections apply, junk is refused', () => {
  const strike = strikeOf(parseFrame(realFrames().frames[0]));
  assert.equal(strike.time, 1791939497822);
  assert.equal(strike.latitude, 36.717925);
  assert.equal(strike.longitude, -99.83445);
  assert.equal(
    strikeOf({ time: 1e18, lat: 50, lon: 4, latc: 0.5, lonc: -0.25 }).latitude,
    50.5,
    'latc / lonc are added, like the map does',
  );
  assert.equal(strikeOf({ time: 1791939497822, lat: 1, lon: 1 }).time, 1791939497822, 'ms');
  assert.equal(strikeOf({ lat: 1, lon: 1 }), undefined);
  assert.equal(strikeOf({ time: 1e18, lat: 'x', lon: 1 }), undefined);
  assert.equal(strikeOf({ time: 1e18, lat: 95, lon: 1 }), undefined);
  assert.equal(strikeOf({ timeout: true }), undefined);
  assert.equal(strikeOf(null), undefined);
});

test('nearbyStrike: inside the radius only, with distance and bearing', () => {
  const area = { ...PARIS, box: boundingBox(PARIS, 30) };
  const near = nearbyStrike({ id: 1, time: 5, latitude: 48.9, longitude: 2.6 }, area, 30, 99);
  assert.deepEqual(near, { id: 1, at: 99, time: 5, km: 18.8, bearing: 75 });
  assert.equal(nearbyStrike({ id: 2, latitude: 40, longitude: 2.6 }, area, 30, 99), undefined);
  // In the box (a corner) but beyond the radius.
  assert.equal(nearbyStrike({ id: 3, latitude: 49.11, longitude: 2.75 }, area, 30, 99), undefined);
});

test('a reading: the window, the nearest, the zones (clamped to the radius)', () => {
  const strikes = [s(25, 20), s(12, 10, 200), s(18, 2), s(40, 1)];
  const r = areaReading(strikes, options);
  assert.equal(
    r.count,
    2,
    'the 20-minute-old strike is out of the window, 40 km out of the radius',
  );
  assert.equal(r.nearestKm, 12);
  assert.equal(r.bearing, 200);
  assert.equal(r.lastAt, NOW - 2 * MIN);
  assert.equal(r.storm, true);
  assert.equal(r.zones[5].active, false);
  assert.equal(r.zones[15].active, true);
  assert.equal(r.zones[30].active, true);
  // 50 km and more act as the 30 km radius: the 40 km strike is never seen.
  assert.equal(r.zones[50].lastAt, NOW - 2 * MIN);
  assert.equal(r.zones[200].active, true);
  // After the quiet period every zone is quiet; the last strike is remembered.
  const later = areaReading([], { ...options, now: NOW + 40 * MIN }, r);
  assert.equal(later.storm, false);
  assert.equal(later.count, 0);
  assert.equal(later.nearestKm, null);
  assert.equal(later.lastAt, NOW - 2 * MIN);
  assert.equal(minutesSince(later, NOW + 40 * MIN), 42);
  assert.equal(minutesSince(areaReading([], options), NOW), null);
});

test('approach: the nearest of each third gets closer', () => {
  const windowMs = 15 * MIN;
  const closing = [s(28, 14), s(27, 12), s(20, 9), s(22, 7), s(12, 3), s(14, 1)];
  assert.deepEqual(approachOf(closing, NOW, windowMs), { approaching: true, speedKmh: 90 });
  const leaving = [s(12, 14), s(13, 12), s(20, 9), s(22, 7), s(28, 3), s(27, 1)];
  assert.equal(approachOf(leaving, NOW, windowMs).approaching, false);
  const sparse = [s(28, 14), s(20, 9), s(22, 7), s(12, 3), s(14, 1)];
  assert.equal(approachOf(sparse, NOW, windowMs).approaching, false, 'one strike in a third');
  // Latched for the storm, released when it is over.
  const r1 = areaReading(closing, options);
  assert.equal(r1.approachLatched, true);
  const r2 = areaReading([s(12, 3), s(13, 1)], options, r1);
  assert.equal(r2.approaching, false);
  assert.equal(r2.approachLatched, true, 'still the same storm');
  const r3 = areaReading([], { ...options, now: NOW + 60 * MIN }, r2);
  assert.equal(r3.approachLatched, false);
});

test('pruning keeps the young strikes, the newest when over the cap', () => {
  const strikes = [s(1, 40, 0, 'a'), s(2, 10, 0, 'b'), s(3, 5, 0, 'c'), s(4, 1, 0, 'd')];
  assert.deepEqual(
    pruneStrikes(strikes, NOW, 32 * MIN, 10).map((x) => x.id),
    ['b', 'c', 'd'],
  );
  assert.deepEqual(
    pruneStrikes(strikes, NOW, 32 * MIN, 2).map((x) => x.id),
    ['c', 'd'],
  );
});

test('the configuration: defaults, bounds, servers', () => {
  const config = normalizeConfig({});
  assert.equal(config.radiusKm, 30);
  assert.equal(config.windowMinutes, 15);
  assert.equal(config.quietMinutes, 30);
  assert.equal(config.language, 'fr');
  assert.deepEqual(config.servers, [
    'wss://ws1.blitzortung.org/',
    'wss://ws7.blitzortung.org/',
    'wss://ws8.blitzortung.org/',
  ]);
  const odd = normalizeConfig({
    radius_km: 500,
    window_minutes: 1,
    quiet_minutes: '',
    language: 'de',
  });
  assert.equal(odd.radiusKm, 200);
  assert.equal(odd.windowMinutes, 5);
  assert.equal(odd.quietMinutes, 30);
  assert.equal(odd.language, 'fr');
  assert.deepEqual(parseServers('ws8, wss://relay.example.org/feed http://x.org ws8 nope'), {
    urls: ['wss://ws8.blitzortung.org/', 'wss://relay.example.org/feed'],
    invalid: ['http://x.org', 'nope'],
  });
  assert.equal(parseServers('').urls.length, 3, 'empty: the defaults');
});
