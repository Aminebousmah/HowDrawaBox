/* Tests des validateurs sur tracés synthétiques.
   Lancer :  node src/validators/test.mjs
   Assertions simples : bon tracé -> score haut, mauvais -> métrique cible dégradée. */

import { validate as validateSuperimposed, sessionFraying } from './superimposed-lines.js';
import { validate as validateGhosted } from './ghosted-lines.js';
import { analyzeEllipse } from './ellipse-geometry.js';
import { validate as validateEllipsePlane } from './ellipses-in-planes.js';
import { validate as validateFunnel } from './funnels.js';
import { validate as validateGhostedPlane } from './ghosted-planes.js';
import { straightMark, flowingMark, convergentMark } from './markmaking.js';
import { strokes, A, B, makeStroke, makeEllipse } from './fixtures.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}
function pct(x) { return (x * 100).toFixed(0); }

// ---------- Superimposed ----------
console.log('\n# superimposed-lines');
const guide = { ax: A.x, ay: A.y, bx: B.x, by: B.y };
const S = {};
for (const k of Object.keys(strokes)) S[k] = validateSuperimposed(strokes[k], guide);

check('perfect ~ 100', S.perfect.score > 0.95, `score=${pct(S.perfect.score)}`);
check('wobbly détecté (qWob bas)', S.wobbly.metrics.qWob < 0.2 && S.wobbly.metrics.reversals > 6, `rev=${S.wobbly.metrics.reversals}`);
check('arc détecté (qArc bas, qWob haut)', S.arced.metrics.qArc < 0.2 && S.arced.metrics.qWob > 0.6, `qArc=${S.arced.metrics.qArc.toFixed(2)} qWob=${S.arced.metrics.qWob.toFixed(2)}`);
check('stall détecté', S.stall.metrics.stallCount > 0, `stalls=${S.stall.metrics.stallCount}`);
check('offset peu pénalisé (pas le but)', S.offset.score > 0.8, `score=${pct(S.offset.score)}`);
check('wobbly < perfect', S.wobbly.score < S.perfect.score);

// fraying session : traits serrés -> 'tight' ; dispersés aux 2 bouts -> 'both'
const tight = sessionFraying([S.perfect, S.perfect, S.perfect], guide);
check('fraying tight', tight.verdict === 'tight', tight.verdict);
const jitter = (dx0, dy0, dx1, dy1) => ({ metrics: { start: { x: A.x + dx0, y: A.y + dy0 }, end: { x: B.x + dx1, y: B.y + dy1 } } });
const both = sessionFraying([jitter(0, 0, 0, 0), jitter(30, 20, 30, -20), jitter(-25, -15, -30, 25)], guide);
check('fraying des 2 côtés', both.verdict === 'both', both.verdict);

// ---------- Ghosted ----------
console.log('\n# ghosted-lines');
const target = { start: A, end: B };
const G = {};
for (const k of Object.keys(strokes)) G[k] = validateGhosted(strokes[k], target);

check('perfect ~ 100', G.perfect.score > 0.95, `score=${pct(G.perfect.score)}`);
check('missStart : départ raté', G.missStart.metrics.qStart < 0.5, `qStart=${G.missStart.metrics.qStart.toFixed(2)}`);
check('appariement sens inverse', (() => {
  const rev = strokes.perfect.slice().reverse().map((p, i, a) => ({ ...p, t: i * 8 }));
  const r = validateGhosted(rev, target);
  return r.metrics.qStart > 0.9 && r.metrics.qEnd > 0.9;
})(), 'endpoints doivent matcher malgré le sens');
check('wobbly < perfect', G.wobbly.score < G.perfect.score);

// ---------- Géométrie d'ellipse ----------
console.log('\n# ellipse-geometry');
const near = (x, t, tol) => Math.abs(x - t) <= tol;

const perfect = analyzeEllipse(makeEllipse());
check('fit retrouve le centre', perfect && near(perfect.cx, 400, 2) && near(perfect.cy, 300, 2),
  perfect ? `(${perfect.cx.toFixed(1)},${perfect.cy.toFixed(1)})` : 'null');
