import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activate } from '../dap_chiikawa/plugin.mjs';

async function harness({ generate = async () => '함께 이야기해요!', saved = {}, write } = {}) {
  let receive;
  const actions = new Map(), settings = structuredClone(saved), updates = [], calls = [];
  const windows = [];
  let closed = false;
  const ctx = {
    pluginId: 'friends',
    actions: { registerAction({ id, callback }) { actions.set(id, callback); } },
    trayMenu: { addItem() {} }, radialMenu: { addItem() {} },
    host: {
      get petSkins() { throw Error('Chat must not access the DAP pet'); },
      llm: generate && { async generate(prompt, timeout) { calls.push({ prompt, timeout }); return generate(prompt); } },
      settings: {
        values: () => structuredClone(settings),
        async set(section, key, value) { assert.equal(section, 'friends.chat'); await write?.(key, value); settings[key] = structuredClone(value); },
      },
      windows: { openPalette(options) { const entry = { options, moved: [], closed: false }; windows.push(entry); return {
        isDestroyed: () => entry.closed, show() {}, close() { entry.closed = true; closed = true; },
        moveBy(dx, dy) { entry.moved.push([dx, dy]); },
        postMessage(message) { updates.push(message); },
        onMessage(fn) { receive = fn; entry.receive = fn; return () => { entry.receive = null; }; },
      }; } },
    },
  };
  const stop = await activate(ctx);
  actions.get('open')();
  await receive({ type: 'ready' });
  return { send: message => windows[0].receive(message), stop, settings, calls, updates, state: () => updates.filter(message => message.type === 'chat-state').at(-1), ctx, windows };
}

test('chat uses five independent personas and restores only its own character history', async () => {
  const app = await harness({ saved: { appliedCharacter: 'momonga' } });
  assert.equal(app.state().selectedId, 'chiikawa');
  for (const id of ['chiikawa', 'hachiware', 'usagi', 'momonga', 'shisa']) {
    await app.send({ type: 'summon', id });
    await app.send({ type: 'select', id });
    await app.send({ type: 'send', id, text: `${id}만의 대화`, requestId: id });
    assert.equal(app.state().conversations[id].messages.length, 2);
    const call = app.calls.at(-1);
    assert.equal(call.timeout, 60);
    const history = JSON.parse(call.prompt.split('\n').at(-1)).messages;
    assert.deepEqual(history, [{ role: 'user', content: `${id}만의 대화` }]);
  }
  await app.stop();
  const restored = await harness({ saved: app.settings });
  assert.equal(restored.state().selectedId, 'shisa');
  assert.equal(restored.state().conversations.momonga.messages[0].content, 'momonga만의 대화');
  await restored.send({ type: 'clear', id: 'shisa' });
  assert.deepEqual(restored.settings.history_shisa, []);
  assert.equal(restored.settings.history_momonga.length, 2);
  await restored.stop();
});

test('a late answer follows its character while duplicate sends and clearing a pending turn are ignored', async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const app = await harness({ generate: () => response });
  await app.send({ type: 'summon', id: 'shisa' });
  const pending = app.send({ type: 'send', id: 'shisa', text: '안녕', requestId: 'first' });
  await new Promise(done => setImmediate(done));
  await app.send({ type: 'send', id: 'shisa', text: '중복', requestId: 'second' });
  await app.send({ type: 'clear', id: 'shisa' });
  await app.send({ type: 'select', id: 'momonga' });
  resolve('어서 오세요!');
  await pending;
  assert.equal(app.calls.length, 1);
  assert.equal(app.state().selectedId, 'momonga');
  assert.deepEqual(app.state().conversations.momonga.messages, []);
  assert.equal(app.settings.history_shisa[1].content, '어서 오세요!');
  await app.send({ type: 'send', id: 'shisa', text: '안녕', requestId: 'first' });
  assert.equal(app.calls.length, 1);
  await app.stop();
});

