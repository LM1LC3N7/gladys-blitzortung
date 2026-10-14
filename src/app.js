// -----------------------------------------------------------------------------
// The integration itself: the located houses of Gladys, discovery (one device
// per house), the live feed (opened only while a device exists), the strikes
// near each house, the 15-second publication of the states, the scene
// triggers, the scene action and the widget. index.js only wires the SDK
// handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LightningFeed } from './blitzortung/feed.js';
import { normalizeConfig } from './config.js';
import {
  MAX_STRIKES_PER_AREA,
  PUBLISH_INTERVAL,
  RECONNECT,
  STATE_HEARTBEAT,
  WIDGETS,
} from './constants.js';
import { areaStates, buildAreaDevice, ids, parseExternalId } from './devices.js';
import { boundingBox, compassPoint } from './geo.js';
import { T } from './i18n.js';
import { areaReading, minutesSince, nearbyStrike, pruneStrikes, strikeOf } from './model.js';
import { areaEvents } from './triggers.js';
import { stormWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };
const located = (house) => Number.isFinite(house?.latitude) && Number.isFinite(house?.longitude);

export class BlitzortungApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'blitzortung' }),
    now = Date.now,
    timers = defaultTimers,
    feedFactory = (options) => new LightningFeed(options),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.feedFactory = feedFactory;
    this.config = normalizeConfig();
    /**
     * house selector -> { house, deviceId, latitude, longitude, box, strikes,
     * ids, reading, watched, summary }. Kept across restarts of the same
     * process, so a configuration change in the middle of a storm does not
     * announce it twice.
     */
    this.areas = new Map();
    this.housesError = undefined;
    this.feed = undefined;
    this.tickTimer = undefined;
    this.lastStatus = undefined;
    this.statusConnected = undefined;
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    if (this.config.invalidServers.length > 0) {
      this.logger.warn(T.invalidServers(this.config.invalidServers).en);
    }
    try {
      await this.loadHouses();
      await this.publishDevices();
    } catch (err) {
      this.logger.warn(`Discovery failed: ${err.message}`);
    }
    if (generation !== this.generation) {
      return;
    }
    await this.syncFeed();
  }

  stop() {
    this.generation += 1;
    this.stopFeed();
  }

  stopFeed() {
    this.feed?.stop();
    this.feed = undefined;
    this.timers.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    this.statusConnected = connected;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  // --- Houses and discovery ----------------------------------------------------

  /** The located houses of Gladys become areas (the strikes of a kept area stay). */
  async loadHouses() {
    let houses;
    try {
      houses = await this.gladys.getHouses();
      this.housesError = undefined;
    } catch (err) {
      // Keep the areas we know: a hiccup of Gladys must not forget a storm.
      this.housesError = err.message;
      this.logger.warn(`Houses unavailable (location not granted?): ${err.message}`);
      return;
    }
    const areas = new Map();
    for (const house of houses ?? []) {
      if (!located(house)) {
        continue;
      }
      const known = this.areas.get(house.selector);
      const moved =
        known && (known.latitude !== house.latitude || known.longitude !== house.longitude);
      areas.set(house.selector, {
        strikes: [],
        ids: new Set(),
        reading: undefined,
        summary: undefined,
        ...(known && !moved ? known : {}),
        house,
        deviceId: ids.area(this.gladys, house.selector),
        latitude: house.latitude,
        longitude: house.longitude,
        box: boundingBox(house, this.config.radiusKm),
        watched: false,
      });
    }
    this.areas = areas;
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(
      [...this.areas.values()].map((area) => buildAreaDevice(this.gladys, area.house)),
    );
  }

  /** Discovery asked by the user: the houses may have moved since the start. */
  async scan() {
    await this.loadHouses();
    await this.publishDevices();
    await this.syncFeed();
  }

  async deviceCreated(device) {
    if (parseExternalId(device?.external_id)) {
      await this.syncFeed();
    }
  }

  async deviceDeleted(device) {
    if (parseExternalId(device?.external_id)) {
      await this.syncFeed();
    }
  }

  // --- The feed ------------------------------------------------------------------

  /**
   * Open the feed while at least one house device exists, close it otherwise:
   * the worldwide feed is never read for nothing.
   */
  async syncFeed() {
    const created = new Set((this.gladys.devices ?? []).map((d) => d.external_id));
    const now = this.now();
    let watched = 0;
    for (const area of this.areas.values()) {
      area.watched = created.has(area.deviceId);
      if (area.watched) {
        watched += 1;
        // The baseline reading, before any strike: the first one fires nothing.
        area.reading ??= areaReading(area.strikes, this.readingOptions(now));
      }
    }
    if (watched === 0) {
      this.stopFeed();
      if (this.housesError) {
        await this.setStatus(false, T.housesUnavailable(this.housesError));
      } else if (this.areas.size === 0) {
        await this.setStatus(false, T.noHouse);
      } else {
        await this.setStatus(true, T.noDevice);
      }
      return;
    }
    if (!this.feed) {
      this.feed = this.feedFactory({
        servers: this.config.servers,
        onStrike: (raw) => this.onStrike(raw),
        onStatus: (status) => this.onFeedStatus(status),
        logger: this.logger,
        timers: this.timers,
        now: this.now,
      });
      // Started before any await: a stop() in between finds it running.
      this.feed.start();
      this.tickTimer = this.timers.setInterval(
        () => this.tick().catch((err) => this.logger.warn(`Publication failed: ${err.message}`)),
        PUBLISH_INTERVAL,
      );
      await this.setStatus(false, T.connecting);
    } else if (this.feed.connected) {
      await this.setStatus(true, T.ok(this.feed.url, watched));
    }
    await this.tick();
  }

  onFeedStatus({ connected, server, retryInMs }) {
    if (!connected && retryInMs < RECONNECT.base && this.statusConnected === true) {
      // The servers recycle a connection every 6 minutes: the quick
      // reconnection after a good connection is not worth a red status.
      return;
    }
    const watched = [...this.areas.values()].filter((a) => a.watched).length;
    const status = connected
      ? this.setStatus(true, T.ok(server, watched))
      : this.setStatus(false, T.lost(Math.round(retryInMs / 1000)));
    status.catch(() => {});
  }

  readingOptions(now) {
    return {
      now,
      radiusKm: this.config.radiusKm,
      windowMinutes: this.config.windowMinutes,
      quietMinutes: this.config.quietMinutes,
    };
  }

  /** One strike of the world: kept by the houses it is close to. */
  onStrike(raw) {
    const strike = strikeOf(raw);
    if (!strike) {
      return;
    }
    const now = this.now();
    for (const area of this.areas.values()) {
      if (!area.watched) {
        continue;
      }
      const near = nearbyStrike(strike, area, this.config.radiusKm, now);
      if (!near || area.ids.has(near.id)) {
        continue; // far away, or the same strike from another solver
      }
      area.ids.add(near.id);
      area.strikes.push(near);
      // Events at once ("lightning within 5 km" cannot wait); states at the tick.
      this.evaluate(area, now);
    }
  }

  /** A new reading of an area, and the scene events of the transition. */
  evaluate(area, now) {
    const reading = areaReading(area.strikes, this.readingOptions(now), area.reading);
    const events = areaEvents(area.deviceId, area.reading, reading, {
      language: this.config.language,
      quietMinutes: this.config.quietMinutes,
    });
    area.reading = reading;
    for (const event of events) {
      this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    return events;
  }

  /** Every 15 s: forget the old strikes, re-read every area, publish what changed. */
  async tick() {
    const now = this.now();
    const keepMs = (Math.max(this.config.windowMinutes, this.config.quietMinutes) + 2) * 60_000;
    let refresh = false;
    const watched = [...this.areas.values()].filter((a) => a.watched);
    for (const area of watched) {
      area.strikes = pruneStrikes(area.strikes, now, keepMs, MAX_STRIKES_PER_AREA);
      area.ids = new Set(area.strikes.map((s) => s.id));
      this.evaluate(area, now);
      const { count, nearestKm, storm, approachLatched } = area.reading;
      // The minutes since the last strike matter on the widget only during a storm.
      const since = storm ? minutesSince(area.reading, now) : null;
      const summary = JSON.stringify([count, nearestKm, storm, approachLatched, since]);
      refresh ||= summary !== area.summary;
      area.summary = summary;
    }
    for (const area of watched) {
      await this.gladys
        .publishChangedStates(
          areaStates(area.deviceId, area.reading, {
            radiusKm: this.config.radiusKm,
            language: this.config.language,
          }),
          { heartbeat: STATE_HEARTBEAT },
        )
        .catch((err) => this.logger.warn(`States of ${area.house.name} failed: ${err.message}`));
    }
    if (refresh) {
      this.gladys.requestWidgetRefresh(WIDGETS.STORM);
    }
  }

  // --- Scene action ------------------------------------------------------------------

  areaOf(externalId) {
    const parsed = parseExternalId(externalId);
    const area = parsed && this.areas.get(parsed.houseSelector);
    if (!area) {
      throw new Error(`Unknown lightning device ${externalId}`);
    }
    return area;
  }

  /** "Lightning status": the current reading of a house, for the next actions. */
  async getStatus(fields = {}) {
    const area = this.areaOf(fields.area);
    const now = this.now();
    const reading =
      area.reading ?? areaReading(area.strikes, this.readingOptions(now), area.reading);
    return {
      count: reading.count,
      nearest_km: reading.nearestKm,
      bearing: reading.bearing,
      direction:
        reading.bearing === null ? null : compassPoint(reading.bearing, this.config.language),
      minutes_since_last: minutesSince(reading, now),
      storm: reading.storm,
      approaching: reading.approachLatched,
      radius_km: this.config.radiusKm,
      window_minutes: this.config.windowMinutes,
      feed_connected: this.feed?.connected === true,
    };
  }

  // --- Widget ------------------------------------------------------------------------

  async getWidget({ settings = {}, language } = {}) {
    const lang = language === 'en' || language === 'fr' ? language : this.config.language;
    const watched = [...this.areas.values()].filter((a) => a.watched);
    const parsed = parseExternalId(settings.device);
    const area = parsed ? this.areas.get(parsed.houseSelector) : watched[0];
    if (!area) {
      return {
        ttl_seconds: 300,
        components: [{ type: 'text', text: T.widget.pickHouse, variant: 'body' }],
      };
    }
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === area.deviceId);
    return stormWidget({
      name: device?.name ?? area.house.name,
      reading: this.feed ? area.reading : undefined,
      now: this.now(),
      radiusKm: this.config.radiusKm,
      windowMinutes: this.config.windowMinutes,
      language: lang,
    });
  }

  // --- Configuration screen button ------------------------------------------------------

  async testConnection() {
    const lines = { en: [], fr: [] };
    const add = (text) => {
      lines.en.push(text.en);
      lines.fr.push(text.fr);
    };
    const stats = this.feed?.stats();
    if (!this.feed) {
      add(this.areas.size === 0 ? T.noHouse : T.noDevice);
    } else if (stats.connected) {
      add({
        en: `Feed: receiving from ${stats.server}, ${stats.perMinute ?? '?'} strikes per minute worldwide, last message ${stats.lastMessageSeconds} s ago.`,
        fr: `Flux : reçu de ${stats.server}, ${stats.perMinute ?? '?'} impacts par minute dans le monde, dernier message il y a ${stats.lastMessageSeconds} s.`,
      });
    } else {
      add({
        en: `Feed: not connected yet (server ${stats.server ?? '?'}); it retries by itself.`,
        fr: `Flux : pas encore connecté (serveur ${stats.server ?? '?'}) ; il réessaie tout seul.`,
      });
    }
    const now = this.now();
    for (const area of this.areas.values()) {
      const r = area.reading;
      if (!area.watched || !r) {
        add({
          en: `${area.house.name}: no device yet (Discovery).`,
          fr: `${area.house.name} : pas encore d'appareil (Découverte).`,
        });
      } else if (r.count > 0) {
        const en = compassPoint(r.bearing, 'en');
        const fr = compassPoint(r.bearing, 'fr');
        add({
          en: `${area.house.name}: ${r.count} strike(s) within ${this.config.radiusKm} km in ${this.config.windowMinutes} min, nearest ${r.nearestKm} km ${en}.`,
          fr: `${area.house.name} : ${r.count} impact(s) à moins de ${this.config.radiusKm} km en ${this.config.windowMinutes} min, le plus proche à ${r.nearestKm} km ${fr}.`,
        });
      } else {
        const since = minutesSince(r, now);
        add({
          en: `${area.house.name}: calm within ${this.config.radiusKm} km${since === null ? '' : ` (last strike ${since} min ago)`}.`,
          fr: `${area.house.name} : calme dans un rayon de ${this.config.radiusKm} km${since === null ? '' : ` (dernier impact il y a ${since} min)`}.`,
        });
      }
    }
    if (this.config.invalidServers.length > 0) {
      add(T.invalidServers(this.config.invalidServers));
    }
    return { en: lines.en.join('\n'), fr: lines.fr.join('\n') };
  }
}
