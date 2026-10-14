import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { areaReading } from '../src/model.js';
import { stormWidget } from '../src/widget.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const options = { now: NOW, radiusKm: 30, windowMinutes: 15, quietMinutes: 30 };
const s = (km, ago, bearing = 300) => ({
  id: `${km}@${ago}`,
  at: NOW - ago * MIN,
  time: NOW - ago * MIN,
  km,
  bearing,
});
const widget = (reading, language = 'en') =>
  stormWidget({ name: 'Home', reading, now: NOW, radiusKm: 30, windowMinutes: 15, language });
const statusOf = (content) => content.components.find((c) => c.type === 'status').items;

test('calm, storm far, storm close: the status line and its color', () => {
  const calm = widget(areaReading([], options));
  assert.deepEqual(validateWidgetContent(calm), []);
  assert.equal(statusOf(calm)[0].value, 'Calm');
  assert.equal(statusOf(calm)[0].color, 'success');
  assert.equal(calm.components.find((c) => c.label?.en === 'Last strike').value, 'none yet');
  const far = widget(areaReading([s(22.4, 2), s(25, 4)], options), 'fr');
  assert.deepEqual(validateWidgetContent(far), []);
  assert.equal(statusOf(far)[0].value, 'Orage à 22.4 km NO');
  assert.equal(statusOf(far)[0].color, 'warning');
  assert.equal(far.ttl_seconds, 30);
  const tiles = far.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((t) => [t.value, t.unit ?? null]),
    [
      [2, null],
      [22.4, 'km'],
      [2, 'min'],
    ],
  );
  const close = widget(areaReading([s(6, 1)], options));
  assert.equal(statusOf(close)[0].color, 'danger');
  const caption = close.components.at(-1).text;
  assert.match(caption.en, /Blitzortung\.org · unofficial, not a safety system/);
  assert.match(caption.fr, /Blitzortung\.org · non officiel, pas un système de sécurité/);
  // The longest caption (a 3-digit radius) fits the 80 characters of a caption.
  for (const text of Object.values(
    stormWidget({
      name: 'x',
      reading: areaReading([], options),
      now: NOW,
      radiusKm: 200,
    }).components.at(-1).text,
  )) {
    assert.ok(text.length <= 80, `caption of ${text.length} characters`);
  }
});

test('after the storm, while the quiet period runs; approaching; not loaded', () => {
  const fading = widget(areaReading([s(12, 20)], options));
  assert.deepEqual(statusOf(fading)[0], {
    label: 'Last strike',
    value: '20 min ago',
    icon: 'cloud-drizzle',
    color: 'info',
  });
  const closing = [s(28, 14), s(27, 12), s(20, 9), s(22, 7), s(12, 3), s(14, 1)];
  const approaching = widget(areaReading(closing, options));
  assert.deepEqual(validateWidgetContent(approaching), []);
  assert.deepEqual(
    statusOf(approaching).map((i) => i.value),
    ['Storm at 12 km NW', '~90 km/h'],
  );
  const waiting = widget(undefined);
  assert.deepEqual(validateWidgetContent(waiting), []);
  assert.match(waiting.components[1].text.en, /Waiting/);
});
