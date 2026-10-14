// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

import { DEFAULT_SERVERS, LANGUAGES, serverUrl } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  radius_km: 30,
  window_minutes: 15,
  quiet_minutes: 30,
  language: 'fr',
  servers: DEFAULT_SERVERS.join(','),
};

export const LIMITS = {
  radius_km: [1, 200],
  window_minutes: [5, 60],
  quiet_minutes: [10, 180],
};

const number = (value, key) => {
  const [min, max] = LIMITS[key];
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== null
    ? Math.min(max, Math.max(min, Math.round(n)))
    : DEFAULTS[key];
};

/**
 * The `servers` field: short names ("ws1") or full wss:// URLs, separated by
 * commas or spaces. Anything else is reported, never connected to.
 *   { urls: ['wss://ws1.blitzortung.org/'], invalid: ['http://x'] }
 */
export function parseServers(text) {
  const urls = [];
  const invalid = [];
  for (const entry of String(text ?? '').split(/[\s,;]+/)) {
    const value = entry.trim();
    if (!value) {
      continue;
    }
    let url;
    if (/^ws\d{1,2}$/i.test(value)) {
      url = serverUrl(value.toLowerCase());
    } else {
      try {
        const parsed = new URL(value);
        url = parsed.protocol === 'wss:' ? parsed.href : undefined;
      } catch {
        url = undefined;
      }
    }
    if (!url) {
      invalid.push(value);
    } else if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  return { urls: urls.length > 0 ? urls : DEFAULT_SERVERS.map(serverUrl), invalid };
}

export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULTS.language).toLowerCase();
  const servers = parseServers(raw.servers ?? DEFAULTS.servers);
  return {
    radiusKm: number(raw.radius_km, 'radius_km'),
    windowMinutes: number(raw.window_minutes, 'window_minutes'),
    quietMinutes: number(raw.quiet_minutes, 'quiet_minutes'),
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
    servers: servers.urls,
    invalidServers: servers.invalid,
  };
}
