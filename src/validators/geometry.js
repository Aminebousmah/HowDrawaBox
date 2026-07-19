/* Géométrie partagée par les validateurs.
   Fonctions pures, sans dépendance DOM — testables en Node. */

export const K = 64; // points de rééchantillonnage par défaut

export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// dedupe des points coïncidents
export function cleanPath(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 0.01) out.push(p);
  }
  return out.length ? out : pts.slice();
}

// rééchantillonnage par abscisse curviligne -> k points {x,y}, + longueur L
export function resample(pts, k = K) {
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const L = cum[n - 1] || 1e-9;
  const out = [];
  let j = 0;
  for (let s = 0; s < k; s++) {
    const target = (s / (k - 1)) * L;
    while (j < n - 2 && cum[j + 1] < target) j++;
    const seg = (cum[j + 1] - cum[j]) || 1e-9;
    const f = Math.max(0, Math.min(1, (target - cum[j]) / seg));
    out.push({ x: pts[j].x + f * (pts[j + 1].x - pts[j].x), y: pts[j].y + f * (pts[j + 1].y - pts[j].y) });
  }
  return { rs: out, L };
}

// résout un système 3x3 (Gauss avec pivot) — fit parabolique
export function solve3(M, v) {
  const a = [[...M[0], v[0]], [...M[1], v[1]], [...M[2], v[2]]];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    if (Math.abs(a[i][i]) < 1e-12) continue;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = a[r][i] / a[i][i];
      for (let cc = i; cc < 4; cc++) a[r][cc] -= f * a[i][cc];
    }
  }
  return [a[0][3] / (a[0][0] || 1e-9), a[1][3] / (a[1][1] || 1e-9), a[2][3] / (a[2][2] || 1e-9)];
}

// qualité douce : 1 = parfait, ->0 = mauvais
export function q(m, tau) { return Math.exp(-(m / tau) * (m / tau)); }

/* Analyse géométrique commune d'un trait (droiture + fluidité + confiance).
   Retourne les grandeurs brutes ; chaque validateur décide de la pondération.
   Le repère (arc/wobble) est intrinsèque au trait (PCA), indépendant de toute cible. */
export function analyzeStroke(rawPts) {
  const pts = cleanPath(rawPts);
  if (pts.length < 4) return null;
  const { rs, L } = resample(pts, K);

  // axe principal (PCA)
  let cx = 0, cy = 0;
  for (const p of rs) { cx += p.x; cy += p.y; }
  cx /= K; cy /= K;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of rs) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta), uy = Math.sin(theta), nx = -uy, ny = ux;

  const along = [], perp = [];
  for (const p of rs) { const dx = p.x - cx, dy = p.y - cy; along.push(dx * ux + dy * uy); perp.push(dx * nx + dy * ny); }
  const amin = Math.min(...along), amax = Math.max(...along), span = (amax - amin) || 1e-9;
  const s = along.map(a => (a - amin) / span);

  // fit parabolique perp = A s^2 + B s + C -> composante ARC (basse fréquence)
  let Sx0 = 0, Sx1 = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy = 0, Sxy = 0, Sx2y = 0;
  for (let i = 0; i < K; i++) {
    const x = s[i], y = perp[i], x2 = x * x;
    Sx0 += 1; Sx1 += x; Sx2 += x2; Sx3 += x2 * x; Sx4 += x2 * x2;
    Sy += y; Sxy += x * y; Sx2y += x2 * y;
  }
  const [A, B, C] = solve3([[Sx4, Sx3, Sx2], [Sx3, Sx2, Sx1], [Sx2, Sx1, Sx0]], [Sx2y, Sxy, Sy]);
  const fit = x => A * x * x + B * x + C;

  let arcAmp = 0;
  for (let i = 0; i <= 20; i++) { const x = i / 20; arcAmp = Math.max(arcAmp, Math.abs(fit(x))); }
  const arc = arcAmp / L;

  // wobble = RMS du résidu haute fréquence
  const res = perp.map((y, i) => y - fit(s[i]));
  let ssum = 0;
  for (const r of res) ssum += r * r;
  const wobble = Math.sqrt(ssum / K) / L;

  // reversals = inversions de signe de la dérivée du résidu (micro-corrections)
  let reversals = 0, prevSign = 0;
  for (let i = 1; i < K; i++) {
    const d = res[i] - res[i - 1];
    if (Math.abs(d) < L * 1e-4) continue;
    const sg = Math.sign(d);
    if (prevSign && sg !== prevSign) reversals++;
    prevSign = sg;
  }

  // confiance : durée, vitesse, stalls, aller-retour
  const duration = pts[pts.length - 1].t - pts[0].t;
  const meanSpeed = L / (duration || 1e-9);
  const spd = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) || 1e-9;
    spd.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / dt);
  }
  const peak = Math.max(...spd, 1e-9);
  let stallCount = 0;
  for (let i = 1; i < spd.length - 1; i++) {
    const f = i / spd.length;
    if (f < 0.15 || f > 0.85) continue;
    if (spd[i] < spd[i - 1] && spd[i] <= spd[i + 1] && spd[i] < 0.25 * peak) stallCount++;
  }
  let back = 0;
  const oriented = along.slice();
  if (oriented[K - 1] < oriented[0]) oriented.reverse();
  for (let i = 1; i < K; i++) if (oriented[i] < oriented[i - 1] - span * 0.005) back++;
  const retrace = back / K;

  return {
    L, rs, arc, wobble, reversals, duration, meanSpeed, stallCount, retrace,
    start: rs[0], end: rs[K - 1],
  };
}
