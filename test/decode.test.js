// -----------------------------------------------------------------------------
// The LZW decoder against real frames of the feed (captured on 2026-10-14 from
// wss://ws1.blitzortung.org/), whose decoded text was produced by an
// independent Python port of the map's decoder (fixtures/reference-decode.py).
// The set is deliberately tiny: see "Refreshing the fixtures" in CLAUDE.md.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, parseFrame } from '../src/blitzortung/decode.js';
import { encode, realFrames } from './helpers/fakeSocket.js';

/** Codes that name the entry being defined at that very position (prev + prev[0]). */
const definingCodes = (frame) =>
  [...frame].filter((c, i) => i > 0 && c.charCodeAt(0) >= 256 && c.charCodeAt(0) - 256 === i - 1)
    .length;

test('the real frames decode to the exact text of the reference decoder', () => {
  const { frames, decoded } = realFrames();
  assert.ok(frames.length > 0 && frames.length <= 40, 'a handful of frames, never a dump');
  assert.equal(decoded.length, frames.length);
  for (const [i, frame] of frames.entries()) {
    assert.equal(decode(frame), decoded[i], `frame ${i + 1}`);
  }
  // The edge cases the decoder relies on are still exercised by real frames:
  // every frame uses the dictionary, it grows past a thousand entries, and
  // the server does emit the code it is defining (the prev + prev[0] case).
  assert.ok(frames.every((f) => [...f].some((c) => c.charCodeAt(0) >= 256)));
  assert.ok(frames.some((f) => [...f].some((c) => c.charCodeAt(0) >= 256 + 1000)));
  assert.ok(frames.filter((f) => definingCodes(f) > 0).length >= 10);
});

test('a real frame parses to a strike with its time, position and detectors', () => {
  const { frames } = realFrames();
  const strike = parseFrame(frames[0]);
  assert.equal(strike.lat, 36.717925);
  assert.equal(strike.lon, -99.83445);
  assert.equal(Math.round(strike.time / 1e6), 1791939497822); // ns -> ms
  assert.equal(strike.region, 0);
  assert.ok(Array.isArray(strike.sig) && strike.sig.length > 0);
  for (const key of ['alt', 'pol', 'mds', 'mcg', 'status', 'delay', 'latc', 'lonc']) {
    assert.ok(key in strike, key);
  }
});

test('the code being defined (KwKwK) and the edge cases', () => {
  // "aaaa..." makes the encoder emit a code before the decoder has it.
  const text = 'a'.repeat(50) + '{"x":"abababababab"}';
  const frame = encode(text);
  assert.ok(frame.length < text.length);
  assert.equal(decode(frame), text);
  assert.equal(decode(''), '');
  assert.equal(decode(undefined), '');
  assert.equal(decode('x'), 'x');
  assert.equal(parseFrame('not json'), undefined);
  assert.equal(parseFrame(encode('[1,2]')), undefined, 'an array is not a message');
  assert.deepEqual(parseFrame(encode('{"timeout":true}')), { timeout: true });
});
