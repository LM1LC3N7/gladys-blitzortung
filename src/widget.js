// -----------------------------------------------------------------------------
// The dashboard widget "storm": calm or storm at X km in a direction, the
// strikes of the window, the nearest one, the last one. Pure.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { DANGER_KM } from './constants.js';
import { compassPoint } from './geo.js';
import { T } from './i18n.js';
import { minutesSince } from './model.js';

const pick = (text, language) => (typeof text === 'string' ? text : (text[language] ?? text.en));

/** The status line: what a glance at the dashboard must tell. */
function statusItem(reading, now, language) {
  if (reading.count > 0) {
    const direction = reading.bearing === null ? '' : compassPoint(reading.bearing, language);
    return {
      label: pick(T.widget.status, language),
      value: pick(T.widget.stormAt(reading.nearestKm, direction), language),
      icon: 'cloud-lightning',
      color: reading.nearestKm <= DANGER_KM ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
    };
  }
  if (reading.storm) {
    // No strike in the window, but the quiet period is not over yet.
    return {
      label: pick(T.widget.last, language),
      value: pick(T.widget.ago(minutesSince(reading, now)), language),
      icon: 'cloud-drizzle',
      color: WIDGET_COLORS.INFO,
    };
  }
  return {
    label: pick(T.widget.status, language),
    value: pick(T.widget.calm, language),
    icon: 'sun',
    color: WIDGET_COLORS.SUCCESS,
  };
}

export function stormWidget({ name, reading, now, radiusKm, windowMinutes, language = 'fr' }) {
  const components = [
    {
      type: 'text',
      text: (name ?? pick(T.widget.title, language)).slice(0, 40),
      variant: 'heading',
    },
  ];
  if (!reading) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
    return { ttl_seconds: 30, components };
  }
  const since = minutesSince(reading, now);
  components.push(
    {
      type: 'value',
      label: T.widget.strikes(windowMinutes),
      value: reading.count,
      icon: 'zap',
      color: reading.count > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    reading.nearestKm === null
      ? { type: 'value', label: T.widget.nearest, value: '—', icon: 'crosshair' }
      : {
          type: 'value',
          label: T.widget.nearest,
          value: reading.nearestKm,
          unit: 'km',
          icon: 'crosshair',
          color: reading.nearestKm <= DANGER_KM ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
        },
    since === null
      ? {
          type: 'value',
          label: T.widget.last,
          value: pick(T.widget.never, language),
          icon: 'clock',
        }
      : { type: 'value', label: T.widget.last, value: since, unit: 'min', icon: 'clock' },
  );
  const items = [statusItem(reading, now, language)];
  if (reading.approachLatched) {
    items.push({
      label: pick(T.widget.approaching, language),
      value: reading.speedKmh ? `~${reading.speedKmh} km/h` : '↓',
      icon: 'trending-down',
      color: WIDGET_COLORS.DANGER,
    });
  }
  components.push({ type: 'status', items });
  components.push({ type: 'text', text: T.widget.credit(radiusKm), variant: 'caption' });
  return { ttl_seconds: reading.storm ? 30 : 120, components };
}
