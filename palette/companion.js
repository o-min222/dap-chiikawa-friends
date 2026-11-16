(() => {
  const canvas = document.getElementById('character');
  const context = canvas.getContext('2d');
  const bridge = window.dapPalette;
  const images = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const menu = document.getElementById('menu');
  let state, previousReply, replyUntil = 0, pointer = null, frame;
  let hovering = false, walking = false, direction = 1, carry = 0;
  let nextDecision = 2000 + Math.random() * 3000, lastMove = 0, pauseUntil = 0;
  const post = message => bridge.postMessage(message);
  const off = bridge.onMessage(message => {
    if (message?.type === 'request-size') {
      post({ type: 'resize', sizePx: message.sizePx, x: window.screenX, y: window.screenY });
      return;
    }
    if (message?.type !== 'companion-state') return;
    if (state && message.replyId && message.replyId !== previousReply) replyUntil = performance.now() + 2400;
    previousReply = message.replyId;
    state = message;
    const size = message.sizePx ?? 130;
    canvas.style.width = `${size * 192 / 208}px`;
    canvas.style.height = `${size}px`;
    document.getElementById('size').value = String(size);
    document.getElementById('size-value').textContent = `${size}px`;
    document.title = message.name;
    canvas.setAttribute('aria-label', `${message.name}와 대화하기. 드래그해서 이동하기`);
  });
  function draw(time) {
    const paused = !state || document.hidden || state.pending || pointer || hovering || !menu.hidden || time < pauseUntil || time < replyUntil;
    if (paused) {
      walking = false;
      carry = 0;
      nextDecision = time + 1800;
      lastMove = time;
    } else {
      if (time >= nextDecision) {
        walking = !walking;
        if (walking) direction = Math.random() < 0.5 ? -1 : 1;
        nextDecision = time + (walking ? 3000 + Math.random() * 4000 : 2000 + Math.random() * 4000);
      }
      if (walking && time - lastMove >= 100) {
        const left = window.screen.availLeft ?? 0;
        const right = Math.max(left, left + window.screen.availWidth - window.outerWidth);
        const distance = direction * 30 * Math.min(time - lastMove, 200) / 1000 + carry;
        const step = Math.trunc(distance);
        carry = distance - step;
        const target = Math.max(left, Math.min(right, window.screenX + step));
        const dx = Math.max(-1000, Math.min(1000, target - window.screenX));
        if (dx) post({ type: 'move', dx, dy: 0 });
        if (target <= left) direction = 1;
        if (target >= right) direction = -1;
        lastMove = time;
      } else if (!walking) lastMove = time;
    }
    if (state && !document.hidden) {
      const phase = state.pending ? 'thinking' : time < replyUntil ? 'reply'
        : walking ? direction < 0 ? 'walkLeft' : 'walkRight' : 'idle';
      const clip = state.art[phase];
      if (!images.has(clip.file)) { const image = new Image(); image.src = `../${clip.file}`; images.set(clip.file, image); }
      const image = images.get(clip.file);
      if (image.complete && image.naturalWidth) {
        const column = window.ChiikawaAnimation.columnAt(clip.holdsMs, reduced.matches ? 0 : time);
        context.clearRect(0, 0, 192, 208);
        context.drawImage(image, column * 192, 0, 192, 208, 0, 0, 192, 208);
      }
    }
    frame = requestAnimationFrame(draw);
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.screenX, y: event.screenY, distance: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.screenX - pointer.x, dy = event.screenY - pointer.y;
    pointer.distance += Math.abs(dx) + Math.abs(dy);
    pointer.x = event.screenX; pointer.y = event.screenY;
    if (dx || dy) post({ type: 'move', dx, dy });
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.distance < 5) post({ type: 'chat' });
    pointer = null;
    pauseUntil = performance.now() + 2500;
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('pointerenter', () => { hovering = true; });
  canvas.addEventListener('pointerleave', () => { hovering = false; });
  function openMenu(event) {
    event.preventDefault();
    pointer = null;
    menu.hidden = false;
    document.getElementById('hide').focus();
  }
  canvas.addEventListener('contextmenu', openMenu);
  canvas.addEventListener('keydown', event => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { openMenu(event); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); post({ type: 'chat' }); }
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !menu.contains(event.target)) { menu.hidden = true; event.preventDefault(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.hidden = true; canvas.focus(); }
  });
  document.getElementById('hide').addEventListener('click', () => post({ type: 'hide' }));
  document.getElementById('size').addEventListener('change', event => {
    post({ type: 'resize', sizePx: Number(event.target.value), x: window.screenX, y: window.screenY });
  });
  document.getElementById('size').addEventListener('input', event => {
    document.getElementById('size-value').textContent = `${event.target.value}px`;
  });
  window.addEventListener('pagehide', () => { off(); cancelAnimationFrame(frame); });
  post({ type: 'ready' });
  frame = requestAnimationFrame(draw);
})();
