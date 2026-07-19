/* Géométrie d'ellipse partagée par les exercices d'ellipses (tables, planes, funnels).
   Fonctions pures, testables en Node.

   Deux mesures structurent tout, dans l'ordre de priorité de Drawabox :
   1. la RÉGULARITÉ de la forme (une ellipse lisse et égale) — priorité absolue ;
   2. le DRAW-THROUGH : 2 tours complets (idéal) ou 3 (acceptable) avant de lever le stylo. */

import { cleanPath, resample, K } from './geometry.js';

/* Résout un système NxN par élimination de Gauss avec pivot partiel. */
export function solveN(M, v) {
  const n = v.length;
  const a = M.map((row, i) => [...row, v[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    if (Math.abs(a[i][i]) < 1e-12) return null;      // singulier
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = a[r][i] / a[i][i];
      for (let c = i; c <= n; c++) a[r][c] -= f * a[i][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/* Fit algébrique d'une conique Ax² + Bxy + Cy² + Dx + Ey = 1 par moindres carrés.
   Les points sont normalisés (centrés/réduits) avant le fit : sans ça le système est
   très mal conditionné en coordonnées écran, et le fit part en hyperbole.
   -> { cx, cy, a, b, theta } en coordonnées d'origine, ou null si ce n'est pas une ellipse. */
export function fitEllipse(pts) {
  const n = pts.length;
  if (n < 8) return null;

  // normalisation
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let s = 0;
  for (const p of pts) s += Math.hypot(p.x - mx, p.y - my);
  s = (s / n) || 1;

  // normales du système 5x5
  const M = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const v = new Array(5).fill(0);
  for (const p of pts) {
    const x = (p.x - mx) / s, y = (p.y - my) / s;
    const row = [x * x, x * y, y * y, x, y];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) M[i][j] += row[i] * row[j];
      v[i] += row[i];
    }
  }
  const c = solveN(M, v);
  if (!c) return null;

  const [A, B, C, D, E] = c, F = -1;
  const disc = B * B - 4 * A * C;
  if (disc >= 0) return null;                        // hyperbole/parabole : pas une ellipse

  // centre (annule les termes linéaires)
  const x0 = (2 * C * D - B * E) / disc;
  const y0 = (2 * A * E - B * D) / disc;
  const F0 = F - (A * x0 * x0 + B * x0 * y0 + C * y0 * y0);

  // demi-axes via les valeurs propres de [[A, B/2], [B/2, C]]
  const t = 0.5 * (A + C), d = Math.sqrt(Math.max(0, 0.25 * (A - C) * (A - C) + 0.25 * B * B));
  const l1 = t + d, l2 = t - d;
  if (-F0 / l1 <= 0 || -F0 / l2 <= 0) return null;
  let a1 = Math.sqrt(-F0 / l1), b1 = Math.sqrt(-F0 / l2);
  let theta = 0.5 * Math.atan2(B, A - C);

  // a = grand axe, b = petit axe
  let a = Math.max(a1, b1), b = Math.min(a1, b1);
  if (b1 > a1) theta += Math.PI / 2;

  return { cx: x0 * s + mx, cy: y0 * s + my, a: a * s, b: b * s, theta };
}

/* Vitesse / hésitations, sur la série temporelle brute (même logique que pour les lignes). */
export function motionMetrics(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
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
    if (f < 0.1 || f > 0.9) continue;
    if (spd[i] < spd[i - 1] && spd[i] <= spd[i + 1] && spd[i] < 0.25 * peak) stallCount++;
  }
  return { L, duration, meanSpeed, stallCount };
}

/* Analyse complète d'un tracé d'ellipse.
   -> { fit, loops, regularity, passSpread, degree, theta, ...motion } ou null. */
export function analyzeEllipse(rawPts) {
  const pts = cleanPath(rawPts);
  if (pts.length < 10) return null;
  const fit = fitEllipse(pts);
  if (!fit) return null;

  const { cx, cy, a, b, theta } = fit;
  const cos = Math.cos(-theta), sin = Math.sin(-theta);

  // rayon normalisé : 1 = pile sur l'ellipse ajustée
  const rs = [], angs = [];
  for (const pt of pts) {
    const u = pt.x - cx, w = pt.y - cy;
    const p = u * cos - w * sin;          // repère propre de l'ellipse
    const q = u * sin + w * cos;
    rs.push(Math.hypot(p / a, q / b));
    angs.push(Math.atan2(q / b, p / a));
  }

  // RÉGULARITÉ : écart-type du rayon normalisé (0 = ellipse parfaite)
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
  const regularity = Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length);

  // DRAW-THROUGH : angle cumulé autour du centre / 2π
  let sweep = 0;
  for (let i = 1; i < angs.length; i++) {
    let d = angs[i] - angs[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
  }
  const loops = Math.abs(sweep) / (2 * Math.PI);

  // ÉCART ENTRE PASSAGES : par secteur angulaire, dispersion des rayons des différents tours
  const BINS = 36;
  const bins = Array.from({ length: BINS }, () => []);
  for (let i = 0; i < rs.length; i++) {
    const k = Math.floor(((angs[i] + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
    bins[k].push(rs[i]);
  }
  let acc = 0, nb = 0;
  for (const bin of bins) {
    if (bin.length < 2) continue;
    acc += Math.max(...bin) - Math.min(...bin);
    nb++;
  }
  const passSpread = nb ? acc / nb : 0;

  return {
    fit, loops, regularity, passSpread,
    degree: b / a, theta, cx, cy, a, b,
    ...motionMetrics(pts),
  };
}

/* Points d'une ellipse ajustée (pour le rendu / les tests). */
export function ellipsePoints(fit, n = 64) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const p = fit.a * Math.cos(t), q = fit.b * Math.sin(t);
    out.push({
      x: fit.cx + p * Math.cos(fit.theta) - q * Math.sin(fit.theta),
      y: fit.cy + p * Math.sin(fit.theta) + q * Math.cos(fit.theta),
    });
  }
  return out;
}