test('generation failures keep the user turn and retry without duplicating it', async () => {
  let attempts = 0;
  const app = await harness({ generate: async () => { if (++attempts === 1) throw Error('provider unavailable'); return '응!'; } });
  await app.send({ type: 'summon', id: 'chiikawa' });
  await app.send({ type: 'send', id: 'chiikawa', text: '<img onerror=alert(1)>', requestId: 'retry-me' });
  assert.equal(app.settings.history_chiikawa.length, 1);
  assert.ok(app.state().conversations.chiikawa.error);
  await app.send({ type: 'retry', id: 'chiikawa' });
  assert.equal(app.settings.history_chiikawa.length, 2);
  assert.equal(app.state().conversations.chiikawa.error, '');
  await app.stop();
});

test('a failed initial save prevents generation and a disposed turn never persists a late response', async () => {
  const broken = await harness({ write: async () => { throw Error('disk full'); } });
  await broken.send({ type: 'summon', id: 'usagi' });
  await broken.send({ type: 'send', id: 'usagi', text: '안녕', requestId: 'disk-full' });
  assert.equal(broken.calls.length, 0);
  assert.deepEqual(broken.state().conversations.usagi.messages, []);
  await broken.stop();
  let resolve;
  const app = await harness({ generate: () => new Promise(done => { resolve = done; }) });
  await app.send({ type: 'summon', id: 'usagi' });
  const pending = app.send({ type: 'send', id: 'usagi', text: '안녕', requestId: 'late' });
  await new Promise(done => setImmediate(done));
  await app.stop();
  resolve('우라!');
  await pending;
  assert.equal(app.settings.history_usagi.length, 1);
});

test('old malformed settings, unavailable AI and oversized messages remain usable', async () => {
  const app = await harness({ generate: null, saved: { selectedCharacter: 'removed', history_shisa: [{ role: 'system', id: 'bad', content: 'bad' }] } });
  assert.equal(app.state().available, false);
  assert.deepEqual(app.state().conversations.shisa.messages, []);
  await app.send({ type: 'send', id: 'shisa', text: '안녕', requestId: 'no-ai' });
  assert.equal(app.calls.length, 0);
  await app.stop();
  const available = await harness();
  await available.send({ type: 'send', id: 'shisa', text: 'x'.repeat(4001), requestId: 'too-long' });
  assert.equal(available.calls.length, 0);
  await available.stop();
});

test('desktop companions coexist and each chat keeps its own identity and close lifecycle', async () => {
  const app = await harness();
  await app.send({ type: 'spawn', id: 'shisa' });
  await app.send({ type: 'spawn', id: 'momonga' });
  await app.send({ type: 'spawn', id: 'shisa' });
  assert.equal(app.windows.length, 3);
  assert.equal(app.windows[1].options.transparent, true);
  assert.deepEqual(app.settings.visibleCharacters, ['shisa', 'momonga']);
  await app.windows[1].receive({ type: 'move', dx: 40, dy: -20 });
  assert.deepEqual(app.windows[1].moved, [[40, -20]]);
  await app.windows[1].receive({ type: 'chat' });
  await app.windows[2].receive({ type: 'chat' });
  assert.equal(app.windows.length, 5);
  await app.windows[3].receive({ type: 'send', id: 'momonga', text: '시사에게만', requestId: 'bound' });
  assert.equal(app.settings.history_shisa[0].content, '시사에게만');
  assert.equal(app.settings.history_momonga, undefined);
  await app.windows[2].receive({ type: 'hide' });
  assert.deepEqual(app.settings.visibleCharacters, ['shisa']);
  assert.equal(app.windows[1].closed, false);
  await app.stop();
  assert.ok(app.windows.every(window => window.closed));
});

test('size changes preserve the foot position, persist per character and reject unsupported sizes', async () => {
  const app = await harness();
  await app.send({ type: 'spawn', id: 'shisa' });
  await app.send({ type: 'spawn', id: 'momonga' });
  await app.windows[1].receive({ type: 'resize', sizePx: 200, x: 100, y: 200 });
  assert.equal(app.settings.sizePx_shisa, 200);
  assert.equal(app.settings.sizePx_momonga, undefined);
  assert.equal(app.windows[1].closed, true);
  assert.equal(app.windows[2].closed, false);
  assert.equal(app.windows[3].options.width, 201);
  assert.equal(app.windows[3].options.height, 219);
  assert.equal(app.windows[3].options.x, 80);
  assert.equal(app.windows[3].options.y, 130);
  await app.windows[3].receive({ type: 'resize', sizePx: 999, x: 0, y: 0 });
  assert.equal(app.windows.length, 4);
  await app.windows[3].receive({ type: 'hide' });
  await app.send({ type: 'spawn', id: 'shisa' });
  assert.equal(app.windows[4].options.width, 201);
  await app.stop();
});

