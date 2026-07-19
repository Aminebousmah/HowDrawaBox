/* Générateurs de tracés synthétiques pour les tests de validateurs.
   makeStroke(fn, n, dt) : fn(u in [0,1]) -> {x,y}, dt ms entre points. */

export function makeStroke(fn, n = 40, dt = 8) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const q = fn(u);
    p.push({ x: q.x, y: q.y, pressure: 0.5, tiltX: 0, tiltY: 0, t: i * dt });
  }
  return p;
}

/* Tracé d'ellipse synthétique : paramètres connus, `loops` tours complets.
   wobble = amplitude d'une déformation haute fréquence (ellipse « bumpy »).
   drift  = élargissement du 2e tour (passages qui ne se superposent pas). */
export function makeEllipse({ cx = 400, cy = 300, a = 200, b = 100, theta = 0.3,
                              loops = 2, n = 160, wobble = 0, drift = 0, dt = 8 } = {}) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * loops * 2 * Math.PI;
    let rr = 1;
    if (wobble) rr += wobble * Math.sin(t * 9);
    if (drift && t > 2 * Math.PI) rr += drift;
    const u = a * rr * Math.cos(t), v = b * rr * Math.sin(t);
    p.push({
      x: cx + u * Math.cos(theta) - v * Math.sin(theta),
      y: cy + u * Math.sin(theta) + v * Math.cos(theta),
      pressure: 0.5, tiltX: 0, tiltY: 0, t: i * dt,
    });
  }
  return p;
}

// tracés de référence sur une droite horizontale A(100,300)->B(500,300)
export const A = { x: 100, y: 300 }, B = { x: 500, y: 300 };
const lerp = (u) => ({ x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u });

export const strokes = {
  perfect: makeStroke(u => lerp(u)),
  wobbly:  makeStroke(u => ({ ...lerp(u), y: 300 + 6 * Math.sin(u * Math.PI * 14) })),
  arced:   makeStroke(u => ({ ...lerp(u), y: 300 + 40 * Math.sin(u * Math.PI) })),
  slow:    makeStroke(u => lerp(u), 40, 40),
  offset:  makeStroke(u => ({ ...lerp(u), y: 330 })),
  // stall : timing ralenti au centre
  stall: makeStroke(u => lerp(u)).map((p, i, arr) => {
    const u = i / (arr.length - 1);
    p.t = p.t + (u > 0.5 ? 60 : 0) + (u > 0.4 && u < 0.6 ? 60 : 0);
    return p;
  }),
  // départ raté (pour ghosted) : commence 25px trop haut à gauche
  missStart: makeStroke(u => ({ x: A.x + (B.x - A.x) * u, y: 300 + 25 * (1 - u) })),
};
