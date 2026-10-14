// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake feed server that
// replays the real frames captured on 2026-10-14 (a storm in Oklahoma).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { BlitzortungApp } from '../src/app.js';
import { LightningFeed } from '../src/blitzortung/feed.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import { FIXTURE_NOW, createSocketFactory, realFrames, strikeFrame } from './helpers/fakeSocket.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};
const MIN = 60_000;

/** A house in the middle of the captured storm, and one without location. */
const HOME = { id: 1, name: 'Home', selector: 'home', latitude: 35.1, longitude: -99.95 };
const CABIN = { id: 2, name: 'Cabin', selector: 'cabin', latitude: null, longitude: null };
const AREA = 'ext:blitzortung:area:home';
const created = { external_id: AREA, name: 'Lightning near Home', params: [] };

async function setup({ config = {}, houses = [HOME, CABIN], devices = [] } = {}) {
  const gladys = createFakeGladys({ selector: 'blitzortung', config, houses, devices });
  const timers = createFakeTimers();
  const clock = { now: FIXTURE_NOW };
  const sockets = createSocketFactory();
  const app = new BlitzortungApp({
    gladys,
    logger: quiet,
    now: () => clock.now,
    timers,
    feedFactory: (options) =>
      new LightningFeed({ ...options, socketFactory: sockets.factory, random: () => 0 }),
  });
  gladys.onScanRequest(() => app.scan());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onDeviceDeleted((device) => app.deviceDeleted(device));
  gladys.onSceneAction(SCENE_ACTIONS.STATUS, (fields) => app.getStatus(fields));
  gladys.onWidgetGet(WIDGETS.STORM, (request) => app.getWidget(request));
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  await gladys.connect();
  await app.start(config);
  return { app, gladys, timers, clock, sockets };
}

/** The real frames of the fixture, through the open socket. */
function replay(socket) {
  socket.open();
  for (const frame of realFrames().frames) {
    socket.receive(frame);
  }
}

const events = (gladys, key) => gladys.fake.sceneEvents.filter((e) => e.key === key);

test('discovery: one device per located house; no device, no feed', async () => {
  const { gladys, sockets } = await setup();
  const devices = gladys.fake.discoveredDevices;
  assert.equal(devices.length, 1, 'the cabin has no location');
  assert.equal(devices[0].external_id, AREA);
  assert.equal(devices[0].name, 'Lightning near Home');
  assert.deepEqual(
    devices[0].features.map((f) => f.external_id.split(':').at(-1)),
    ['strikes', 'nearest_km', 'bearing', 'direction', 'last_strike'],
  );
  assert.equal(sockets.sockets.length, 0, 'the worldwide feed is not read for nothing');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /Open Discovery/);
});

test('no located house, or no access to the houses: the status says what to do', async () => {
  const none = await setup({ houses: [CABIN] });
  assert.equal(none.gladys.fake.connectionStatus.connected, false);
  assert.match(none.gladys.fake.connectionStatus.message.fr, /Aucune maison localisée/);
  assert.deepEqual(none.gladys.fake.discoveredDevices, []);
  const denied = await setup({ devices: [created] });
  denied.gladys.getHouses = async () => {
    throw new Error('403 FORBIDDEN');
  };
  denied.app.areas.clear();
  await denied.app.start({});
  assert.match(denied.gladys.fake.connectionStatus.message.en, /not available \(403 FORBIDDEN\)/);
  assert.equal(denied.sockets.last().closed, true, 'the feed is closed');
});

