(function () {
  "use strict";
  function columnAt(holds, elapsedMs) {
    const total = holds.reduce((sum, duration) => sum + duration, 0);
    let time = ((elapsedMs % total) + total) % total;
    for (let column = 0; column < holds.length; column++) {
      if (time < holds[column]) return column;
      time -= holds[column];
    }
    return holds.length - 1;
  }
  function hopOffset(clip, elapsedMs) {
    const time = Math.max(0, elapsedMs) % clip.holdsMs.reduce((sum, hold) => sum + hold, 0);
    for (const hop of clip.hops ?? []) {
      const phase = (time - hop.startMs) / hop.durationMs;
      if (phase > 0 && phase < 1) return -4 * hop.heightPx * phase * (1 - phase);
    }
    return 0;
  }
  window.ChiikawaAnimation = { columnAt, hopOffset };
})();
