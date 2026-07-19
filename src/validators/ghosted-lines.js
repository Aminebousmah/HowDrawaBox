/* Validateur — Ghosted Lines (Leçon 1)
   On place deux points (départ + arrivée), on « fantôme » le geste, puis on
   trace UNE ligne confiante qui relie les deux. Par rapport aux superimposed :
   même exigence de droiture/fluidité/confiance, PLUS la précision d'arrivée
   sur les points cibles (c'est la brique réutilisée par planes et boxes).

   validate(points, target) -> { score, metrics{}, feedback[] }
     target = { start:{x,y}, end:{x,y} } */

import { analyzeStroke, q, dist } from './geometry.js';

export const TAU = { arc: 0.030, wobble: 0.010, endpoint: 0.030 };

export function validate(points, target) {
  const a = analyzeStroke(points);
  if (!a) return null;

  const idealL = dist(target.start.x, target.start.y, target.end.x, target.end.y) || 1;

  // apparier les extrémités du trait aux cibles (indépendant du sens de tracé)
  const direct = dist(a.start.x, a.start.y, target.start.x, target.start.y)
               + dist(a.end.x, a.end.y, target.end.x, target.end.y);
  const swapped = dist(a.start.x, a.start.y, target.end.x, target.end.y)
                + dist(a.end.x, a.end.y, target.start.x, target.start.y);
  let startErr, endErr;
  if (direct <= swapped) {
    startErr = dist(a.start.x, a.start.y, target.start.x, target.start.y) / idealL;
    endErr   = dist(a.end.x, a.end.y, target.end.x, target.end.y) / idealL;
  } else {
    startErr = dist(a.start.x, a.start.y, target.end.x, target.end.y) / idealL;
    endErr   = dist(a.end.x, a.end.y, target.start.x, target.start.y) / idealL;
  }
  const overshoot = Math.max(0, (a.L - idealL) / idealL); // trait plus long que la cible

  const qWob = q(a.wobble, TAU.wobble) * (a.reversals <= 2 ? 1 : Math.exp(-Math.pow((a.reversals - 2) / 4, 2)));
  const qArc = q(a.arc, TAU.arc);
  const qStart = q(startErr, TAU.endpoint);
  const qEnd = q(endErr, TAU.endpoint);
  const qAcc = 0.5 * (qStart + qEnd);
  const qConf = Math.pow(0.5, a.stallCount) * Math.exp(-Math.pow(a.retrace / 0.05, 2));

  // ghosted : la précision compte davantage, la confiance reste centrale
  const score = 0.30 * qAcc + 0.25 * qWob + 0.20 * qArc + 0.25 * qConf;

  const feedback = [];
  if (a.stallCount > 0) feedback.push({ t: 'bad', m: `Ralentissement au milieu (${a.stallCount}) — le trait doit partir d'un coup.` });
  if (a.retrace > 0.06) feedback.push({ t: 'bad', m: `Aller-retour détecté — une seule passe.` });
  if (qWob < 0.6) feedback.push({ t: 'bad', m: `Trait hésitant : fais confiance au bras plutôt que de corriger.` });
  if (qEnd < 0.5) feedback.push({ t: 'warn', m: `Tu rates le point d'arrivée — regarde la cible, pas la pointe.` });
  if (qStart < 0.5) feedback.push({ t: 'warn', m: `Départ mal placé — pose bien la pointe sur le point de départ.` });
  if (qArc < 0.6 && qWob > 0.6) feedback.push({ t: 'warn', m: `Geste fluide mais bombé entre les deux points.` });
  if (feedback.length === 0) feedback.push({ t: 'good', m: `Ligne confiante et précise.` });

  return {
    score,
    metrics: {
      arc: a.arc, wobble: a.wobble, reversals: a.reversals,
      startErr, endErr, overshoot,
      duration: Math.round(a.duration), meanSpeed: a.meanSpeed, stallCount: a.stallCount, retrace: a.retrace,
      qWob, qArc, qStart, qEnd, qAcc, qConf,
      start: a.start, end: a.end,
    },
    feedback,
  };
}