check('fit retrouve les axes', near(perfect.a, 200, 3) && near(perfect.b, 100, 3),
  `a=${perfect.a.toFixed(1)} b=${perfect.b.toFixed(1)}`);
check('fit retrouve l\'angle', near(perfect.theta * 180 / Math.PI, 17.19, 1.5),
  `${(perfect.theta * 180 / Math.PI).toFixed(2)}°`);
check('ellipse parfaite -> regularity ~ 0', perfect.regularity < 0.01, `${perfect.regularity.toFixed(4)}`);
check('draw-through : 2 tours détectés', near(perfect.loops, 2, 0.05), `loops=${perfect.loops.toFixed(2)}`);

check('1 seul tour détecté (faute)', near(analyzeEllipse(makeEllipse({ loops: 1 })).loops, 1, 0.05));
check('3 tours détectés (acceptable)', near(analyzeEllipse(makeEllipse({ loops: 3 })).loops, 3, 0.05));

const wobbly = analyzeEllipse(makeEllipse({ wobble: 0.08 }));
check('ellipse déformée -> regularity élevée', wobbly.regularity > 0.04 && wobbly.regularity > perfect.regularity * 5,
  `${wobbly.regularity.toFixed(4)} vs parfaite ${perfect.regularity.toFixed(4)}`);

const circle = analyzeEllipse(makeEllipse({ a: 150, b: 150, theta: 0 }));
check('cercle -> degree ~ 1', near(circle.degree, 1, 0.03), `degree=${circle.degree.toFixed(3)}`);
const narrow = analyzeEllipse(makeEllipse({ a: 200, b: 50, theta: 1.0 }));
check('ellipse étroite -> degree ~ 0.25', near(narrow.degree, 0.25, 0.03), `degree=${narrow.degree.toFixed(3)}`);

const drifted = analyzeEllipse(makeEllipse({ drift: 0.06 }));
check('passages divergents -> passSpread élevé', drifted.passSpread > perfect.passSpread * 5,
  `${drifted.passSpread.toFixed(4)} vs parfaite ${perfect.passSpread.toFixed(4)}`);

// ---------- Ellipses in planes ----------
console.log('\n# ellipses-in-planes');
// plan rectangulaire 400x200 centré en (400,300) -> ellipse inscrite = a=200 b=100
const plane = { type: 'plane', corners: [{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 400 }, { x: 200, y: 400 }] };
const inscribed = { cx: 400, cy: 300, a: 200, b: 100, theta: 0 };

const E = {
  fit:      validateEllipsePlane(makeEllipse({ ...inscribed }), plane),
  single:   validateEllipsePlane(makeEllipse({ ...inscribed, loops: 1 }), plane),
  three:    validateEllipsePlane(makeEllipse({ ...inscribed, loops: 3 }), plane),
  deformed: validateEllipsePlane(makeEllipse({ ...inscribed, wobble: 0.09 }), plane),
  floating: validateEllipsePlane(makeEllipse({ ...inscribed, a: 110, b: 55 }), plane),
  loose:    validateEllipsePlane(makeEllipse({ ...inscribed, drift: 0.07 }), plane),
};

check('ellipse inscrite -> score haut', E.fit.score > 0.9, `score=${pct(E.fit.score)}`);
check('inscrite touche les 4 bords', E.fit.metrics.qEdge > 0.9, `edgeErr=${(E.fit.metrics.edgeErr * 100).toFixed(2)}%`);
check('1 tour -> draw-through sanctionné', E.single.metrics.qLoops < 0.1, `qLoops=${E.single.metrics.qLoops.toFixed(2)}`);
check('3 tours -> accepté', E.three.metrics.qLoops > 0.8, `qLoops=${E.three.metrics.qLoops.toFixed(2)}`);
check('déformée -> régularité sanctionnée', E.deformed.metrics.qReg < 0.3, `qReg=${E.deformed.metrics.qReg.toFixed(2)}`);
check('flottante -> bords ratés mais forme OK', E.floating.metrics.qEdge < 0.2 && E.floating.metrics.qReg > 0.8,
  `qEdge=${E.floating.metrics.qEdge.toFixed(2)} qReg=${E.floating.metrics.qReg.toFixed(2)}`);
