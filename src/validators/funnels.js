/* Validateur — Funnels (Leçon 1)
   Des ellipses logées dans un entonnoir, alignées sur un axe mineur central :
   cet axe doit couper chaque ellipse en deux moitiés symétriques (comme dans
   l'exercice, « slanted and cut unevenly » = faute la plus courante).

   Priorités : régularité (forme lisse) > draw-through > alignement sur l'axe mineur.

   validate(points, target) -> { score, metrics{}, feedback[] }
     target = { type:'funnel', ax, ay, bx, by, ... } (ax..by = axe central) */

import { analyzeEllipse } from './ellipse-geometry.js';
import { q } from './geometry.js';
import { loopQuality } from './ellipses-in-planes.js';
import { angDiffPi } from './markmaking.js';

export const TAU = { regularity: 0.035, align: 0.16 };

export function validate(points, target) {
  const e = analyzeEllipse(points); if (!e) return null;

  const axisAng = Math.atan2(target.by - target.ay, target.bx - target.ax);
  // e.theta = angle du GRAND axe ; le petit axe lui est perpendiculaire et doit
  // s'aligner sur l'axe central de l'entonnoir.
  const minorAng = e.theta + Math.PI / 2;
  const alignErr = angDiffPi(minorAng, axisAng);

  const qReg = q(e.regularity, TAU.regularity);
  const qLoops = loopQuality(e.loops);
  const qAlign = q(alignErr, TAU.align);
  const qConf = Math.pow(0.6, e.stallCount);

  const score = 0.34 * qReg + 0.22 * qLoops + 0.26 * qAlign + 0.18 * qConf;

  const fb = [];
  if (e.loops < 1.6) fb.push({ t: 'bad', m: `Tu n'as pas fait le tour : repasse 2 fois (3 max) avant de lever le stylo.` });
  if (qReg < 0.6) fb.push({ t: 'bad', m: `Ellipse déformée : la forme lisse et régulière prime.` });
  if (qAlign < 0.5) fb.push({ t: 'warn', m: `Ellipse mal alignée : l'axe mineur central doit la couper en deux moitiés symétriques.` });
  if (e.stallCount > 0) fb.push({ t: 'bad', m: `Ralentissement (${e.stallCount}) — une ellipse se trace vite.` });
  if (!fb.length) fb.push({ t: 'good', m: `Ellipse régulière et bien alignée sur l'axe.` });

  return {
    score,
    metrics: {
      regularity: e.regularity, loops: e.loops, alignErr, degree: e.degree, passSpread: e.passSpread,
      duration: Math.round(e.duration), meanSpeed: e.meanSpeed, stallCount: e.stallCount,
      qReg, qLoops, qAlign, qConf, fit: e.fit,
    },
    feedback: fb,
  };
}