test('real frames: strikes near the house, deduplicated, events once, states on the tick', async () => {
  const { gladys, sockets, timers } = await setup({ devices: [created] });
  const socket = sockets.last();
  assert.equal(socket.url, 'wss://ws1.blitzortung.org/');
  assert.match(gladys.fake.connectionStatus.message.en, /Connecting/);
  assert.equal(gladys.fake.lastState(`${AREA}:strikes`), 0, 'the baseline is published');
  assert.equal(gladys.fake.lastState(`${AREA}:nearest_km`), 30, 'calm: the radius');
  replay(socket);
  assert.deepEqual(socket.sent, ['{"a":111}']);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /from ws1\.blitzortung\.org: watching 1 house/,
  );
  // One "lightning within" per distance: 17.7 km opens 20 km and more, 4.4 km the rest.
  const nearby = events(gladys, SCENE_TRIGGERS.NEARBY);
  assert.deepEqual(
    nearby.map((e) => e.data.distance),
    ['20', '30', '50', '100', '200', '5', '10', '15'],
  );
  assert.equal(nearby[0].data.km, 17.7);
  assert.equal(nearby[0].data.area, AREA);
  // States: not before the tick (15 s), then the 28 distinct strikes of 30 raw.
  assert.equal(gladys.fake.lastState(`${AREA}:strikes`), 0);
  await timers.runIntervals();
  assert.equal(gladys.fake.lastState(`${AREA}:strikes`), 28);
  assert.equal(gladys.fake.lastState(`${AREA}:nearest_km`), 0.5);
  assert.equal(gladys.fake.lastState(`${AREA}:bearing`), 144);
  assert.equal(gladys.fake.lastState(`${AREA}:direction`), 'SE');
  assert.equal(gladys.fake.lastState(`${AREA}:last_strike`), '2026-10-14T00:58:56Z');
  assert.ok(gladys.fake.widgetRefreshes.length > 0);
  // The same frames again: the same strikes, nothing new.
  for (const frame of realFrames().frames) {
    socket.receive(frame);
  }
  await timers.runIntervals();
  assert.equal(gladys.fake.lastState(`${AREA}:strikes`), 28);
  assert.equal(events(gladys, SCENE_TRIGGERS.NEARBY).length, 8);
});

test('the storm fades: out of the window, then "storm over" after the quiet period', async () => {
  const { app, gladys, sockets, timers, clock } = await setup({
    devices: [created],
    config: { language: 'en', quiet_minutes: 30 },
  });
  replay(sockets.last());
  await timers.runIntervals();
  clock.now += 16 * MIN;
  sockets.last().receive(strikeFrame({ lat: 0, lon: 0 })); // the world goes on
  await timers.runIntervals();
  assert.equal(gladys.fake.lastState(`${AREA}:strikes`), 0);
  assert.equal(gladys.fake.lastState(`${AREA}:nearest_km`), 30);
  assert.equal(gladys.fake.lastState(`${AREA}:direction`), '—');
  const fading = (await gladys.fake.widgetGet(WIDGETS.STORM, { settings: {}, language: 'en' })).data
    .content;
  assert.equal(fading.components.find((c) => c.type === 'status').items[0].value, '16 min ago');
  assert.equal(events(gladys, SCENE_TRIGGERS.OVER).length, 0);
  clock.now += 15 * MIN;
  await timers.runIntervals();
  const over = events(gladys, SCENE_TRIGGERS.OVER);
  assert.equal(over.length, 8, 'every distance');
  const radius = over.find((e) => e.data.distance === '30');
  assert.equal(radius.data.last_strike_at, '2026-10-14T00:58:56Z');
  assert.equal(
    over.find((e) => e.data.distance === '5').data.last_strike_at,
    '2026-10-14T00:58:55Z',
  );
  const status = await gladys.fake.sceneAction(SCENE_ACTIONS.STATUS, { area: AREA });
  assert.equal(status.data.outputs.storm, false);
  assert.equal(status.data.outputs.minutes_since_last, 31);
  // 15 silent minutes in this fake world: the watchdog moved to the next server.
  assert.equal(sockets.last().closed, true);
  await timers.runTimeouts();
  assert.equal(sockets.last().url, 'wss://ws7.blitzortung.org/');
  // A new strike at 3 km: a new storm, announced again.
  sockets.last().receive(strikeFrame({ lat: 35.12, lon: -99.93, atMs: clock.now }));
  assert.equal(events(gladys, SCENE_TRIGGERS.NEARBY).length, 16);
  app.stop();
});

