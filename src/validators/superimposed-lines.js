/* Validateur — Superimposed Lines (Leçon 1)
   But pédagogique : la CONFIANCE. Le fraying sur un seul bout est normal.
   L'app fournit la guideline (vérité terrain) ; on repasse dessus 8×.

   validate(points, target) -> { score, metrics{}, feedback[] }
     target = { ax, ay, bx, by }  (la guideline)
   Fraying = mesure de niveau session : voir sessionFraying(). */

import { analyzeStroke, distToSegment, q, dist } from './geometry.js';

export const TAU = { arc: 0.030, wobble: 0.010, adherence: 0.045 };

export function validate(points, target) {
  const a = analyzeStroke(points);
  if (!a) return null;

  // adhérence à la guideline (vérité terrain)
  let adh = 0;
  for (const p of a.rs) adh += distToSegment(p.x, p.y, target.ax, target.ay, target.bx, target.by);
  const adherence = (adh / a.rs.length) / a.L;

  const qWob = q(a.wobble, TAU.wobble) * (a.reversals <= 2 ? 1 : Math.exp(-Math.pow((a.reversals - 2) / 4, 2)));
  const qArc = q(a.arc, TAU.arc);
  const qAdh = q(adherence, TAU.adherence);
  const qConf = Math.pow(0.5, a.stallCount) * Math.exp(-Math.pow(a.retrace / 0.05, 2));

  // pondération orientée confiance (l'adhérence n'est pas le but de l'exercice)
  const score = 0.40 * qWob + 0.25 * qConf + 0.20 * qArc + 0.15 * qAdh;

  const feedback = [];
  if (a.stallCount > 0) feedback.push({ t: 'bad', m: `Ralentissement au milieu du trait (${a.stallCount}) — pousse le trait d'un coup.` });
  if (a.retrace > 0.06) feedback.push({ t: 'bad', m: `Aller-retour détecté — une seule passe franche.` });
  if (qWob < 0.6) feedback.push({ t: 'bad', m: `Trait hésitant : tu corriges en route. Trace plus vite, fais confiance au bras.` });
  else if (qArc < 0.6) feedback.push({ t: 'warn', m: `Trait fluide mais bombé — vise mieux l'axe.` });
  if (qAdh < 0.5 && qWob > 0.6) feedback.push({ t: 'warn', m: `Tu t'écartes de la ligne guide, mais le geste est propre.` });
  if (feedback.length === 0) feedback.push({ t: 'good', m: `Trait confiant. Continue.` });

  return {
    score,
    metrics: {
      arc: a.arc, wobble: a.wobble, reversals: a.reversals, adherence,
      duration: Math.round(a.duration), meanSpeed: a.meanSpeed, stallCount: a.stallCount, retrace: a.retrace,
      qWob, qArc, qAdh, qConf,
      start: a.start, end: a.end,
    },
    feedback,
  };
}

/* Fraying = dispersion des extrémités sur les N traits, clusterisées par borne A/B.
   strokes[].metrics.{start,end}, target = guideline.
   -> { spreadA, spreadB, ratioA, ratioB, verdict } */
export function sessionFraying(strokes, target) {
  const A = [], B = [];
  for (const st of strokes) {
    for (const p of [st.metrics.start, st.metrics.end]) {
      const dA = dist(p.x, p.y, target.ax, target.ay);
      const dB = dist(p.x, p.y, target.bx, target.by);
      (dA < dB ? A : B).push(p);
    }
  }
  const spread = (c) => {
    if (c.length < 2) return 0;
    let cx = 0, cy = 0;
    for (const p of c) { cx += p.x; cy += p.y; }
    cx /= c.length; cy /= c.length;
    let s = 0;
    for (const p of c) s += dist(p.x, p.y, cx, cy);
    return s / c.length;
  };
  const L = dist(target.ax, target.ay, target.bx, target.by) || 1;
  const spreadA = spread(A), spreadB = spread(B);
  const ratioA = spreadA / L, ratioB = spreadB / L;
  const tau = 0.04;
  let verdict = 'pending';
  if (strokes.length >= 2) {
    if (ratioA > tau && ratioB > tau) verdict = 'both';       // faute
    else if (ratioA > tau || ratioB > tau) verdict = 'one';   // normal
    else verdict = 'tight';                                   // excellent
  }
  return { spreadA, spreadB, ratioA, ratioB, verdict };
}
