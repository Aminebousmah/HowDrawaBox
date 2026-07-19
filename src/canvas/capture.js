/* Capture de tracé via Pointer Events. Émet un tableau de points bruts
   { x, y, pressure, tiltX, tiltY, t } par trait complété.

   new StrokeCapture(canvas, { onStroke, onLive }) */

export class StrokeCapture {
  constructor(canvas, { onStroke, onLive } = {}) {
    this.canvas = canvas;
    this.onStroke = onStroke;
    this.onLive = onLive;
    this.current = null;
    this.capturing = false;

    canvas.addEventListener('pointerdown', this._down = e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.capturing = true;
      this.current = [this._pt(e)];
    });
    canvas.addEventListener('pointermove', this._move = e => {
      if (!this.capturing) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) this.current.push(this._pt(ev.clientX !== undefined ? ev : e));
      this.onLive && this.onLive(this.current);
    });
    const end = e => {
      if (!this.capturing) return;
      this.capturing = false;
      const pts = this.current;
      this.current = null;
      if (pts && pts.length >= 4) this.onStroke && this.onStroke(pts);
    };
    canvas.addEventListener('pointerup', this._up = end);
    canvas.addEventListener('pointercancel', this._cancel = end);
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      pressure: e.pressure ?? 0,
      tiltX: e.tiltX ?? 0,
      tiltY: e.tiltY ?? 0,
      t: e.timeStamp,
    };
  }
}
