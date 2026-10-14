// -----------------------------------------------------------------------------
// The Gladys devices and their states. Pure.
//
// External ids (forever):
//   area:<houseSelector>   the lightning around one located house of Gladys
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { LIMITS } from './config.js';
import { compassPoint } from './geo.js';

export const FEATURE = {
  STRIKES: 'strikes',
  NEAREST: 'nearest_km',
  BEARING: 'bearing',
  DIRECTION: 'direction',
  LAST_STRIKE: 'last_strike',
};

export const ids = {
  area: (gladys, houseSelector) => gladys.externalId(`area:${houseSelector}`),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

/** The house selector of an area device, or undefined for any other id. */
export function parseExternalId(externalId) {
  const match = /:area:([^:]+)$/.exec(String(externalId ?? ''));
  return match ? { houseSelector: match[1] } : undefined;
}

const feature = (deviceId, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(deviceId, key),
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

/** The device of one located house: `house` is a getHouses() entry. */
export function buildAreaDevice(gladys, house) {
  const id = ids.area(gladys, house.selector);
  const maxKm = LIMITS.radius_km[1];
  return {
    name: `Lightning near ${house.name}`,
    external_id: id,
    features: [
      feature(id, FEATURE.STRIKES, 'Nearby strikes (window)', C.COUNTER_SENSOR, T.SENSOR.INTEGER, {
        min: 0,
        max: 100_000,
      }),
      feature(id, FEATURE.NEAREST, 'Nearest strike', C.DISTANCE_SENSOR, T.SENSOR.DECIMAL, {
        unit: U.KM,
        min: 0,
        max: maxKm,
      }),
      feature(
        id,
        FEATURE.BEARING,
        'Bearing of the nearest strike',
        C.ANGLE_SENSOR,
        T.SENSOR.INTEGER,
        {
          unit: U.DEGREE,
          min: 0,
          max: 359,
        },
      ),
      feature(id, FEATURE.DIRECTION, 'Direction of the nearest strike', C.TEXT, T.TEXT.TEXT, {
        min: 0,
        max: 0,
        keep_history: false,
      }),
      feature(id, FEATURE.LAST_STRIKE, 'Last nearby strike (UTC)', C.TEXT, T.TEXT.TEXT, {
        min: 0,
        max: 0,
        keep_history: false,
      }),
    ],
    params: [{ name: 'house', value: house.selector }],
  };
}

/** "2026-10-14T00:58:17Z": the ISO time to the second. */
export const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const state = (deviceId, key, value) =>
  value === null || value === undefined
    ? []
    : [
        typeof value === 'string'
          ? { device_feature_external_id: ids.feature(deviceId, key), text: value }
          : { device_feature_external_id: ids.feature(deviceId, key), state: value },
      ];

/**
 * The states of an area. With no strike in the window, the nearest distance
 * is the radius (a condition "below 10 km" stays false, never a stale value)
 * and the direction is "—"; the bearing keeps its last value.
 */
export function areaStates(deviceId, reading, { radiusKm, language }) {
  const calm = reading.nearestKm === null;
  return [
    ...state(deviceId, FEATURE.STRIKES, reading.count),
    ...state(deviceId, FEATURE.NEAREST, calm ? radiusKm : reading.nearestKm),
    ...state(deviceId, FEATURE.BEARING, calm ? null : reading.bearing),
    ...state(deviceId, FEATURE.DIRECTION, calm ? '—' : compassPoint(reading.bearing, language)),
    ...state(deviceId, FEATURE.LAST_STRIKE, reading.lastTime ? isoSeconds(reading.lastTime) : null),
  ];
}
