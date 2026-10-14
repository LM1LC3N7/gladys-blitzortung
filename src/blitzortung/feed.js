// -----------------------------------------------------------------------------
// The live feed of the Blitzortung network: the ONLY network access of the
// integration. One websocket at a time, to one of the configured servers:
//
//   open -> send {"a":111} -> one LZW-coded JSON strike per message
//
// On a failure (refused, closed, a "timeout" message from the server, or no
// message for WATCHDOG) the next server of the list is tried after a backoff
// of 5 s doubling up to 5 minutes. The servers also close every connection
// after about 6 minutes: a connection that delivered strikes for STABLE_AFTER
// is replaced after 1 s, and the backoff restarts from 5 s.
// -----------------------------------------------------------------------------

import {
  RECONNECT,
  STABLE_AFTER,
  SUBSCRIBE_MESSAGE,
  USER_AGENT,
  WATCHDOG,
  WATCHDOG_CHECK,
} from '../constants.js';
import { parseFrame } from './decode.js';

/** Node's global WebSocket (undici); `headers` is a Node extension. */
let defaultSocketFactory = (url) =>
  new globalThis.WebSocket(url, { headers: { 'User-Agent': USER_AGENT } });

/** Replace the default socket factory (tests only). Returns the previous one. */
export function setSocketFactory(impl) {
  const previous = defaultSocketFactory;
  defaultSocketFactory = impl;
  return previous;
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
};

export class LightningFeed {
  constructor({
    servers,
    onStrike,
    onStatus = () => {},
    logger = console,
    timers = { setTimeout, clearTimeout, setInterval, clearInterval },
    now = Date.now,
    random = Math.random,
    socketFactory,
  }) {
    this.servers = servers;
    this.onStrike = onStrike;
    this.onStatus = onStatus;
    this.logger = logger;
    this.timers = timers;
    this.now = now;
    this.random = random;
    this.socketFactory = socketFactory;
    this.stopped = true;
    this.socket = undefined;
    this.url = undefined;
    this.index = 0;
    this.attempts = 0;
    this.retryTimer = undefined;
    this.watchdogTimer = undefined;
    this.connected = false;
    this.connectedAt = undefined;
    this.lastMessageAt = undefined;
    this.lastActivityAt = 0;
    /** Messages of the current connection, and the ones that did not decode. */
    this.received = 0;
    this.invalid = 0;
  }

  start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.attempts = 0;
    // A random first server spreads the integrations over the servers.
    this.index = Math.floor(this.random() * this.servers.length) % this.servers.length;
    this.watchdogTimer = this.timers.setInterval(() => this.checkWatchdog(), WATCHDOG_CHECK);
    this.open();
  }

  stop() {
    this.stopped = true;
    this.timers.clearTimeout(this.retryTimer);
    this.timers.clearInterval(this.watchdogTimer);
    this.retryTimer = undefined;
    this.watchdogTimer = undefined;
    this.closeSocket();
    this.connected = false;
  }

  /** What the "Test" button shows: the server, since when, the message rate. */
  stats() {
    const now = this.now();
    const minutes = this.connectedAt === undefined ? 0 : (now - this.connectedAt) / 60_000;
    return {
      connected: this.connected,
      server: this.url ? hostOf(this.url) : null,
      perMinute: minutes > 0 ? Math.round(this.received / minutes) : null,
      lastMessageSeconds:
        this.lastMessageAt === undefined ? null : Math.round((now - this.lastMessageAt) / 1000),
      invalid: this.invalid,
    };
  }

  open() {
    if (this.stopped) {
      return;
    }
    const url = this.servers[this.index];
    this.url = url;
    this.lastActivityAt = this.now();
    this.connectedAt = undefined;
    this.received = 0;
    let socket;
    try {
      socket = (this.socketFactory ?? defaultSocketFactory)(url);
    } catch (err) {
      this.fail(`cannot open (${err.message})`);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket === socket) {
        this.send(socket, SUBSCRIBE_MESSAGE);
      }
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) {
        this.handle(event?.data);
      }
    };
    socket.onerror = (event) => {
      if (this.socket === socket) {
        this.logger.debug?.(`Blitzortung ${hostOf(url)} error: ${event?.message ?? 'unknown'}`);
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) {
        return; // closed by us
      }
      this.socket = undefined;
      this.fail(`closed (${event?.code ?? '?'})`);
    };
  }

  send(socket, text) {
    try {
      socket.send(text);
    } catch (err) {
      this.logger.warn(`Blitzortung send failed: ${err.message}`);
    }
  }

  handle(data) {
    const now = this.now();
    this.lastActivityAt = now;
    this.lastMessageAt = now;
    this.received += 1;
    if (this.connectedAt === undefined) {
      this.connectedAt = now;
      this.connected = true;
      this.logger.info?.(`Blitzortung feed: receiving from ${hostOf(this.url)}`);
      this.onStatus({ connected: true, server: this.url });
    }
    const message = typeof data === 'string' ? parseFrame(data) : undefined;
    if (!message) {
      this.invalid += 1;
      if (this.invalid === 1 || this.invalid % 1000 === 0) {
        this.logger.warn(`Blitzortung: ${this.invalid} message(s) that do not decode`);
      }
      return;
    }
    if ('timeout' in message) {
      // The map shows "time out" on this message: the server dropped us.
      this.fail('timeout message from the server');
      return;
    }
    try {
      this.onStrike(message);
    } catch (err) {
      this.logger.warn(`Strike handling failed: ${err.message}`);
    }
  }

  checkWatchdog() {
    if (this.stopped || this.retryTimer) {
      return;
    }
    if (this.now() - this.lastActivityAt >= WATCHDOG) {
      this.fail(`no message for ${Math.round(WATCHDOG / 1000)} s`);
    }
  }

  fail(reason) {
    if (this.stopped || this.retryTimer) {
      return;
    }
    // Stable: it delivered strikes for a while (a silent end does not count).
    const stable =
      this.connectedAt !== undefined && this.lastMessageAt - this.connectedAt >= STABLE_AFTER;
    const from = hostOf(this.url);
    this.closeSocket();
    this.connected = false;
    this.connectedAt = undefined;
    this.index = (this.index + 1) % this.servers.length;
    let delay;
    if (stable) {
      delay = RECONNECT.afterStable;
      this.attempts = 0;
    } else {
      delay = Math.min(RECONNECT.max, RECONNECT.base * 2 ** this.attempts);
      this.attempts += 1;
    }
    const next = this.servers[this.index];
    // The routine recycling (every 6 minutes) is not worth a warning.
    const log = stable ? (this.logger.info ?? this.logger.warn) : this.logger.warn;
    log.call(
      this.logger,
      `Blitzortung feed ${from}: ${reason}; next attempt in ${delay / 1000} s on ${hostOf(next)}`,
    );
    this.onStatus({ connected: false, server: next, retryInMs: delay });
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = undefined;
      this.open();
    }, delay);
  }

  closeSocket() {
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try {
        socket.close();
      } catch {
        // already closed or still connecting
      }
    }
  }
}
