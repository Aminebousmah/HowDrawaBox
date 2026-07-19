/* Chargement du contenu pédagogique depuis drawabox.json (source de vérité, EN).
   Traductions FR stockées à part dans content-fr/ (les données d'origine restent figées).
   Ne PAS re-scraper. */

let cache = null;
let manifest = null;
const trCache = new Map(); // path -> markdown | null

export async function loadContent() {
  if (cache) return cache;
  const res = await fetch('drawabox.json');
  if (!res.ok) throw new Error(`drawabox.json: ${res.status}`);
  cache = await res.json();
  return cache;
}

/* Vidéos tuto : mapping exercice/leçon -> vidéos YouTube (content-extra/videos.json).
   Optionnel : si le fichier manque, la fonctionnalité vidéo se désactive proprement. */
let videos = null;
export async function loadVideos() {
  if (videos) return videos;
  try {
    const res = await fetch('content-extra/videos.json');
    videos = res.ok ? await res.json() : { byExercise: {}, byLesson: {}, titles: {} };
  } catch { videos = { byExercise: {}, byLesson: {}, titles: {} }; }
  return videos;
}
/* -> { ids[], playlist, titles } ; ids vide si aucune vidéo pour cet item. */
export function videosFor(kind, key) {
  if (!videos) return { ids: [], playlist: null, titles: {} };
  const map = kind === 'exercise' ? videos.byExercise : videos.byLesson;
  return { ids: (map && map[key]) || [], playlist: videos.playlist || null, titles: videos.titles || {} };
}

/* Une image est-elle la vignette morte d'une vidéo ? -> videoId, sinon null.
   (Le scrape a gardé l'image et jeté le lien youtu.be qui l'entourait.) */
export function videoForThumb(src) {
  if (!videos || !videos.thumbnails || !src) return null;
  return videos.thumbnails[src.split('/').pop()] || null;
}

/* Playlist à passer à l'embed pour CETTE vidéo, ou null si elle n'en fait pas partie.
   Indispensable : avec un list= qui ne contient pas la vidéo, YouTube ignore la vidéo
   demandée et joue la playlist depuis le début. */
export function playlistFor(id) {
  if (!videos || !videos.playlist) return null;
  return (videos.playlistIds || []).includes(id) ? videos.playlist : null;
}

/* Titre connu d'une vidéo (les démos hors playlist n'en ont pas). */
export function videoTitle(id) {
  return (videos && videos.titles && videos.titles[id]) || null;
}

/* Anatomie humaine (Sinix Design) : contenu tiers, hors cursus Drawabox.
   Optionnel : si le fichier manque, la section ne s'affiche simplement pas. */
let anatomy = null;
export async function loadAnatomy() {
  if (anatomy) return anatomy;
  try { const res = await fetch('content-extra/anatomy.json'); anatomy = res.ok ? await res.json() : null; }
  catch { anatomy = null; }
  return anatomy;
}

/* manifest FR : { exercises:[id...], lessons:[id...] } — quels contenus sont traduits. */
export async function loadManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch('content-fr/manifest.json');
    manifest = res.ok ? await res.json() : { exercises: [], lessons: [] };
  } catch { manifest = { exercises: [], lessons: [] }; }
  return manifest;
}

export function isTranslated(kind, id) {
  if (!manifest) return false;
  return (kind === 'exercise' ? manifest.exercises : manifest.lessons).includes(id);
}

/* Titre FR d'un exercice/leçon/partie ; null si non traduit (l'appelant reprend la source EN). */
const TITLE_MAPS = { exercise: 'exerciseTitles', lesson: 'lessonTitles', part: 'partTitles' };
export function frTitle(kind, id) {
  if (!manifest) return null;
  const map = manifest[TITLE_MAPS[kind]];
  return (map && map[id]) || null;
}

/* Chapô FR d'une partie ; null si absent. */
export function frPartIntro(part) {
  return (manifest && manifest.partIntros && manifest.partIntros[part]) || null;
}

/* Titre FR d'une section de page de leçon (sommaire + titre H1) ; null si absent. */
export function frSection(lessonId, page) {
  const s = manifest && manifest.sectionTitles && manifest.sectionTitles[lessonId];
  return (s && s[String(page)]) || null;
}

/* récupère la traduction FR d'un item ; null si absente (repli EN géré par l'appelant). */
export async function fetchTranslation(kind, id) {
  const path = kind === 'exercise' ? `content-fr/ex/${id}.md` : `content-fr/lesson/${id}.md`;
  if (trCache.has(path)) return trCache.get(path);
  let md = null;
  try { const res = await fetch(path); if (res.ok) md = await res.text(); } catch { /* ignore */ }
  trCache.set(path, md);
  return md;
}

export function findExercise(data, name) {
  return data.exercises.find(e => e.name === name || e.id === name);
}

/* markdown EN d'une leçon : concaténation des pages (utilisé pour le tiroir Consigne). */
export function lessonMarkdown(lesson) {
  return lesson.pages.map(p => {
    const head = p.section ? `## ${p.section}\n\n` : '';
    return head + (p.markdown || '');
  }).join('\n\n---\n\n');
}

/* Traduction FR d'UNE page de leçon : content-fr/lesson/<id>/<page>.md ; null si absente.
   Les leçons se lisent page par page, on traduit donc au même grain. */
export async function fetchLessonPage(lessonId, page) {
  const path = `content-fr/lesson/${lessonId}/${page}.md`;
  if (trCache.has(path)) return trCache.get(path);
  let md = null;
  try { const res = await fetch(path); if (res.ok) md = await res.text(); } catch { /* ignore */ }
  trCache.set(path, md);
  return md;
}

/* Mini rendu markdown -> HTML (titres, images, liens, citations, listes, hr, paragraphes).
   Suffisant pour les consignes Drawabox ; pas un parseur complet. */
export function renderMarkdown(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img loading="lazy" alt="${alt}" src="${url}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>');

  const lines = md.split('\n');
  const out = [];
  let para = [], list = null;
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } };
  const flush = () => { flushP(); flushL(); };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m;
    if (/^---+\s*$/.test(line)) { flush(); out.push('<hr>'); }
    else if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^[-*]\s+(.*)/))) { flushP(); (list ||= []).push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^>\s?(.*)/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) { flush(); out.push(inline(line)); }
    else { flushL(); para.push(line.trim()); }
  }
  flush();
  return out.join('\n');
}
