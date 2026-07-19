/* Configuration par type d'exercice : validateur, génération de cible,
   3 qualités de synthèse (panneau) + détail des métriques brutes (repliable).
   Clé = `name` de l'exercice dans drawabox.json. */

import * as superimposed from '../validators/superimposed-lines.js';
import * as ghosted from '../validators/ghosted-lines.js';
import * as ghostedPlanes from '../validators/ghosted-planes.js';
import * as ellipsesInPlanes from '../validators/ellipses-in-planes.js';
import * as funnelsV from '../validators/funnels.js';
import * as mk from '../validators/markmaking.js';

function randomSpan(w, h, lenFrac) {
  const L = Math.min(w * 0.9, Math.min(w, h) * (0.5 + lenFrac));
  const ang = (Math.random() * 2 - 1) * (35 * Math.PI / 180);
  const cx = w / 2, cy = h / 2;
  const dx = Math.cos(ang) * L / 2, dy = Math.sin(ang) * L / 2;
  return { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy };
}

/* Plan = trapèze tourné : convexe par construction, donc toujours dessinable. */
function randomPlane(w, h, lenFrac) {
  const S = Math.min(w, h) * (0.35 + lenFrac * 0.5);
  const wt = S * (0.8 + Math.random() * 0.4);
  const wb = S * (0.8 + Math.random() * 0.4);
  const ht = S * (0.45 + Math.random() * 0.3);
  const th = (Math.random() * 2 - 1) * (30 * Math.PI / 180);
  const cx = w / 2, cy = h / 2;
  const corners = [[-wt / 2, -ht / 2], [wt / 2, -ht / 2], [wb / 2, ht / 2], [-wb / 2, ht / 2]]
    .map(([x, y]) => ({
      x: cx + x * Math.cos(th) - y * Math.sin(th),
      y: cy + x * Math.sin(th) + y * Math.cos(th),
    }));
  return { type: 'plane', corners };
}

/* Cellule rectangulaire alignée sur les axes (tables d'ellipses). */
function randomRectCell(w, h, lenFrac) {
  const cw = Math.min(w * 0.55, Math.min(w, h) * (0.4 + lenFrac * 0.5));
  const ch = cw * (0.62 + Math.random() * 0.2);
  const cx = w / 2, cy = h / 2;
  const corners = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]]
    .map(([x, y]) => ({ x: cx + x, y: cy + y }));
  return { type: 'plane', corners };
}

/* Entonnoir : axe central (proche vertical) + demi-largeur des arcs. */
function randomFunnel(w, h, lenFrac) {
  const L = Math.min(h * 0.8, Math.min(w, h) * (0.6 + lenFrac * 0.6));
  const ang = (Math.random() * 2 - 1) * (18 * Math.PI / 180) + Math.PI / 2;
  const cx = w / 2, cy = h / 2;
  const dx = Math.cos(ang) * L / 2, dy = Math.sin(ang) * L / 2;
  return { type: 'funnel', ax: cx - dx, ay: cy - dy, bx: cx + dx, by: cy + dy, w: L * 0.22 };
}

/* Horizon + points de fuite. axes = directions fixes autorisées (radians, non orientées). */
function horizon2(w, h) {
  const hy = h * (0.42 + Math.random() * 0.16);
  return { type: 'horizon', hy, vps: [{ x: w * 0.04, y: hy }, { x: w * 0.96, y: hy }], axes: [Math.PI / 2] };
}
function horizon1(w, h) {
  const hy = h * (0.42 + Math.random() * 0.16);
  return { type: 'horizon', hy, vps: [{ x: w * 0.5, y: hy }], axes: [Math.PI / 2, 0] };
}

const band = q => q >= 0.7 ? 'good' : q >= 0.45 ? 'mid' : 'bad';
const quality = (label, q) => ({ label, value: Math.round(q * 100), band: band(q) });
const deg = r => (r * 180 / Math.PI).toFixed(1) + '°';

