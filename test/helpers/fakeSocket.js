// -----------------------------------------------------------------------------
// A fake WebSocket for the feed: the test plays the Blitzortung server. Also
// the LZW encoder of the server, to build frames for made-up strikes. No test
// opens a real socket: the default factory throws.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setSocketFactory } from '../../src/blitzortung/feed.js';

setSocketFactory((url) => {
  throw new Error(`Real websocket opened in a test: ${url}`);
});

/** The server side: LZW over the JSON text, codes >= 256 as single chars. */
export function encode(text) {
  if (text.length === 0) {
    return '';
  }
  const dictionary = new Map();
  let next = 256;
  let phrase = text[0];
  const out = [];
  const emit = (p) => out.push(p.length === 1 ? p : String.fromCharCode(dictionary.get(p)));
  for (let i = 1; i < text.length; i += 1) {
    const c = text[i];
    if (dictionary.has(phrase + c)) {
      phrase += c;
    } else {
      emit(phrase);
      dictionary.set(phrase + c, next);
      next += 1;
      phrase = c;
    }
  }
  emit(phrase);
  return out.join('');
}

/** The instant of the first real frame (2026-10-14T00:58:17.822Z), in ms. */
export const FIXTURE_NOW = 1791939497822;

let counter = 0;

/**
 * A frame for a strike at { lat, lon }, shaped like the real ones. `atMs` is
 * the strike time; `time` (ns) forces the id, to replay the same strike.
 */
export function strikeFrame({ lat, lon, atMs = FIXTURE_NOW, time, latc = 0, lonc = 0 }) {
  counter += 1;
  const raw = {
    time: time ?? atMs * 1e6 + counter * 4096,
    lat,
    lon,
    alt: 0,
    pol: 0,
    mds: 9000,
    mcg: 180,
    status: 1,
    region: 1,
    sig: [{ sta: 1, time: 3114715, lat: 50, lon: 4, alt: 100, status: 10 }],
    delay: 4.2,
    lonc,
    latc,
  };
  return encode(JSON.stringify(raw));
}

/** The real frames captured on 2026-10-14 and their decoded text. */
export function realFrames() {
  const lines = (name) =>
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
      .split('\n')
      .filter(Boolean);
  return { frames: lines('frames.txt'), decoded: lines('frames.decoded.jsonl') };
}

export class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(text) {
    this.sent.push(text);
  }

  close() {
    this.closed = true;
  }

  // --- The server's side --------------------------------------------------------
  open() {
    this.onopen?.();
  }

  receive(frame) {
    this.onmessage?.({ data: frame });
  }

  drop(code = 1006) {
    this.onerror?.({ message: 'dropped' });
    this.onclose?.({ code });
  }
}

export function createSocketFactory() {
  const sockets = [];
  return {
    sockets,
    last: () => sockets[sockets.length - 1],
    factory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
}
