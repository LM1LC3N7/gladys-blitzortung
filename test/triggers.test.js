import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaReading } from '../src/model.js';
import { areaEvents } from '../src/triggers.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const AREA = 'ext:blitzortung:area:home';
const base = { radiusKm: 30, windowMinutes: 15, quietMinutes: 30 };
const at = (minutes) => ({ ...base, now: NOW + minutes * MIN });
const strike = (km, minute, bearing = 45) => ({
  id: `${km}@${minute}`,
  at: NOW + minute * MIN,
  time: NOW + minute * MIN - 5000,
  km,
  bearing,
});
const keys = (events) => events.map((e) => `${e.key}:${e.data.distance ?? ''}`);

test('the first reading fires nothing, even in the middle of a storm', () => {
  const reading = areaReading([strike(3, 0)], at(0));
  assert.equal(reading.zones[5].active, true);
  assert.deepEqual(areaEvents(AREA, undefined, reading), []);
});

test('lightning within X km: once per zone, at the first strike, never again in the storm', () => {
  const calm = areaReading([], at(0));
  const strikes = [strike(18, 1, 250)];
  const first = areaReading(strikes, at(1), calm);
  const events = areaEvents(AREA, calm, first, { language: 'fr', quietMinutes: 30 });
  assert.deepEqual(keys(events), [
    'lightning_nearby:20',
    'lightning_nearby:30',
    'lightning_nearby:50',
    'lightning_nearby:100',
    'lightning_nearby:200',
  ]);
  assert.deepEqual(events[0].data, {
    area: AREA,
    distance: '20',
    km: 18,
    bearing: 250,
    direction: 'O',
    count: 1,
    strike_at: new Date(NOW + MIN - 5000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  });
  // More strikes at the same distance: nothing new. Closer: the smaller zones fire.
  strikes.push(strike(17, 3), strike(4, 5));
  const second = areaReading(strikes.slice(0, 2), at(3), first);
  assert.deepEqual(areaEvents(AREA, first, second), []);
  const third = areaReading(strikes, at(5), second);
  assert.deepEqual(keys(areaEvents(AREA, second, third)), [
    'lightning_nearby:5',
    'lightning_nearby:10',
    'lightning_nearby:15',
  ]);
});

test('storm over after the quiet period, per zone, then the zone is armed again', () => {
  const calm = areaReading([], at(0));
  const strikes = [strike(8, 1), strike(25, 20)];
  const storm = areaReading(strikes.slice(0, 1), at(1), calm);
  const later = areaReading(strikes, at(20), storm);
  assert.deepEqual(keys(areaEvents(AREA, storm, later)), [], '25 km: the 30 km zone is already on');
  // 31 minutes after the 8 km strike: the 10 km zone is over, the 30 km one is not.
  const quiet10 = areaReading(strikes, at(32), later);
  const over = areaEvents(AREA, later, quiet10, { quietMinutes: 30 });
  assert.deepEqual(keys(over), ['storm_over:10', 'storm_over:15', 'storm_over:20']);
  assert.equal(over[0].data.quiet_minutes, 30);
  assert.equal(over[0].data.last_strike_at, '2027-01-15T08:00:55Z');
  const quietAll = areaReading(strikes, at(51), quiet10);
  assert.deepEqual(keys(areaEvents(AREA, quiet10, quietAll)), [
    'storm_over:30',
    'storm_over:50',
    'storm_over:100',
    'storm_over:200',
  ]);
  // A new storm: announced again.
  strikes.push(strike(9, 60));
  const again = areaReading(strikes, at(60), quietAll);
  assert.ok(keys(areaEvents(AREA, quietAll, again)).includes('lightning_nearby:10'));
});

test('storm approaching: once per storm', () => {
  const calm = areaReading([], at(0));
  const strikes = [strike(28, 1), strike(27, 3), strike(20, 6), strike(21, 8)];
  const r1 = areaReading(strikes, at(8), calm);
  assert.equal(r1.approaching, false);
  strikes.push(strike(12, 12), strike(13, 14));
  const r2 = areaReading(strikes, at(15), r1);
  const events = areaEvents(AREA, r1, r2, { language: 'en' });
  assert.deepEqual(keys(events), ['lightning_nearby:15', 'storm_approaching:']);
  const approach = events.at(-1).data;
  assert.equal(approach.km, 12);
  assert.equal(approach.direction, 'NE');
  assert.equal(approach.speed_kmh, 90);
  strikes.push(strike(6, 17), strike(5, 19));
  const r3 = areaReading(strikes, at(20), r2);
  assert.ok(!keys(areaEvents(AREA, r2, r3)).includes('storm_approaching:'), 'latched');
});