/* Détails « confiance » communs aux validateurs mark-making. */
function confDetails(m) {
  return [
    { label: 'Wobble · hésitation', value: (m.wobble * 100).toFixed(2) + '%', q: m.qFluid },
    { label: 'Reversals', value: m.reversals, q: m.reversals <= 2 ? 1 : m.reversals <= 5 ? 0.5 : 0.2 },
    { label: 'Stalls', value: m.stallCount, q: m.stallCount === 0 ? 1 : 0.2 },
    { label: 'Retrace · gribouillage', value: (m.retrace * 100).toFixed(1) + '%', q: m.retrace < 0.03 ? 1 : 0.3 },
    { label: 'Vitesse', value: m.meanSpeed.toFixed(2) + ' px/ms', q: null },
    { label: 'Durée', value: m.duration + ' ms', q: null },
  ];
}

export const MODES = {
  /* Canvas de dessin libre assumé (bouton « Dessin libre »), par opposition à
     FREE_MODE qui est le repli des exercices pas encore dotés d'un validateur. */
  freedraw: {
    free: true,
    hint: 'Page blanche. Ajoute une photo ou une vidéo en référence et dessine.',
    session: null,
    makeTarget() { return null; },
  },

  superimposedlines: {
    hint: 'Repasse sur la ligne guide — trait franc, sans t\'arrêter.',
    validate: superimposed.validate,
    session: 'fraying',
    fraying: superimposed.sessionFraying,
    makeTarget(w, h, lenFrac) {
      const s = randomSpan(w, h, lenFrac);
      return { type: 'guide', ax: s.x1, ay: s.y1, bx: s.x2, by: s.y2 };
    },
    qualities(m) {
      return [quality('Droiture', m.qArc), quality('Fluidité', m.qWob), quality('Adhérence', m.qAdh)];
    },
    detailRows(m) {
      return [
        { label: 'Wobble · hésitation', value: (m.wobble * 100).toFixed(2) + '%', q: m.qWob },
        { label: 'Reversals', value: m.reversals, q: m.reversals <= 2 ? 1 : m.reversals <= 5 ? 0.5 : 0.2 },
        { label: 'Arc · bombé', value: (m.arc * 100).toFixed(2) + '%', q: m.qArc },
        { label: 'Adhérence guide', value: (m.adherence * 100).toFixed(1) + '%', q: m.qAdh },
        { label: 'Vitesse', value: m.meanSpeed.toFixed(2) + ' px/ms', q: null },
        { label: 'Durée', value: m.duration + ' ms', q: null },
        { label: 'Stalls', value: m.stallCount, q: m.stallCount === 0 ? 1 : 0.2 },
        { label: 'Retrace', value: (m.retrace * 100).toFixed(1) + '%', q: m.retrace < 0.03 ? 1 : 0.3 },
      ];
    },
  },

  ghostedlines: {
    hint: 'Vise les deux points, fantôme le geste, puis UNE ligne confiante.',
    validate: ghosted.validate,
    session: null,
    makeTarget(w, h, lenFrac) {
      const s = randomSpan(w, h, lenFrac);
      return { type: 'dots', start: { x: s.x1, y: s.y1 }, end: { x: s.x2, y: s.y2 } };
    },
    qualities(m) {
      return [quality('Droiture', m.qArc), quality('Fluidité', m.qWob), quality('Précision', m.qAcc)];
    },
    detailRows(m) {
      return [
        { label: 'Erreur départ', value: (m.startErr * 100).toFixed(2) + '%', q: m.qStart },
        { label: 'Erreur arrivée', value: (m.endErr * 100).toFixed(2) + '%', q: m.qEnd },
        { label: 'Wobble · hésitation', value: (m.wobble * 100).toFixed(2) + '%', q: m.qWob },
        { label: 'Arc · bombé', value: (m.arc * 100).toFixed(2) + '%', q: m.qArc },
        { label: 'Overshoot', value: (m.overshoot * 100).toFixed(1) + '%', q: m.overshoot < 0.05 ? 1 : 0.4 },
        { label: 'Vitesse', value: m.meanSpeed.toFixed(2) + ' px/ms', q: null },
        { label: 'Stalls', value: m.stallCount, q: m.stallCount === 0 ? 1 : 0.2 },
        { label: 'Retrace', value: (m.retrace * 100).toFixed(1) + '%', q: m.retrace < 0.03 ? 1 : 0.3 },
      ];
    },
  },

  ghostedplanes: {
    hint: 'Pose les 4 coins, puis relie-les par des lignes fantômées confiantes.',
    validate: ghostedPlanes.validate,
    session: null,
    makeTarget(w, h, lenFrac) { return randomPlane(w, h, lenFrac); },
    qualities(m) {
      return [quality('Droiture', m.qArc), quality('Fluidité', m.qWob), quality('Précision', m.qAcc)];
    },
    detailRows: (m) => MODES.ghostedlines.detailRows(m),
  },

  ellipsesinplanes: {
    hint: 'Une ellipse qui touche les 4 bords — 2 tours, forme lisse avant tout.',
    validate: ellipsesInPlanes.validate,
    session: null,
    makeTarget(w, h, lenFrac) { return randomPlane(w, h, lenFrac); },
    qualities(m) {
      // Ordre = priorités de Drawabox : la forme d'abord, la précision ensuite.
      return [quality('Régularité', m.qReg), quality('Draw-through', m.qLoops), quality('Précision', m.qEdge)];
    },
    detailRows(m) {
      return [
        { label: 'Régularité (écart au fit)', value: (m.regularity * 100).toFixed(2) + '%', q: m.qReg },
        { label: 'Tours', value: m.loops.toFixed(2), q: m.qLoops },
        { label: 'Superposition des passages', value: (m.passSpread * 100).toFixed(2) + '%', q: m.qTight },
        { label: 'Écart aux 4 bords', value: (m.edgeErr * 100).toFixed(2) + '%', q: m.qEdge },
        { label: 'Bord le plus raté', value: (m.worstEdge * 100).toFixed(2) + '%', q: null },
        { label: 'Degré (petit/grand axe)', value: m.degree.toFixed(2), q: null },
        { label: 'Vitesse', value: m.meanSpeed.toFixed(2) + ' px/ms', q: null },
        { label: 'Durée', value: m.duration + ' ms', q: null },
        { label: 'Stalls', value: m.stallCount, q: m.stallCount === 0 ? 1 : 0.2 },
      ];
    },
  },

  tablesofellipses: {
    hint: 'Remplis la case d\'ellipses régulières — 2 tours, touche les bords.',
    validate: ellipsesInPlanes.validate,     // même critère : régularité + draw-through + bords
    session: null,
    makeTarget(w, h, lenFrac) { return randomRectCell(w, h, lenFrac); },
    qualities: (m) => MODES.ellipsesinplanes.qualities(m),
    detailRows: (m) => MODES.ellipsesinplanes.detailRows(m),
  },

  funnels: {
    hint: 'Ellipses alignées sur l\'axe central — il doit les couper en deux moitiés égales.',
    validate: funnelsV.validate,
    session: null,
    makeTarget(w, h, lenFrac) { return randomFunnel(w, h, lenFrac); },
    qualities(m) {
      return [quality('Régularité', m.qReg), quality('Alignement axe', m.qAlign), quality('Draw-through', m.qLoops)];
    },
    detailRows(m) {
      return [
        { label: 'Régularité (écart au fit)', value: (m.regularity * 100).toFixed(2) + '%', q: m.qReg },
        { label: 'Alignement axe mineur', value: deg(m.alignErr), q: m.qAlign },
        { label: 'Tours', value: m.loops.toFixed(2), q: m.qLoops },
        { label: 'Degré (petit/grand axe)', value: m.degree.toFixed(2), q: null },
        { label: 'Vitesse', value: m.meanSpeed.toFixed(2) + ' px/ms', q: null },
        { label: 'Durée', value: m.duration + ' ms', q: null },
        { label: 'Stalls', value: m.stallCount, q: m.stallCount === 0 ? 1 : 0.2 },
      ];
    },
  },

  // ---- Perspective : convergence des arêtes ----
  plottedperspective: {
    hint: 'Arêtes de profondeur vers un point de fuite ; verticales bien droites.',
    validate: mk.convergentMark,
    session: null,
    makeTarget(w, h) { return horizon2(w, h); },
    qualities: (m) => convQualities(m),
    detailRows: (m) => convDetails(m),
  },
  roughperspective: {
    hint: 'Estime la convergence vers le point de fuite central — pas de règle.',
    validate: mk.convergentMark,
    session: null,
    makeTarget(w, h) { return horizon1(w, h); },
    qualities: (m) => convQualities(m),
    detailRows: (m) => convDetails(m),
  },

  // ---- Arêtes droites et confiantes, sans point de fuite fixe ----
  rotatedboxes: {
    hint: 'Chaque arête : droite et confiante — le reste vient de la construction.',
    validate: mk.straightMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => straightQualities(m), detailRows: (m) => straightDetails(m),
  },
  organicperspective: {
    hint: 'Boîtes librement orientées — vise des arêtes droites et assurées.',
    validate: mk.straightMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => straightQualities(m), detailRows: (m) => straightDetails(m),
  },
  formintersections: {
    hint: 'Arêtes droites et confiantes — pas de passe de nettoyage.',
    validate: mk.straightMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => straightQualities(m), detailRows: (m) => straightDetails(m),
  },

  // ---- Traits fluides (courbe autorisée) : confiance et fluidité ----
  organicarrows: {
    hint: 'Courbe en S fluide, tracée depuis l\'épaule — confiance avant précision.',
    validate: mk.flowingMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => flowingQualities(m), detailRows: (m) => confDetails(m),
  },
  contourlines: {
    hint: 'Contours fluides qui épousent la forme — pas d\'hésitation.',
    validate: mk.flowingMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => flowingQualities(m), detailRows: (m) => confDetails(m),
  },
  dissections: {
    hint: 'Marques franches, jamais gribouillées — une seule passe.',
    validate: mk.flowingMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => flowingQualities(m), detailRows: (m) => confDetails(m),
  },
  organicintersections: {
    hint: 'Saucisses et contours fluides — trait assuré, sans corrections.',
    validate: mk.flowingMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => flowingQualities(m), detailRows: (m) => confDetails(m),
  },
  textureanalysis: {
    hint: 'Marques d\'ombre franches — jamais de gribouillage aléatoire.',
    validate: mk.flowingMark, session: null, noTarget: true,
    makeTarget() { return null; },
    qualities: (m) => flowingQualities(m), detailRows: (m) => confDetails(m),
  },
};

