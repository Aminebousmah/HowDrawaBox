/* Rendu canvas. Le fond « papier » + la grille sont gérés en CSS (.canvas / .grid) ;
   ce module dessine guideline / points cibles / traits sur un canvas transparent.
   Encre fixe (hex) lisible sur papier clair, indépendante du thème d'UI. */

const INK = {
  good: '#1a9d5f',
  mid: '#c1901f',
  bad: '#d43d3a',
  accent: '#3d6fd6',
};

export function scoreBand(s) { return s >= 0.80 ? 'good' : s >= 0.55 ? 'mid' : 'bad'; }
export function scoreColor(s) { return INK[scoreBand(s)]; }

/* Brosses disponibles. `grain` et `passes` pilotent le rendu dans stroke().
   L'ordre de cet objet est celui du sélecteur d'UI. */
export const BRUSHES = {
  ink:        { label: 'Plume',     alpha: 1,   width: 1,    passes: 1, grain: 0,    taper: true },
  marker:     { label: 'Feutre',    alpha: .85, width: 1.7,  passes: 1, grain: 0,    taper: false },
  pencil:     { label: 'Crayon',    alpha: .38, width: .7,   passes: 3, grain: .9,   taper: true },
  chalk:      { label: 'Craie',     alpha: .5,  width: 1.35, passes: 2, grain: 2.4,  taper: false },
  watercolor: { label: 'Aquarelle', alpha: .16, width: 2.6,  passes: 3, grain: 1.6,  taper: false },
};

/* PRNG déterministe : la grain d'une brosse doit être identique à chaque redraw,
   sinon le tracé scintille dès qu'on redessine la scène (resize, trait suivant…). */
function rand(seed) {
  let s = seed * 1664525 + 1013904223;
  s = (s ^ (s >>> 15)) >>> 0;
  return (s % 1000) / 1000 - .5;
}

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
  }
  resize() {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }
  get w() { return this.canvas.width / this.dpr; }
  get h() { return this.canvas.height / this.dpr; }
  clear() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
  target(t) {
    const c = this.ctx;
    if (t.type === 'guide') {
      c.lineWidth = 2; c.strokeStyle = INK.accent; c.globalAlpha = .55; c.setLineDash([7, 7]);
      c.beginPath(); c.moveTo(t.ax, t.ay); c.lineTo(t.bx, t.by); c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
      this._ring(t.ax, t.ay); this._ring(t.bx, t.by);
    } else if (t.type === 'dots') {
      this._ring(t.start.x, t.start.y); this._ring(t.end.x, t.end.y);
    } else if (t.type === 'plane') {
      const k = t.corners;
      c.lineWidth = 2; c.strokeStyle = INK.accent; c.globalAlpha = .55; c.setLineDash([7, 7]);
      c.beginPath(); c.moveTo(k[0].x, k[0].y);
      for (let i = 1; i < k.length; i++) c.lineTo(k[i].x, k[i].y);
      c.closePath(); c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
      for (const p of k) this._ring(p.x, p.y, 5);
    } else if (t.type === 'funnel') {
      // axe central (= axe mineur des ellipses) + deux arcs de l'entonnoir
      const mx = (t.ax + t.bx) / 2, my = (t.ay + t.by) / 2;
      const dx = t.bx - t.ax, dy = t.by - t.ay, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      c.strokeStyle = INK.accent; c.globalAlpha = .55;
      c.lineWidth = 2; c.setLineDash([7, 7]);
      c.beginPath(); c.moveTo(t.ax, t.ay); c.lineTo(t.bx, t.by); c.stroke();
      c.setLineDash([]);
      c.lineWidth = 1.5;
      for (const s of [1, -1]) {
        c.beginPath(); c.moveTo(t.ax, t.ay);
        c.quadraticCurveTo(mx + nx * t.w * s, my + ny * t.w * s, t.bx, t.by); c.stroke();
      }
      c.globalAlpha = 1;
      this._ring(t.ax, t.ay, 4); this._ring(t.bx, t.by, 4);
    } else if (t.type === 'horizon') {
      c.strokeStyle = INK.accent; c.globalAlpha = .5; c.lineWidth = 1.5; c.setLineDash([7, 7]);
      c.beginPath(); c.moveTo(0, t.hy); c.lineTo(this.w, t.hy); c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
      for (const vp of (t.vps || [])) { this._ring(vp.x, vp.y, 7); this._ring(vp.x, vp.y, 2.5); }
    }
  }
  _ring(x, y, r = 7) {
    const c = this.ctx;
    c.lineWidth = 2; c.strokeStyle = INK.accent;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  }

  /* Trace un trait complet.
     brush : clé de BRUSHES · opacity : 0..1 (réglage utilisateur) */
  stroke(pts, color, lw = 3.2, brush = 'ink', opacity = 1) {
    if (!pts || pts.length < 2) return;
    const b = BRUSHES[brush] || BRUSHES.ink;
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineJoin = 'round';
    c.lineCap = b === BRUSHES.marker ? 'square' : 'round';

    const base = lw * b.width;
    // Largeur suivant la pression du stylet : impose de tracer segment par segment.
    const taper = b.taper && pts.some(p => p.pressure > 0);

    for (let pass = 0; pass < b.passes; pass++) {
      c.globalAlpha = Math.min(1, b.alpha * opacity);
      const jit = b.grain ? (i) => rand(i * 7919 + pass * 104729) * b.grain * (1 + base * .12) : null;
      const wMul = 1 - pass * .18;

      if (taper) {
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          const pr = (p0.pressure + p1.pressure) / 2 || .5;
          c.lineWidth = Math.max(.4, base * wMul * (.45 + pr * 1.1));
          c.beginPath();
          if (jit) {
            c.moveTo(p0.x + jit(i), p0.y + jit(i + 1));
            c.lineTo(p1.x + jit(i + 2), p1.y + jit(i + 3));
          } else { c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); }
          c.stroke();
        }
      } else {
        c.lineWidth = Math.max(.4, base * wMul);
        c.beginPath();
        c.moveTo(pts[0].x + (jit ? jit(0) : 0), pts[0].y + (jit ? jit(1) : 0));
        for (let i = 1; i < pts.length; i++) {
          c.lineTo(pts[i].x + (jit ? jit(i * 2) : 0), pts[i].y + (jit ? jit(i * 2 + 1) : 0));
        }
        c.stroke();
      }
    }

    // Craie : semis de grains autour du tracé, c'est ce qui la distingue du crayon.
    if (brush === 'chalk') {
      c.fillStyle = color;
      c.globalAlpha = Math.min(1, .28 * opacity);
      for (let i = 0; i < pts.length; i += 2) {
        for (let k = 0; k < 2; k++) {
          const s = i * 31 + k * 613;
          c.beginPath();
          c.arc(pts[i].x + rand(s) * base * 1.9, pts[i].y + rand(s + 1) * base * 1.9,
                Math.max(.3, base * .16), 0, Math.PI * 2);
          c.fill();
        }
      }
    }

    c.restore();
  }
}