test('friend visibility controls preserve conversations and legacy sizes migrate to pixels', async () => {
  const app = await harness({ saved: { size_shisa: 150 } });
  await app.send({ type: 'set-visible', id: 'shisa', visible: true });
  assert.equal(app.windows[1].options.height, 189); // legacy 150% becomes 170px
  await app.send({ type: 'send', id: 'shisa', text: '안녕', requestId: 'keep' });
  await app.send({ type: 'set-visible', id: 'shisa', visible: false });
  assert.deepEqual(app.settings.visibleCharacters, []);
  assert.equal(app.settings.history_shisa.length, 2);
  await app.send({ type: 'set-visible', id: 'shisa', visible: true });
  assert.deepEqual(app.settings.visibleCharacters, ['shisa']);
  assert.equal(app.calls.length, 1);
  await app.stop();
});

test('profile size works while hidden and delegates a live resize to the companion', async () => {
  const app = await harness();
  await app.send({ type: 'set-size', id: 'shisa', sizePx: 180 });
  assert.equal(app.settings.sizePx_shisa, 180);
  assert.equal(app.windows.length, 1);
  assert.equal(app.state().characters.find(character => character.id === 'shisa').sizePx, 180);
  await app.send({ type: 'spawn', id: 'shisa' });
  assert.equal(app.windows[1].options.height, 199);
  await app.send({ type: 'set-size', id: 'shisa', sizePx: 200 });
  assert.equal(app.updates.at(-1).type, 'request-size');
  assert.equal(app.updates.at(-1).sizePx, 200);
  await app.windows[1].receive({ type: 'resize', sizePx: 200, x: 100, y: 100 });
  assert.equal(app.settings.sizePx_shisa, 200);
  assert.equal(app.windows[2].options.height, 219);
  await app.send({ type: 'set-size', id: 'shisa', sizePx: 195 });
  assert.equal(app.settings.sizePx_shisa, 200);
  await app.stop();
});

test('friends start away, must be summoned to chat, and dismissed turns cannot disturb a recalled conversation', async () => {
  const replies = [];
  const app = await harness({ saved: { visibleCharacters: ['shisa'] }, generate: () => new Promise(resolve => replies.push(resolve)) });
  assert.equal(app.windows.length, 1);
  assert.deepEqual(app.state().visibleCharacters, []);
  await app.send({ type: 'send', id: 'shisa', text: '아직 부르지 않음', requestId: 'away' });
  assert.equal(app.calls.length, 0);
  await app.send({ type: 'summon', id: 'shisa' });
  const oldTurn = app.send({ type: 'send', id: 'shisa', text: '첫 대화', requestId: 'old' });
  await new Promise(resolve => setImmediate(resolve));
  await app.send({ type: 'dismiss', id: 'shisa' });
  assert.deepEqual(app.state().visibleCharacters, []);
  assert.equal(app.state().conversations.shisa.pending, false);
  await app.send({ type: 'send', id: 'shisa', text: '자리 비움', requestId: 'blocked' });
  assert.equal(app.calls.length, 1);
  await app.send({ type: 'summon', id: 'shisa' });
  const newTurn = app.send({ type: 'send', id: 'shisa', text: '다시 대화', requestId: 'new' });
  await new Promise(resolve => setImmediate(resolve));
  replies[0]('늦은 답변'); await oldTurn;
  assert.equal(app.state().conversations.shisa.pending, true);
  replies[1]('다시 반가워요!'); await newTurn;
  assert.equal(app.settings.history_shisa.at(-1).content, '다시 반가워요!');
  assert.ok(!app.settings.history_shisa.some(message => message.content === '늦은 답변'));
  await app.stop();
});
