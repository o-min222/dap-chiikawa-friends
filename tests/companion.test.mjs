import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../palette/companion.js', import.meta.url), 'utf8');

function desktop(x = 400) {
  const elements = new Map(), sent = [], documentEvents = {};
  let receive, tick, now = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, style: {}, events: {}, focus() {},
      addEventListener(type, fn) { this.events[type] = fn; },
      setAttribute() {}, setPointerCapture() {}, contains: target => target === element(id),
      getContext: () => ({ clearRect() {}, drawImage() {} }),
    });
    return elements.get(id);
  };
  const window = { screenX: x, outerWidth: 120, screen: { availLeft: 0, availWidth: 1000 },
    addEventListener() {}, ChiikawaAnimation: { columnAt: () => 0 }, dapPalette: {
      onMessage(fn) { receive = fn; return () => {}; },
      postMessage(message) { sent.push(message); if (message.type === 'move') window.screenX += message.dx; },
    } };
  runInNewContext(source, { window, document: { hidden: false, getElementById: element,
    addEventListener(type, fn) { documentEvents[type] = fn; } },
    performance: { now: () => now }, Math: Object.assign(Object.create(Math), { random: () => 0.8 }),
    matchMedia: () => ({ matches: false }), Image: class {},
    requestAnimationFrame(fn) { tick = fn; }, cancelAnimationFrame() {},
  });
  receive({ type: 'companion-state', name: '시사', pending: false, replyId: null,
    art: Object.fromEntries(['idle', 'thinking', 'reply', 'walkLeft', 'walkRight'].map(phase => [phase, { file: phase, holdsMs: [100] }])) });
  return { window, element, sent, receive, step(time) { now = time; tick(time); } };
}

test('walking respects screen edges, reverses direction and caps delayed-frame movement', () => {
  const app = desktop(879);
  app.step(0); app.step(5000);
  assert.equal(app.window.screenX, 880);
  app.step(5100);
  assert.ok(app.window.screenX < 880);
  assert.ok(app.sent.filter(message => message.type === 'move').every(message => Math.abs(message.dx) <= 6));
  app.step(100000);
  assert.ok(app.window.screenX >= 0 && app.window.screenX <= 880);
});

test('hover and right-click stop walking, close is explicit, and a left click opens chat', () => {
  const app = desktop();
  app.step(0); app.step(5000);
  const canvas = app.element('character');
  canvas.events.pointerenter();
  const x = app.window.screenX;
  app.step(5200); app.step(9000);
  assert.equal(app.window.screenX, x);
  canvas.events.contextmenu({ preventDefault() {} });
  assert.equal(app.element('menu').hidden, false);
  assert.equal(app.sent.some(message => message.type === 'hide'), false);
  app.element('hide').events.click();
  assert.equal(app.sent.at(-1).type, 'hide');
  canvas.events.pointerdown({ button: 0, pointerId: 1, screenX: 10, screenY: 20 });
  canvas.events.pointerup({ pointerId: 1 });
  assert.equal(app.sent.at(-1).type, 'chat');
});

test('dragging moves the character without opening a chat', () => {
  const app = desktop();
  const canvas = app.element('character');
  canvas.events.pointerdown({ button: 0, pointerId: 1, screenX: 10, screenY: 20 });
  canvas.events.pointermove({ pointerId: 1, screenX: 50, screenY: 20 });
  canvas.events.pointerup({ pointerId: 1 });
  assert.equal(app.window.screenX, 440);
  assert.equal(app.sent.some(message => message.type === 'chat'), false);
});

test('pixel slider updates the label on input and commits only on release', () => {
  const app = desktop();
  app.element('size').events.input({ target: { value: '180' } });
  assert.equal(app.element('size-value').textContent, '180px');
  assert.equal(app.sent.some(message => message.type === 'resize'), false);
  app.element('size').events.change({ target: { value: '180' } });
  assert.equal(app.sent.at(-1).sizePx, 180);
});
