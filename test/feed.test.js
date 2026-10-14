import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LightningFeed } from '../src/blitzortung/feed.js';
import { createSocketFactory, encode, realFrames, strikeFrame } from './helpers/fakeSocket.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const SERVERS = [
  'wss://ws1.blitzortung.org/',
  'wss://ws7.blitzortung.org/',
  'wss://ws8.blitzortung.org/',
];

function setup() {
  const sockets = createSocketFactory();
  const timers = createFakeTimers();
  const clock = { now: 1_000_000 };
  const strikes = [];
  const statuses = [];
  const feed = new LightningFeed({
    servers: SERVERS,
    onStrike: (s) => strikes.push(s),
    onStatus: (s) => statuses.push(s),
    logger: quiet,
    timers,
    now: () => clock.now,
    random: () => 0,
    socketFactory: sockets.factory,
  });
  return { feed, sockets, timers, clock, strikes, statuses };
}

test('subscribe, then one strike per frame; connected at the first message', () => {
  const { feed, sockets, strikes, statuses } = setup();
  feed.start();
  const socket = sockets.last();
  assert.equal(socket.url, SERVERS[0]);
  socket.open();
  assert.deepEqual(socket.sent, ['{"a":111}']);
  assert.deepEqual(statuses, [], 'open is not enough: the server must send strikes');
  for (const frame of realFrames().frames.slice(0, 5)) {
    socket.receive(frame);
  }
  assert.equal(strikes.length, 5);
  assert.equal(strikes[0].lat, 36.717925);
  assert.deepEqual(statuses, [{ connected: true, server: SERVERS[0] }]);
  socket.receive('garbage');
  socket.receive(new ArrayBuffer(4));
  assert.equal(strikes.length, 5);
  assert.equal(feed.stats().invalid, 2);
  assert.equal(feed.stats().server, 'ws1.blitzortung.org');
  feed.stop();
});

test('a failure moves to the next server with a growing backoff', async () => {
  const { feed, sockets, timers, statuses } = setup();
  feed.start();
  sockets.last().drop();
  assert.equal(timers.timeouts()[0].ms, 5_000);
  assert.deepEqual(statuses.at(-1), { connected: false, server: SERVERS[1], retryInMs: 5_000 });
  await timers.runTimeouts();
  assert.equal(sockets.last().url, SERVERS[1]);
  sockets.last().drop();
  assert.equal(timers.timeouts()[0].ms, 10_000);
  await timers.runTimeouts();
  assert.equal(sockets.last().url, SERVERS[2]);
  sockets.last().drop();
  assert.equal(timers.timeouts()[0].ms, 20_000);
  await timers.runTimeouts();
  assert.equal(sockets.last().url, SERVERS[0], 'round robin');
  for (let i = 0; i < 10; i += 1) {
    sockets.last().drop();
    await timers.runTimeouts();
  }
  sockets.last().drop();
  assert.equal(timers.timeouts()[0].ms, 5 * 60_000, 'capped at 5 minutes');
  feed.stop();
});

test('a connection that lasted is replaced after 1 s, and the backoff restarts', async () => {
  const { feed, sockets, timers, clock } = setup();
  feed.start();
  sockets.last().drop();
  await timers.runTimeouts();
  // Strikes, then a drop 10 s later: not stable, the backoff keeps growing.
  sockets.last().receive(strikeFrame({ lat: 1, lon: 1 }));
  clock.now += 10_000;
  sockets.last().drop();
  assert.equal(timers.timeouts()[0].ms, 10_000);
  await timers.runTimeouts();
  // Strikes for 6 minutes, then the server recycles the connection: 1 s.
  sockets.last().receive(strikeFrame({ lat: 1, lon: 1 }));
  clock.now += 363_000;
  sockets.last().receive(strikeFrame({ lat: 1, lon: 1 }));
  sockets.last().drop(1005);
  assert.equal(timers.timeouts()[0].ms, 1_000);
  await timers.runTimeouts();
  // The next one fails at once: the backoff starts again from 5 s.
  sockets.last().drop();
  assert.equal(timers.timeouts()[0].ms, 5_000);
  feed.stop();
});

test('the watchdog: no message for 2 minutes, reconnect elsewhere', async () => {
  const { feed, sockets, timers, clock } = setup();
  feed.start();
  const first = sockets.last();
  first.open();
  first.receive(strikeFrame({ lat: 1, lon: 1 }));
  clock.now += 100_000;
  await timers.runIntervals();
  assert.equal(timers.timeouts().length, 0, '100 s of silence is tolerated');
  clock.now += 30_000;
  await timers.runIntervals();
  assert.equal(first.closed, true);
  assert.equal(timers.timeouts()[0].ms, 5_000);
  await timers.runTimeouts();
  assert.equal(sockets.last().url, SERVERS[1]);
  // A socket that never even opens is caught the same way.
  clock.now += 121_000;
  await timers.runIntervals();
  assert.equal(sockets.last().closed, true);
  feed.stop();
});

test('a "timeout" message from the server, a refused socket, and stop()', async () => {
  const { feed, sockets, timers } = setup();
  feed.start();
  sockets.last().receive(encode('{"timeout":true}'));
  assert.equal(sockets.last().closed, true);
  assert.equal(timers.timeouts().length, 1);
  feed.socketFactory = () => {
    throw new Error('ENOTFOUND');
  };
  await timers.runTimeouts();
  assert.equal(timers.timeouts().length, 1, 'retried later');
  feed.stop();
  assert.equal(timers.pending.size, 0, 'no timer left behind');
  await timers.runTimeouts();
  assert.equal(sockets.sockets.length, 1, 'no reconnection once stopped');
});
