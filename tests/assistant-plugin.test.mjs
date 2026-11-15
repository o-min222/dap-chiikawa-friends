import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activate } from '../assistant/dap_assistant/plugin.mjs';

function context(selected) {
  const calls = [];
  let listener;
  let active = null;
  const registration = {
    id: 'local.dap.assistant.assistant',
    async apply(options) { calls.push(['apply', options]); active = this.id; listener?.(); },
    async dispose() { calls.push(['dispose']); },
  };
  const ctx = {
    pluginId: 'local.dap.assistant',
    host: {
      petSkins: {
        supportedSkinVersions: [1, 2],
        async registerSkin(definition) { calls.push(['register', definition]); return registration; },
        getActiveSkin: () => active,
        onDidChange(callback) { listener = callback; return () => { listener = undefined; }; },
      },
      settings: {
        values(section) { calls.push(['values', section]); return { selected }; },
        set(section, key, value) { calls.push(['set', section, key, value]); },
      },
    },
  };
  return { ctx, calls, registration, selectOther() { active = 'another.skin'; listener?.(); } };
}

test('uses PluginContext.pluginId and saves the first activation selection', async () => {
  const fixture = context();
  const stop = await activate(fixture.ctx);
  await stop();
  assert(fixture.calls.some(call => call[0] === 'values' && call[1] === 'local.dap.assistant.character'));
  assert(fixture.calls.some(call => call[0] === 'set' && call[1] === 'local.dap.assistant.character' && call[3] === true));
  assert.deepEqual(fixture.calls.find(call => call[0] === 'apply'), ['apply', { usePersona: false }]);
});

test('respects a saved deselection and disposes once', async () => {
  const fixture = context(false);
  const stop = await activate(fixture.ctx);
  await stop(); await stop();
  assert.equal(fixture.calls.filter(call => call[0] === 'apply').length, 0);
  assert.equal(fixture.calls.filter(call => call[0] === 'dispose').length, 1);
});

test('persists a later character selection before unloading', async () => {
  const fixture = context();
  const stop = await activate(fixture.ctx);
  fixture.selectOther();
  await stop();
  assert.deepEqual(fixture.calls.filter(call => call[0] === 'set').map(call => call[3]), [true, false]);
});

test('cleans up a failed apply and rejects unsupported hosts', async () => {
  const fixture = context();
  fixture.registration.apply = async () => { throw Error('apply failed'); };
  await assert.rejects(activate(fixture.ctx), /apply failed/);
  assert.equal(fixture.calls.filter(call => call[0] === 'dispose').length, 1);
  fixture.ctx.host.petSkins.supportedSkinVersions = [1];
  await assert.rejects(activate(fixture.ctx), /고프레임 스킨/);
});
