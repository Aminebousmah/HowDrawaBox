/* Validateurs de tracé « mark-making » réutilisés par les exercices sans cible
   géométrique stricte : perspective (convergence des arêtes vers les points de fuite),
   boîtes librement orientées, et formes organiques (flèches, contours, intersections,
   texture). Tout repose sur analyzeStroke : droiture (arc), fluidité (wobble/reversals),
   confiance (stalls/retrace). Fonctions pures, testables en Node.

   Chaque validate(points[, target]) -> { score, metrics{}, feedback[] } | null */

import { analyzeStroke, q } from './geometry.js';

export const TAU = { arc: 0.05, wobble: 0.013, ang: 0.14 };

function common(a) {
  const qFluid = q(a.wobble, TAU.wobble) * (a.reversals <= 2 ? 1 : Math.exp(-Math.pow((a.reversals - 2) / 4, 2)));
  const qConf = Math.pow(0.5, a.stallCount) * Math.exp(-Math.pow(a.retrace / 0.05, 2));
  const qStraight = q(a.arc, TAU.arc);
  return { qFluid, qConf, qStraight };
}

function strokeAngle(a) { return Math.atan2(a.end.y - a.start.y, a.end.x - a.start.x); }

/* Distance angulaire non orientée (une arête n'a pas de sens) : dans [0, π/2]. */
export function angDiffPi(x, y) { let d = Math.abs(x - y) % Math.PI; return Math.min(d, Math.PI - d); }

function confFeedback(a, k, extra = []) {
  const fb = [...extra];
  if (a.stallCount > 0) fb.push({ t: 'bad', m: `Ralentissement au milieu (${a.stallCount}) — pars d'un coup, sans t'arrêter.` });
  if (a.retrace > 0.06) fb.push({ t: 'bad', m: `Aller-retour / gribouillage — une seule passe franche.` });
  if (k.qFluid < 0.55) fb.push({ t: 'warn', m: `Trait hésitant — fais confiance au bras, ne corrige pas en cours de route.` });
  return fb;
}

const rawMetrics = (a, k, extra = {}) => ({
  arc: a.arc, wobble: a.wobble, reversals: a.reversals,
  duration: Math.round(a.duration), meanSpeed: a.meanSpeed, stallCount: a.stallCount, retrace: a.retrace,
  ...k, ...extra,
});

/* Arête droite et confiante : intersections de formes, boîtes en rotation,
   perspective organique. La droiture prime, la fluidité et la confiance suivent. */
export function straightMark(points) {
  const a = analyzeStroke(points); if (!a) return null;
  const k = common(a);
  const score = 0.42 * k.qStraight + 0.34 * k.qFluid + 0.24 * k.qConf;
  const fb = confFeedback(a, k, k.qStraight < 0.55 ? [{ t: 'warn', m: `Arête bombée — une arête de boîte / forme doit être bien droite.` }] : []);
  if (!fb.length) fb.push({ t: 'good', m: `Arête droite et confiante.` });
  return { score, metrics: rawMetrics(a, k), feedback: fb };
}

/* Trait fluide et confiant, courbe autorisée : flèches, contours, dissections,
   intersections organiques, texture. On ne pénalise PAS la courbure ; on vise la
   fluidité et l'absence d'hésitation / de gribouillage. */
export function flowingMark(points) {
  const a = analyzeStroke(points); if (!a) return null;
  const k = common(a);
  const score = 0.6 * k.qFluid + 0.4 * k.qConf;
  const fb = confFeedback(a, k);
  if (!fb.length) fb.push({ t: 'good', m: `Trait fluide et assuré.` });
  return { score, metrics: rawMetrics(a, k), feedback: fb };
}

/* Arête convergente (perspective tracée / approximative) : droite + confiante +
   alignée sur une direction autorisée — un axe fixe (verticale/horizontale) OU la
   direction vers l'un des points de fuite depuis le milieu du trait.
     target = { vps:[{x,y}...], axes:[angle...] } */
export function convergentMark(points, target) {
  const a = analyzeStroke(points); if (!a) return null;
  const k = common(a);
  const mx = (a.start.x + a.end.x) / 2, my = (a.start.y + a.end.y) / 2;
  const ang = strokeAngle(a);
  const cands = [...(target.axes || [])];
  for (const vp of (target.vps || [])) cands.push(Math.atan2(vp.y - my, vp.x - mx));
  let angErr = Math.PI / 2, which = -1;
  cands.forEach((c, i) => { const d = angDiffPi(ang, c); if (d < angErr) { angErr = d; which = i; } });
  const qDir = q(angErr, TAU.ang);
  const score = 0.34 * qDir + 0.28 * k.qStraight + 0.20 * k.qFluid + 0.18 * k.qConf;
  const nAxes = (target.axes || []).length;
  const label = which < 0 ? '—' : which < nAxes ? 'axe' : 'point de fuite';
  const extra = qDir < 0.5 ? [{ t: 'warn', m: `Cette arête ne converge pas : vise un point de fuite, ou garde-la bien verticale / horizontale.` }] : [];
  const fb = confFeedback(a, k, extra);
  if (k.qStraight < 0.55) fb.push({ t: 'warn', m: `Arête bombée — trace-la bien droite.` });
  if (!fb.length) fb.push({ t: 'good', m: `Arête droite et bien convergente (${label}).` });
  return { score, metrics: rawMetrics(a, k, { angErr, qDir, converge: label }), feedback: fb };
}