check('passages lâches -> qTight bas', E.loose.metrics.qTight < 0.6, `qTight=${E.loose.metrics.qTight.toFixed(2)}`);
check('priorité Drawabox : déformée < flottante',
  E.deformed.score < E.floating.score,
  `déformée=${pct(E.deformed.score)} flottante=${pct(E.floating.score)}`);
check('feedback nomme la faute (1 tour)', E.single.feedback.some(f => /tour/.test(f.m)));

// ---------- Mark-making (droite / fluide / convergente) ----------
console.log('\n# markmaking');
const st = { straight: straightMark(strokes.perfect), sArc: straightMark(strokes.arced), sWob: straightMark(strokes.wobbly) };
check('arête droite -> score haut', st.straight.score > 0.9, `score=${pct(st.straight.score)}`);
check('arête bombée -> droiture sanctionnée', st.sArc.metrics.qStraight < 0.2, `qStraight=${st.sArc.metrics.qStraight.toFixed(2)}`);
check('arête hésitante < droite', st.sWob.score < st.straight.score);

const fl = { arc: flowingMark(strokes.arced), wob: flowingMark(strokes.wobbly) };
check('courbe fluide acceptée (arc non pénalisé)', fl.arc.score > 0.9, `score=${pct(fl.arc.score)}`);
check('flowing(arc) > straight(arc) : la courbure est permise', fl.arc.score > st.sArc.score,
  `flow=${pct(fl.arc.score)} straight=${pct(st.sArc.score)}`);
check('gribouillé (wobbly) sanctionné', fl.wob.metrics.qFluid < 0.3, `qFluid=${fl.wob.metrics.qFluid.toFixed(2)}`);

// convergence : PF à droite, même y que le trait horizontal -> converge ; sinon non
const hz = { vps: [{ x: 900, y: 300 }], axes: [Math.PI / 2] };
const cvGood = convergentMark(strokes.perfect, hz);           // horizontal pointant vers le PF
const diag = makeStroke(u => ({ x: 300 + 200 * u, y: 100 + 200 * u }));
const cvBad = convergentMark(diag, hz);                       // 45°, ni vertical ni vers le PF
check('arête vers le PF -> convergence haute', cvGood.metrics.qDir > 0.9, `qDir=${cvGood.metrics.qDir.toFixed(2)}`);
check('arête qui ne converge pas -> convergence basse', cvBad.metrics.qDir < 0.3, `qDir=${cvBad.metrics.qDir.toFixed(2)}`);
check('convergente : bon > mauvais', cvGood.score > cvBad.score);

// ---------- Funnels : alignement sur l'axe mineur ----------
console.log('\n# funnels');
const funnel = { type: 'funnel', ax: 400, ay: 100, bx: 400, by: 500, w: 90 }; // axe vertical
const fAligned = validateFunnel(makeEllipse({ cx: 400, cy: 300, a: 120, b: 60, theta: 0, loops: 2 }), funnel);
const fSkew = validateFunnel(makeEllipse({ cx: 400, cy: 300, a: 120, b: 60, theta: Math.PI / 2, loops: 2 }), funnel);
check('ellipse alignée sur l\'axe -> qAlign haut', fAligned.metrics.qAlign > 0.85, `qAlign=${fAligned.metrics.qAlign.toFixed(2)}`);
check('ellipse mal orientée -> qAlign bas', fSkew.metrics.qAlign < 0.2, `qAlign=${fSkew.metrics.qAlign.toFixed(2)}`);
check('funnels : alignée > mal orientée', fAligned.score > fSkew.score);

// ---------- Ghosted planes : appariement à l'arête la plus proche ----------
console.log('\n# ghosted-planes');
const quad = { type: 'plane', corners: [{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 400 }, { x: 200, y: 400 }] };
const topEdge = makeStroke(u => ({ x: 200 + 400 * u, y: 200 }));
const gp = validateGhostedPlane(topEdge, quad);
check('trait sur une arête du plan -> score haut', gp.score > 0.9, `score=${pct(gp.score)}`);

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