function convQualities(m) {
  return [quality('Convergence', m.qDir), quality('Droiture', m.qStraight), quality('Fluidité', m.qFluid)];
}
function convDetails(m) {
  return [
    { label: 'Écart d\'angle', value: deg(m.angErr), q: m.qDir },
    { label: 'Aligné sur', value: m.converge, q: null },
    { label: 'Arc · bombé', value: (m.arc * 100).toFixed(2) + '%', q: m.qStraight },
    { label: 'Wobble · hésitation', value: (m.wobble * 100).toFixed(2) + '%', q: m.qFluid },
    { label: 'Stalls', value: m.stallCount, q: m.stallCount === 0 ? 1 : 0.2 },
    { label: 'Vitesse', value: m.meanSpeed.toFixed(2) + ' px/ms', q: null },
  ];
}
function straightQualities(m) {
  return [quality('Droiture', m.qStraight), quality('Fluidité', m.qFluid), quality('Confiance', m.qConf)];
}
function straightDetails(m) {
  return [{ label: 'Arc · bombé', value: (m.arc * 100).toFixed(2) + '%', q: m.qStraight }, ...confDetails(m)];
}
function flowingQualities(m) {
  return [quality('Fluidité', m.qFluid), quality('Confiance', m.qConf)];
}

export function hasMode(name) { return !!MODES[name]; }

/* Exercice sans analyse de trait : plan de travail libre (canvas + consigne + vidéo),
   sans cible ni notation. (Filet de sécurité : plus aucun exercice n'y recourt.) */
export const FREE_MODE = {
  free: true,
  hint: 'Suis la consigne et la vidéo — pas encore d\'analyse automatique sur cet exercice.',
  session: null,
  makeTarget() { return null; },
};

export function modeFor(name) { return MODES[name] || FREE_MODE; }
