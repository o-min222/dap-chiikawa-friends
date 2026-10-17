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
  function lookCell(dx, dy) {
    const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
    const direction = Math.round(angle / (Math.PI / 8)) % 16;
    return { row: 9 + Math.floor(direction / 8), column: direction % 8 };
  }
  window.ChiikawaAnimation = { columnAt, lookCell };
})();