test('scene action, widget and test button during the storm', async () => {
  const { gladys, sockets, timers, clock } = await setup({ devices: [created] });
  replay(sockets.last());
  clock.now += 30_000;
  await timers.runIntervals();
  const status = await gladys.fake.sceneAction(SCENE_ACTIONS.STATUS, { area: AREA });
  assert.equal(status.success, true);
  assert.deepEqual(status.data.outputs, {
    count: 28,
    nearest_km: 0.5,
    bearing: 144,
    direction: 'SE',
    minutes_since_last: 0,
    storm: true,
    approaching: false,
    radius_km: 30,
    window_minutes: 15,
    feed_connected: true,
  });
  const wrong = await gladys.fake.sceneAction(SCENE_ACTIONS.STATUS, { area: 'ext:other:x' });
  assert.equal(wrong.success, false);
  const content = (
    await gladys.fake.widgetGet(WIDGETS.STORM, { settings: { device: AREA }, language: 'fr' })
  ).data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text, 'Lightning near Home');
  const item = content.components.find((c) => c.type === 'status').items[0];
  assert.equal(item.value, 'Orage à 0.5 km SE');
  assert.equal(item.color, 'danger');
  assert.match(content.components.at(-1).text.fr, /Blitzortung\.org/);
  const report = (await gladys.fake.action(ACTIONS.TEST)).data.message;
  assert.match(report.en, /receiving from ws1\.blitzortung\.org/);
  assert.match(report.en, /Home: 28 strike\(s\) within 30 km in 15 min, nearest 0\.5 km SE/);
  assert.match(report.fr, /Cabin|Home/);
});

test('far strikes are ignored; a restart in the middle of a storm does not announce it twice', async () => {
  const { app, gladys, sockets } = await setup({ devices: [created] });
  sockets.last().receive(strikeFrame({ lat: 48.85, lon: 2.35 })); // Paris
  assert.equal(gladys.fake.sceneEvents.length, 0);
  sockets.last().receive(strikeFrame({ lat: 35.15, lon: -99.95 })); // 5.6 km north
  assert.equal(events(gladys, SCENE_TRIGGERS.NEARBY).length, 7);
  await app.start({ radius_km: 40 }); // the user changed the configuration
  assert.equal(sockets.sockets.length, 2, 'one feed at a time: the old one is closed');
  assert.equal(sockets.sockets[0].closed, true);
  sockets.last().receive(strikeFrame({ lat: 35.16, lon: -99.95 }));
  assert.equal(events(gladys, SCENE_TRIGGERS.NEARBY).length, 7, 'same storm');
  app.stop();
});

test('the connection status: green through a quick reconnection, red when it fails', async () => {
  const { gladys, sockets, timers, clock } = await setup({ devices: [created] });
  sockets.last().open();
  sockets.last().receive(strikeFrame({ lat: 0, lon: 0 }));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  clock.now += 6 * MIN;
  sockets.last().receive(strikeFrame({ lat: 0, lon: 0 }));
  sockets.last().drop(1005); // the server recycles the connection
  assert.equal(timers.timeouts()[0].ms, 1_000);
  assert.equal(gladys.fake.connectionStatus.connected, true, 'no red flash');
  await timers.runTimeouts();
  sockets.last().drop(1006); // the next server refuses
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable: next attempt in 5 s/);
  await timers.runTimeouts();
  sockets.last().receive(strikeFrame({ lat: 0, lon: 0 }));
  assert.match(gladys.fake.connectionStatus.message.en, /from ws8\.blitzortung\.org/);
});

test('deleting the last device closes the feed', async () => {
  const { gladys, sockets } = await setup({ devices: [created] });
  const socket = sockets.last();
  await gladys.fake.deviceDeleted(created);
  assert.equal(socket.closed, true);
  assert.match(gladys.fake.connectionStatus.message.en, /Open Discovery/);
  await gladys.fake.deviceCreated(created);
  assert.equal(sockets.sockets.length, 2, 'reopened when a device comes back');
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  await gladys.fake.deviceDeleted(created);
});
