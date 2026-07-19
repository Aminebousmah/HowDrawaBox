/* Suivi de progression (localStorage). Purement local, aucune donnée envoyée.

   Règles d'avancement :
   - une LEÇON est terminée quand toutes ses pages ont été vues ;
   - un EXERCICE est terminé quand l'utilisateur le déclare lui-même (jamais
     automatiquement : jouer un trait ne veut pas dire avoir fini l'exercice).
   Les scores restent enregistrés à part, pour les moyennes. */

const KEY = 'drawlearn.progress.v2';

function today() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ } }

let state = load();
state.exercises ??= {};      // exId -> { count, sum, best, last }
state.exercisesDone ??= {};  // exId -> true (déclaré par l'utilisateur)
state.pagesRead ??= {};      // lessonId -> { page: true }

/* ---- série de jours ---- */
export function touchStreak() {
  const t = today();
  if (state.lastActive === t) { /* déjà compté */ }
  else if (state.lastActive && daysBetween(state.lastActive, t) === 1) state.streak = (state.streak || 0) + 1;
  else state.streak = 1;
  state.lastActive = t;
  save(state);
  return state.streak;
}
export function streak() { return state.streak || 0; }

/* ---- scores (statistiques, pas d'avancement) ---- */
export function recordScore(exId, score100) {
  const e = state.exercises[exId] || { count: 0, sum: 0, best: 0 };
  e.count++; e.sum += score100; e.best = Math.max(e.best, score100); e.last = score100;
  state.exercises[exId] = e;
  save(state);
}
export function exStats(exId) {
  const e = state.exercises[exId];
  if (!e || !e.count) return null;
  return { count: e.count, avg: Math.round(e.sum / e.count), best: e.best, last: e.last };
}

/* ---- exercice terminé : déclaré par l'utilisateur ---- */
export function isExerciseDone(exId) { return !!state.exercisesDone[exId]; }
export function setExerciseDone(exId, done) {
  if (done) state.exercisesDone[exId] = true; else delete state.exercisesDone[exId];
  save(state);
}
export function toggleExerciseDone(exId) {
  setExerciseDone(exId, !isExerciseDone(exId));
  return isExerciseDone(exId);
}

/* ---- pages lues ---- */
export function markPageRead(lessonId, page) {
  (state.pagesRead[lessonId] ??= {})[page] = true;
  save(state);
}
export function isPageRead(lessonId, page) { return !!(state.pagesRead[lessonId] || {})[page]; }
export function pagesReadCount(lessonId) { return Object.keys(state.pagesRead[lessonId] || {}).length; }

/* Leçon terminée = toutes ses pages vues. */
export function lessonDone(lesson) {
  return lesson.pages.length > 0 && lesson.pages.every(p => isPageRead(lesson.id, p.page));
}

/* Verrou : une leçon « franchie » débloque la suivante. On ne masque jamais le
   contenu (outil d'étude perso) : c'est un repère de progression, pas une barrière. */
export function lessonGate(lesson) { return lessonDone(lesson); }

/* ---- reprise ---- */
export function setResume(exId, strokeCount) { state.resume = { exId, strokeCount, at: Date.now() }; save(state); }
export function getResume() { return state.resume || null; }
