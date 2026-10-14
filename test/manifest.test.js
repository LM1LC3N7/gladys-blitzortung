// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIONS,
  DISTANCE_THRESHOLDS,
  LANGUAGES,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  WIDGETS,
} from '../src/constants.js';
import { DEFAULTS, LIMITS } from '../src/config.js';
import { FEATURE, buildAreaDevice, parseExternalId } from '../src/devices.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.location, true, 'the strikes are measured from the houses');
  assert.match(manifest.gladys_version, />=5\.1\.0/);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-blitzortung:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
    // The terms of the data and the safety warning are on every surface, and
    // the bandwidth is said where the user installs it.
    assert.match(read(`docs/${lang}.md`), /Blitzortung\.org/);
    assert.match(
      read(`docs/${lang}.md`),
      lang === 'en' ? /about 1 GB a day/ : /environ 1 Go par jour/,
    );
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
  const intro = manifest.config_schema.find((f) => f.key === 'intro').description;
  assert.match(intro.en, /not affiliated with Blitzortung\.org/);
  assert.match(intro.en, /non-commercial/);
  assert.match(intro.en, /NOT a safety system/);
  assert.match(intro.en, /about 1 GB of download a day/);
  assert.match(intro.fr, /environ 1 Go téléchargé par jour/);
  assert.match(intro.fr, /non commercial/);
  assert.match(intro.fr, /PAS un système de sécurité/);
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    assert.deepEqual([fields[key].min, fields[key].max], [min, max], key);
  }
  assert.deepEqual(
    fields.language.options.map((o) => o.value),
    LANGUAGES,
  );
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((w) => w.key).sort(), Object.values(WIDGETS).sort());
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  const triggers = Object.fromEntries(manifest.scene_triggers.map((t) => [t.key, t]));
  for (const key of [SCENE_TRIGGERS.NEARBY, SCENE_TRIGGERS.OVER]) {
    const distance = triggers[key].fields.find((f) => f.key === 'distance');
    assert.deepEqual(
      distance.options.map((o) => o.value),
      DISTANCE_THRESHOLDS.map(String),
      key,
    );
  }
  for (const trigger of manifest.scene_triggers) {
    assert.equal(trigger.fields[0].key, 'area', 'the events carry the device as "area"');
  }
});

test('feature keys and external ids are forever', () => {
  assert.deepEqual(FEATURE, {
    STRIKES: 'strikes',
    NEAREST: 'nearest_km',
    BEARING: 'bearing',
    DIRECTION: 'direction',
    LAST_STRIKE: 'last_strike',
  });
  const gladys = { externalId: (suffix) => `ext:blitzortung:${suffix}` };
  const device = buildAreaDevice(gladys, { name: 'Home', selector: 'main-house' });
  assert.equal(device.external_id, 'ext:blitzortung:area:main-house');
  assert.deepEqual(parseExternalId(device.external_id), { houseSelector: 'main-house' });
  assert.equal(parseExternalId('ext:blitzortung:other'), undefined);
});
