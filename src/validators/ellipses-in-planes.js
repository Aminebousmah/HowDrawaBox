/* Validateur — Ellipses in Planes (Leçon 1)
   Dessiner une ellipse dans un plan, en touchant ses 4 bords.

   Priorités explicites de Drawabox, respectées dans la pondération :
   1. « maintaining a smooth elliptical shape is critical and above all else is your
      first priority » -> la RÉGULARITÉ pèse le plus ;
   2. « getting the ellipse to touch all four edges is your second priority » -> la
      précision compte, mais moins.
   Fautes nommées dans l'énoncé : « deformed ellipse » (bosselée) et « floating
   ellipse » (posée au milieu sans toucher les bords).
   Et la règle transverse : draw through, 2 tours (idéal) ou 3 (acceptable).

   validate(points, target) -> { score, metrics{}, feedback[] }
     target = { type:'plane', corners:[{x,y} x4] } */

import { analyzeEllipse } from './ellipse-geometry.js';
import { distToSegment, q, dist } from './geometry.js';

export const TAU = { regularity: 0.035, passSpread: 0.06, edge: 0.045 };

/* Qualité du draw-through : 2 tours idéal, 3 acceptable, 1 = faute, trop = faute. */
export function loopQuality(loops) {
  if (loops < 2) return Math.exp(-Math.pow((2 - loops) / 0.55, 2));
  if (loops <= 3) return 1 - 0.12 * (loops - 2);
  return 0.88 * Math.exp(-Math.pow((loops - 3) / 0.8, 2));
}

export function validate(points, target) {
  const e = analyzeEllipse(points);
  if (!e) return null;

  const c = target.corners;
  const edges = [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
  const scale = edges.reduce((s, [p, r]) => s + dist(p.x, p.y, r.x, r.y), 0) / 4;

  // Toucher les 4 bords : distance minimale du tracé à chaque bord (0 = tangent).
  const edgeDists = edges.map(([p, r]) => {
    let min = Infinity;
    for (const pt of points) min = Math.min(min, distToSegment(pt.x, pt.y, p.x, p.y, r.x, r.y));
    return min / scale;
  });
  const edgeErr = edgeDists.reduce((s, d) => s + d, 0) / 4;
  const worstEdge = Math.max(...edgeDists);

  const qReg = q(e.regularity, TAU.regularity);
  const qTight = q(e.passSpread, TAU.passSpread);
  const qLoops = loopQuality(e.loops);
  const qEdge = q(edgeErr, TAU.edge);
  const qConf = Math.pow(0.6, e.stallCount);

  const score = 0.34 * qReg + 0.14 * qTight + 0.22 * qLoops + 0.18 * qEdge + 0.12 * qConf;

  const feedback = [];
  if (e.loops < 1.6) feedback.push({ t: 'bad', m: `Tu n'as pas fait le tour : repasse 2 fois (3 max) avant de lever le stylo.` });
  else if (e.loops > 3.6) feedback.push({ t: 'warn', m: `Trop de tours (${e.loops.toFixed(1)}) — 2 suffisent, 3 à la rigueur.` });
  if (qReg < 0.6) feedback.push({ t: 'bad', m: `Ellipse déformée : la forme lisse et régulière prime sur tout le reste.` });
  if (qTight < 0.5 && qReg > 0.5) feedback.push({ t: 'warn', m: `Tes passages ne se superposent pas — laisse le bras refermer la même trajectoire.` });
  if (qEdge < 0.5) feedback.push({ t: 'warn', m: `Ellipse flottante : vise les 4 bords du plan.` });
  if (e.stallCount > 0) feedback.push({ t: 'bad', m: `Ralentissement (${e.stallCount}) — une ellipse se trace vite.` });
  if (!feedback.length) feedback.push({ t: 'good', m: `Ellipse régulière et bien logée.` });

  return {
    score,
    metrics: {
      regularity: e.regularity, passSpread: e.passSpread, loops: e.loops,
      edgeErr, worstEdge, degree: e.degree, theta: e.theta,
      duration: Math.round(e.duration), meanSpeed: e.meanSpeed, stallCount: e.stallCount,
      qReg, qTight, qLoops, qEdge, qConf,
      fit: e.fit,
    },
    feedback,
  };
}
