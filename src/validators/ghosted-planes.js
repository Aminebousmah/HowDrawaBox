/* Validateur — Ghosted Planes (Leçon 1)
   Un quadrilatère de 4 coins ; chaque trait relie deux coins (arêtes du plan, ou
   diagonales/croix des étapes ultérieures). On apparie le trait à l'arête dont les
   extrémités collent le mieux, puis on le valide comme une ghosted line vers cette
   paire de points (droiture + fluidité + précision d'arrivée).

   validate(points, target) -> { score, metrics{}, feedback[] }
     target = { type:'plane', corners:[{x,y} x4] } */

import { validate as ghostedValidate } from './ghosted-lines.js';
import { analyzeStroke, dist } from './geometry.js';

export function validate(points, target) {
  const a = analyzeStroke(points); if (!a) return null;
  const c = target.corners;
  const pairs = [
    [c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]], // arêtes
    [c[0], c[2]], [c[1], c[3]],                             // diagonales (la croix)
  ];
  let best = { start: c[0], end: c[1] }, bestErr = Infinity;
  for (const [p, r] of pairs) {
    const d = Math.min(
      dist(a.start.x, a.start.y, p.x, p.y) + dist(a.end.x, a.end.y, r.x, r.y),
      dist(a.start.x, a.start.y, r.x, r.y) + dist(a.end.x, a.end.y, p.x, p.y),
    );
    if (d < bestErr) { bestErr = d; best = { start: p, end: r }; }
  }
  return ghostedValidate(points, best);
}
