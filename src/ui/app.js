/* Orchestrateur : Parcours (accueil) · Pratique · Lecture.
   Thème soft/dark, bilingue FR/EN, progression persistante (localStorage). */

import { loadContent, loadManifest, isTranslated, fetchTranslation, fetchLessonPage, renderMarkdown,
         lessonMarkdown, loadVideos, videosFor, videoForThumb, playlistFor, videoTitle,
         frTitle, frPartIntro, frSection, loadAnatomy } from '../content/loader.js';
import { embedUrl, IFRAME_ALLOW } from './video.js';
import { StrokeCapture } from '../canvas/capture.js';
import { CanvasRenderer, scoreColor, scoreBand } from '../canvas/render.js';
import { MODES, hasMode, modeFor, FREE_MODE } from './modes.js';
import { VideoPanel } from './video.js';
import { PipManager } from './pip-manager.js';
import * as prog from '../content/progress.js';

const $ = id => document.getElementById(id);
const qa = sel => Array.from(document.querySelectorAll(sel));

const INK_FREE = '#33322f';   // encre neutre du dessin libre (pas de score à coder en couleur)

let data = null, exById = new Map(), playableIds = new Set();
let lang = localStorage.getItem('lang') || 'fr';
let theme = localStorage.getItem('theme') || 'soft';
let practice = null, current = null, video = null, anatomy = null;
let homeTab = 'cours';                       // 'cours' (leçons + exercices + anatomie) | 'challenges'

const ICON = {
  play: '<svg class="ic" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  moon: '<svg class="ic" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  book: '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M4 5h13v14H4zM8 5v14"/></svg>',
};

/* ---------------- Thème & langue ---------------- */
function applyTheme(t) {
  theme = t; localStorage.setItem('theme', t);
  document.documentElement.dataset.theme = t;
  for (const b of qa('[data-theme-toggle]')) b.innerHTML = t === 'dark' ? ICON.sun : ICON.moon;
}
function toggleTheme() { applyTheme(theme === 'dark' ? 'soft' : 'dark'); }
function setLang(l) {
  lang = l; localStorage.setItem('lang', l);
  for (const b of qa('[data-lang]')) b.classList.toggle('on', b.dataset.lang === l);
  if (data) buildHome();                       // titres de l'arbre du parcours
  if (!current) return;
  if (current.kind === 'lesson') {
    $('rTitle').textContent = titleOf(current.item, 'lesson');
    renderReading();
  } else if (current.kind === 'exercise') {
    $('pTitle').textContent = titleOf(current.item, 'exercise');
    renderConsigne($('pConsigne'));
  }
  // kind 'anatomy' : contenu tiers, rien à re-traduire
}

/* Titre affiché : FR si la langue est FR et la traduction existe, sinon la source EN. */
function titleOf(item, kind) {
  return (lang === 'fr' && frTitle(kind, item.id)) || item.title;
}

/* ---------------- Vues ---------------- */
function show(view) {
  for (const v of ['home', 'practice', 'reading']) $(v).hidden = v !== view;
}

/* Charge les vidéos tuto de l'item courant et affiche/masque le bouton « Vidéo ». */
function mountVideos(kind, key) {
  const { ids, titles } = videosFor(kind, key);
  const has = video.setVideos(ids, titles, playlistFor);
  for (const b of qa('[data-video-toggle]')) b.hidden = !has;
  video.hide();
}

/* ---------------- Parcours (accueil) ----------------
   Deux onglets : « Cours » (le cursus + ses exercices + l'anatomie) et
   « Challenges » (les séries longues, qui se travaillent en parallèle du cursus
   et non à la suite — les isoler évite de les lire comme une étape du parcours). */
const isChallenge = lesson => lesson.part === 'challenges';

function setHomeTab(tab) { homeTab = tab; buildHome(); $('home').querySelector('.scroll').scrollTop = 0; }

function buildHome() {
  const inner = $('homeInner');
  inner.innerHTML = '';
  for (const b of qa('#homeTabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === homeTab);
  if (homeTab === 'challenges') return buildChallenges(inner);

  // hero reprise
  const resumeId = (prog.getResume() && prog.getResume().exId) || firstPlayableUnplayed();
  const rEx = resumeId ? exById.get(resumeId) : null;
  if (rEx) {
    const st = prog.exStats(rEx.id);
    const started = !!prog.exStats(rEx.id);
    const el = document.createElement('div');
    el.className = 'card resume';
    el.innerHTML = `
      <div class="body">
        <div class="row" style="gap:9px;margin-bottom:12px">
          <span class="badge live"><span class="dot"></span>Analyse live</span>
          <span class="sub">Leçon ${rEx.lesson} · ${rEx.title}</span>
        </div>
        <h2>${started ? 'Reprends' : 'Commence'} : ${titleOf(rEx, 'exercise')}</h2>
        <p>${MODES[rEx.name].hint}${st ? ` Moyenne actuelle ${st.avg}.` : ''}</p>
        <button class="btn primary" style="height:44px" id="resumeBtn">${ICON.play}${started ? 'Reprendre' : 'Commencer'} la session</button>
      </div>
      <div class="prev"><div class="grid" style="position:absolute;inset:0;background-image:linear-gradient(var(--paper-grid) 1px,transparent 1px),linear-gradient(90deg,var(--paper-grid) 1px,transparent 1px);background-size:32px 32px;opacity:.5"></div></div>`;
    inner.appendChild(el);
    el.querySelector('#resumeBtn').addEventListener('click', () => openItem(rEx, 'exercise'));
  }

  // parcours : leçons dans l'ordre, avec verrouillage progressif
  const lessons = data.lessons.filter(l => !isChallenge(l));
  const head = document.createElement('div');
  head.className = 'parcours-head';
  const doneCount = lessons.filter(l => prog.lessonDone(l)).length;
  head.innerHTML = `<h3>Ton parcours</h3><span>${doneCount} / ${lessons.length} terminées</span>`;
  inner.appendChild(head);

  let prevGate = true;
  for (const g of groupByPart(lessons)) {
    inner.appendChild(partHead(g));
    for (const lesson of g.lessons) {
      inner.appendChild(lessonBlock(lesson, prevGate));
      prevGate = prog.lessonGate(lesson);
    }
  }

  // Section tierce : anatomie humaine (Sinix Design), hors cursus Drawabox.
  if (anatomy && anatomy.topics && anatomy.topics.length) inner.appendChild(anatomySection());
}

/* Regroupe par partie en conservant l'ordre du JSON, qui est celui du site. */
function groupByPart(lessons) {
  const groups = [];
  for (const lesson of lessons) {
    let g = groups.find(x => x.part === lesson.part);
    if (!g) { g = { part: lesson.part, name: lesson.part_name, lessons: [] }; groups.push(g); }
    g.lessons.push(lesson);
  }
  return groups;
}

/* Onglet Challenges : les séries longues, débloquées d'office (elles ne suivent pas
   la progression linéaire du cursus — Drawabox les fait justement intercaler). */
function buildChallenges(inner) {
  const list = data.lessons.filter(isChallenge);
  const done = list.filter(l => prog.lessonDone(l)).length;

  const head = document.createElement('div');
  head.className = 'parcours-head';
  head.innerHTML = `<h3>Challenges et drills</h3><span>${done} / ${list.length} terminés</span>`;
  inner.appendChild(head);

  const intro = document.createElement('div');
  intro.className = 'parthead';
  intro.innerHTML = `<p>Des séries d'entraînement à intercaler entre les leçons, pas à enchaîner d'un bloc. Chacune se travaille sur plusieurs semaines en parallèle du cursus.</p>`;
  inner.appendChild(intro);

  for (const lesson of list) inner.appendChild(lessonBlock(lesson, true));
}

/* Une ligne d'exercice (utilisée pour les exercices d'une leçon et pour les warmups).
   La pastille de gauche est le marqueur « terminé » : c'est l'utilisateur qui le décide. */
function exerciseRow(ex) {
  const done = prog.isExerciseDone(ex.id);
  const st = prog.exStats(ex.id);
  const play = hasMode(ex.name);
  const row = document.createElement('div');
  row.className = 'card exrow' + (done ? ' dim' : play ? ' next' : ' dim');
  // Tous les exercices se pratiquent ; seuls certains ont l'analyse live en plus.
  // (On n'affiche pas le nombre d'images de la page : c'est un artefact du scrape,
  //  ça ne dit rien de l'exercice.)
  const meta = play ? (st ? `analyse live · moyenne ${st.avg} sur ${st.count} traits`
                          : `analyse live`)
                    : `dessin libre`;
  const action = `<button class="btn ${done ? 'ghost sm' : 'primary sm'}" data-open="ex">${done ? 'Rejouer' : ICON.play + 'Pratiquer'}</button>`;
  row.innerHTML =
    `<button class="donetog${done ? ' on' : ''}" data-done title="${done ? 'Marquer comme non terminé' : 'Marquer comme terminé'}">
       ${done ? `<svg viewBox="0 0 24 24">${ICON.check.match(/<path[^>]*>/)[0]}</svg>` : ''}
     </button>
     <div class="t"><div class="n">${titleOf(ex, 'exercise')}</div><div class="m">${meta}</div></div>${action}`;
  row.querySelector('[data-open]').addEventListener('click', () => openItem(ex, 'exercise'));
  row.querySelector('[data-done]').addEventListener('click', e => {
    e.stopPropagation();
    prog.toggleExerciseDone(ex.id);
    buildHome();
  });
  return row;
}

/* ---- Warmups : piocher au hasard dans les exercices des leçons 1-2 ---- */
const WARMUP_N = 3;
const warmupPicks = new Map(); // lessonId -> [exerciseId] (stable tant qu'on ne relance pas)

function pickWarmups(lessonId) {
  const pool = data.exercises.filter(e => String(e.lesson) === '1' || String(e.lesson) === '2');
  const picks = [];
  for (let i = 0; i < WARMUP_N && pool.length; i++) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  }
  warmupPicks.set(lessonId, picks);
  return picks;
}

function warmupBlock(lesson) {
  const wrap = document.createDocumentFragment();
  const ids = warmupPicks.get(lesson.id) || pickWarmups(lesson.id);

  const hd = document.createElement('div');
  hd.className = 'card exrow warmup';
  hd.innerHTML =
    `<span class="badge accent" style="flex:none"><span class="dot"></span>Échauffement</span>
     <div class="t"><div class="n">10-15 min avant de commencer</div>
       <div class="m">${WARMUP_N} exercices tirés au sort dans les leçons 1-2</div></div>
     <button class="btn ghost sm" data-reroll>Relancer le tirage</button>`;
  hd.querySelector('[data-reroll]').addEventListener('click', () => { pickWarmups(lesson.id); buildHome(); });
  wrap.appendChild(hd);

  for (const id of ids) {
    const ex = exById.get(id);
    if (ex) wrap.appendChild(exerciseRow(ex));
  }
  return wrap;
}

function partHead(g) {
  const el = document.createElement('div');
  el.className = 'parthead';
  const title = (lang === 'fr' && frTitle('part', g.part)) || g.name;
  const intro = lang === 'fr' ? frPartIntro(g.part) : null;
  const done = g.lessons.filter(l => prog.lessonDone(l)).length;
  el.innerHTML =
    `<div class="row" style="gap:10px">
       <h4>${title}</h4>
       <span class="badge">${g.lessons.length}</span>
       <span class="spacer"></span>
       <span class="mono" style="font-size:11.5px;color:var(--tx-lo)">${done} / ${g.lessons.length}</span>
     </div>` + (intro ? `<p>${intro}</p>` : '');
  return el;
}

/* ---- Anatomie humaine (Sinix Design) : contenu tiers, hors Drawabox ---- */
const anatomyDoneId = key => `anatomy:${key}`;

/* La vidéo tient lieu de cours : ici il n'y aura jamais de validateur, contrairement
   à FREE_MODE dont le libellé annonce une analyse « pas encore » disponible. */
const ANATOMY_MODE = { ...FREE_MODE, hint: 'Dessine en suivant la vidéo, à ton rythme.' };

/* Ouvre un sujet d'anatomie : canvas de dessin libre + vidéo flottante à côté, pour
   dessiner en suivant la démo. Pas de cours écrit ici : la vidéo EST le cours. */
async function openAnatomy(topic) {
  current = { item: topic, kind: 'anatomy' };
  show('practice');
  $('practice').classList.remove('consigne-open');
  $('pTitle').textContent = topic.title;
  $('pSub').textContent = `Anatomie — ${anatomy.author}`;
  $('stage').hidden = false;
  $('panel').hidden = false;
  $('btnConsigne').hidden = false;
  setDrawControls(ANATOMY_MODE);
  $('btnNewLabel').textContent = 'Effacer la page';
  renderAnatomyDoneBtn(topic);

  // Hors playlist Drawabox -> pas de list=.
  for (const b of qa('[data-video-toggle]')) b.hidden = false;
  video.setVideos([topic.id], { [topic.id]: `${topic.title} · Anatomie — ${anatomy.author}` }, () => null);
  video.show();

  $('pConsigne').innerHTML = renderMarkdown(
    `## ${topic.title}\n\nSuis la vidéo « Anatomy Quick Tips » de ${anatomy.author} et dessine en même temps sur le canvas.\n\n[Ouvrir la vidéo sur YouTube](https://youtu.be/${topic.id})`);

  if (practice) { practice.destroy(); practice = null; }
  practice = new Practice(topic, ANATOMY_MODE);
}

/* Bouton « Terminé » adapté à l'anatomie : bascule l'état « vu » du sujet. */
function renderAnatomyDoneBtn(topic) {
  const b = $('btnDone');
  const id = anatomyDoneId(topic.key);
  const done = prog.isExerciseDone(id);
  b.classList.toggle('primary', !done);
  b.innerHTML = done ? `<svg class="ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Vu`
                     : `Marquer comme vu`;
  b.onclick = () => { prog.toggleExerciseDone(id); renderAnatomyDoneBtn(topic); };
}

function anatomySection() {
  const frag = document.createDocumentFragment();
  const topics = anatomy.topics || [];
  const done = topics.filter(t => prog.isExerciseDone(anatomyDoneId(t.key))).length;

  const head = document.createElement('div');
  head.className = 'parthead';
  head.innerHTML =
    `<div class="row" style="gap:10px">
       <h4>${anatomy.title}</h4>
       <span class="badge">${topics.length}</span>
       <span class="spacer"></span>
       <span class="mono" style="font-size:11.5px;color:var(--tx-lo)">${done} / ${topics.length}</span>
     </div>
     <p>${anatomy.intro} <a href="${anatomy.playlist}" target="_blank" rel="noopener">Playlist ${anatomy.author} ↗</a></p>`;
  frag.appendChild(head);

  for (const topic of topics) {
    const d = prog.isExerciseDone(anatomyDoneId(topic.key));
    const row = document.createElement('div');
    row.className = 'card exrow' + (d ? ' dim' : '');
    row.innerHTML =
      `<button class="donetog${d ? ' on' : ''}" data-done title="${d ? 'Marquer comme non vu' : 'Marquer comme vu'}">
         ${d ? `<svg viewBox="0 0 24 24">${ICON.check.match(/<path[^>]*>/)[0]}</svg>` : ''}
       </button>
       <div class="t"><div class="n">${topic.title}</div><div class="m">${anatomy.author}${topic.duration ? ` · ${topic.duration}` : ''}</div></div>
       <button class="btn ${d ? 'ghost sm' : 'primary sm'}" data-play>${ICON.play}Regarder</button>`;
    row.querySelector('[data-play]').addEventListener('click', () => openAnatomy(topic));
    row.querySelector('[data-done]').addEventListener('click', e => {
      e.stopPropagation();
      prog.toggleExerciseDone(anatomyDoneId(topic.key));
      buildHome();
    });
    frag.appendChild(row);
  }
  return frag;
}

function firstPlayableUnplayed() {
  const exs = data.exercises.slice().sort((a, b) => a.lesson - b.lesson);
  const un = exs.find(e => hasMode(e.name) && !prog.isExerciseDone(e.id));
  return (un || exs.find(e => hasMode(e.name)) || {}).id;
}

function lessonBlock(lesson, unlocked) {
  const exs = (lesson.exercises || []).map(x => exById.get(x.id)).filter(Boolean);
  const complete = prog.lessonDone(lesson);          // toutes les pages vues
  const readN = prog.pagesReadCount(lesson.id);

  const wrap = document.createElement('div');
  wrap.className = 'lesson' + (complete ? '' : !unlocked ? ' locked' : ' cur');

  // Le statut vient de l'avancement réel, jamais du verrou : une leçon dont toutes les
  // pages sont lues s'affiche Terminée même si on y est arrivé hors de l'ordre suggéré.
  let icoCls, icoHtml, statusBadge;
  if (complete) {
    icoCls = 'done'; icoHtml = ICON.check;
    statusBadge = `<span class="badge tr"><span class="dot"></span>Terminée</span>`;
  } else if (unlocked || readN > 0) {
    icoCls = 'cur'; icoHtml = String(lesson.id).replace(/\D/g, '') || '•';
    statusBadge = `<span class="badge accent"><span class="dot"></span>En cours</span>`;
  } else {
    icoCls = 'lock'; icoHtml = ICON.lock; statusBadge = '';
  }

  wrap.innerHTML = `
    <div class="lesson-hd">
      <div class="lesson-ico ${icoCls}">${icoHtml}</div>
      <div class="t"><div class="row" style="gap:9px"><span class="name">${titleOf(lesson, 'lesson')}</span>${statusBadge}</div></div>
      <span class="mono" style="font-size:12px;color:var(--tx-lo)">${readN} / ${lesson.pages.length} pages</span>
    </div>`;

  if (!unlocked && !complete && readN === 0) {
    wrap.querySelector('.lesson-hd').insertAdjacentHTML('beforeend',
      `<span class="mono" style="font-size:11px;color:var(--tx-lo)">suggérée après la précédente</span>`);
  }

  const list = document.createElement('div');
  list.className = 'exlist';

  // D'abord la leçon (le cours), puis les exercices : on lit avant de pratiquer.
  const readRow = document.createElement('div');
  readRow.className = 'card exrow dim';
  readRow.innerHTML = `<span class="badge">${ICON.book}Lecture</span><div class="t"><div class="n">Lire la leçon</div><div class="m">${lesson.n_pages} pages${isTranslated('lesson', lesson.id) ? ' · FR' : ''}</div></div><button class="btn ghost sm" data-open="read">Ouvrir</button>`;
  readRow.querySelector('[data-open]').addEventListener('click', () => openItem(lesson, 'lesson'));
  list.appendChild(readRow);

  // exercices propres à la leçon
  for (const ex of exs) list.appendChild(exerciseRow(ex));

  // Leçons sans exercices dédiés (3 à 7) : Drawabox demande d'y piocher ses
  // échauffements dans les exercices des leçons 1-2. On les propose ici.
  // Pas pour les challenges : ce sont des séries au long cours, l'échauffement s'y
  // choisit à chaque séance, pas une fois pour toute la série.
  if (!exs.length && lesson.id !== '0' && !isChallenge(lesson)) list.appendChild(warmupBlock(lesson));

  wrap.appendChild(list);
  return wrap;
}

/* ---------------- Ouverture d'un item ---------------- */
async function openItem(item, kind) {
  current = { item, kind };
  if (kind === 'lesson') return openReading(item);
  return openPractice(item);
}

/* ---------------- Pratique ----------------
   consigneHtml : contenu déjà rendu à réutiliser tel quel (dessin lancé depuis une
   leçon — inutile de refaire la traduction et le rendu markdown de la page). */
async function openPractice(ex, consigneHtml) {
  show('practice');
  $('practice').classList.remove('consigne-open');
  $('pTitle').textContent = titleOf(ex, 'exercise');
  $('pSub').textContent = ex.sub || (ex.lesson ? `Leçon ${ex.lesson} · ${ex.title}` : 'Sans consigne ni notation');
  // Tous les exercices sont praticables : ceux sans validateur ouvrent un canvas libre.
  const mode = modeFor(ex.name);
  $('stage').hidden = false;
  $('panel').hidden = false;
  $('btnConsigne').hidden = false;
  setDrawControls(mode);
  const bare = mode.free || mode.noTarget;
  $('btnNewLabel').textContent = bare ? 'Effacer la page' : 'Nouvelle cible';
  renderDoneBtn(ex);
  mountVideos('exercise', ex.name);
  video.show();

  if (consigneHtml != null) { $('pConsigne').innerHTML = consigneHtml; $('pConsigne').scrollTop = 0; }
  else await renderConsigne($('pConsigne'));

  if (practice) { practice.destroy(); practice = null; }
  practice = new Practice(ex, mode);
}

/* Barre d'outils du canvas. Les réglages de brosse (type, style, taille, opacité,
   gomme) ne concernent que le dessin libre : en exercice noté, le trait doit rester
   comparable d'une session à l'autre pour que le score ait un sens. Les contrôles de
   cible, eux, disparaissent dès qu'il n'y a pas de cible. */
function setDrawControls(mode) {
  const free = !!mode.free;
  const bare = free || mode.noTarget;
  $('lenSeg').hidden = !!bare;
  $('btnReset').hidden = !!bare;
  for (const id of ['brushSeg', 'penWidthWrap', 'penOpacityWrap', 'btnEraser']) {
    $(id).hidden = !free;
  }
  // Aucun score hors exercice noté : on purge le panneau au lieu de compter sur
  // l'état laissé par l'écran précédent.
  if (free) {
    $('panelResult').hidden = true;
    $('panelFoot').hidden = true;
    $('chipTraits').hidden = true;
    $('chipFray').hidden = true;
  }
}

/* Bouton « Terminé » de la barre de pratique : reflète et bascule l'état déclaré. */
function renderDoneBtn(ex) {
  const b = $('btnDone');
  const done = prog.isExerciseDone(ex.id);
  b.classList.toggle('primary', !done);
  b.innerHTML = (done ? `<svg class="ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Terminé`
                      : `Marquer terminé`);
  b.onclick = () => { prog.toggleExerciseDone(ex.id); renderDoneBtn(ex); };
}

async function renderConsigne(el) {
  const { item, kind } = current;
  const en = kind === 'exercise' ? (item.markdown || '') : lessonMarkdown(item);
  let md = en, note = '';
  if (lang === 'fr') {
    const fr = await fetchTranslation(kind, item.id);
    if (fr) md = fr; else note = `<div class="fb warn" style="margin-bottom:12px"><span class="fbi">${infoSvg()}</span><p>Traduction française à venir — affichage en anglais.</p></div>`;
  }
  el.innerHTML = note + renderMarkdown(md);
  el.scrollTop = 0;
}
function infoSvg() { return '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>'; }

/* Réglages de brosse, partagés par toutes les sessions de dessin libre.
   État au niveau module (et non dans Practice) : les boutons de la barre d'outils
   sont des éléments DOM permanents, les rebrancher à chaque ouverture d'exercice
   empilerait un listener de plus à chaque fois, tous pointant vers des instances
   de Practice déjà détruites. */
const tool = { brush: 'ink', width: 3.5, opacity: 1, eraser: false };

const ERASE_RADIUS = 14;   // px : rayon de capture de la gomme autour du curseur

/* Un trait est effacé dès qu'un de ses points passe sous la gomme. On teste les
   points bruts plutôt que la géométrie du trait rendu : c'est suffisant à cette
   densité d'échantillonnage et ça reste indépendant de la brosse utilisée. */
function eraseAt(strokes, x, y, r = ERASE_RADIUS) {
  const r2 = r * r;
  let hit = false;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const pts = strokes[i].pts;
    for (const p of pts) {
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy <= r2) { strokes.splice(i, 1); hit = true; break; }
    }
  }
  return hit;
}

class Practice {
  constructor(ex, mode) {
    this.ex = ex; this.mode = mode;
    this.canvas = $('c');
    this.renderer = new CanvasRenderer(this.canvas);
    this.strokes = [];
    this.target = null;
    this.pipManager = mode.free ? new PipManager($('stage')) : null;
    this.capture = new StrokeCapture(this.canvas, {
      onStroke: pts => this.onStroke(pts),
      onLive: pts => this.onLive(pts),
    });
    this._resize = () => { this.renderer.resize(); if (!this.target) this.newTarget(); this.draw(); };
    window.addEventListener('resize', this._resize);
    this.renderer.resize();
    this.newTarget();
    $('emptyHint').textContent = mode.hint;
    $('freeHint').textContent = mode.hint;
    $('chipHint').textContent = mode.hint;
    this.canvas.classList.toggle('erasing', mode.free && tool.eraser);
  }
  destroy() {
    window.removeEventListener('resize', this._resize);
    this.canvas.classList.remove('erasing');
    if (this.pipManager) this.pipManager.clear();
  }
  len() { return parseFloat($('lenSeg').querySelector('.on').dataset.len); }

  newTarget() {
    this.target = this.mode.makeTarget(this.renderer.w, this.renderer.h, this.len());
    this.strokes = [];
    $('panelFree').hidden = !this.mode.free;
    $('panelEmpty').hidden = !!this.mode.free;
    $('panelResult').hidden = true;
    $('panelFoot').hidden = true;
    this.draw(); this.updateChips();
  }

  undo() { this.strokes.pop(); this.draw(); this.updateChips(); }

  /* Gomme : on efface au fil du geste plutôt qu'au relâché, pour un retour immédiat. */
  get erasing() { return this.mode.free && tool.eraser; }

  onLive(pts) {
    if (this.erasing) {
      const p = pts[pts.length - 1];
      if (eraseAt(this.strokes, p.x, p.y)) { this.draw(); this.updateChips(); }
      return;
    }
    this.draw(pts);
  }

  onStroke(pts) {
    if (this.erasing) return;                 // le geste a déjà été consommé par onLive
    if (this.mode.free) {                     // pas d'analyse ici : on encre, c'est tout
      // Fige les réglages au moment du tracé : changer de brosse ensuite ne doit pas
      // repeindre ce qui est déjà sur la page.
      this.strokes.push({ pts, tool: { ...tool } });
      this.updateChips(); this.draw();
      return;
    }
    const res = this.mode.validate(pts, this.target);
    if (!res) return;
    const s100 = Math.round(res.score * 100);
    this.strokes.push({ pts, score: res.score, s100, metrics: res.metrics });
    prog.recordScore(this.ex.id, s100);
    prog.setResume(this.ex.id, this.strokes.length);
    this.showResult(res);
    this.updateChips();
    this.draw();
  }

  /* En exercice noté, le trait est rendu avec des réglages fixes : sa lisibilité ne
     doit pas dépendre d'un choix de brosse, et le score se lit dans la couleur. */
  draw(live) {
    const r = this.renderer;
    const free = this.mode.free;
    r.clear();
    if (this.target) r.target(this.target);
    for (const st of this.strokes) {
      const t = st.tool;                      // absent en exercice noté -> rendu fixe
      if (t) r.stroke(st.pts, INK_FREE, t.width, t.brush, t.opacity);
      else r.stroke(st.pts, scoreColor(st.score), 3.2, 'ink', 1);
    }
    if (live) {
      if (free) r.stroke(live, '#6d6659', tool.width, tool.brush, tool.opacity * .8);
      else r.stroke(live, '#6d6659', 2.4, 'ink', 1);
    }
  }

  showResult(res) {
    $('panelEmpty').hidden = true; $('panelResult').hidden = false; $('panelFoot').hidden = false;
    const m = res.metrics, s100 = Math.round(res.score * 100), b = scoreBand(res.score);
    const labels = { good: 'Bon', mid: 'Moyen', bad: 'À revoir' };

    $('scoreHd').className = 'score-hd q-' + b;
    $('scoreLabel').textContent = `Score du trait ${this.strokes.length}`;
    $('scoreNum').textContent = s100;
    const badge = $('scoreBadge'); badge.className = 'badge ' + b; badge.querySelector('span:last-child').textContent = labels[b];
    $('scoreMeta').textContent = `Trait ${this.strokes.length} · ${m.duration} ms`;
    const bar = $('scoreBar'); bar.className = 'scorebar q-' + b; bar.querySelector('i').style.width = s100 + '%';

    $('qualities').innerHTML = this.mode.qualities(m).map(qRow).join('');
    $('detail').innerHTML = this.mode.detailRows(m).map(detailRow).join('');
    $('feedback').innerHTML = res.feedback.map(f => fbCard(f)).join('');
  }

  updateChips() {
    const n = this.strokes.length;

    if (this.mode.free) {                     // ni score, ni pastilles, ni décompte
      $('chipTraits').hidden = true;
      $('chipFray').hidden = true;
      return;
    }

    const dotCls = { good: 'g', mid: 'm', bad: 'r' };
    const dots = Array.from({ length: 8 }, (_, i) => {
      const st = this.strokes[i];
      return `<b class="${st ? dotCls[scoreBand(st.score)] : ''}"></b>`;
    }).join('');
    $('chipTraits').hidden = true;

    if (this.mode.session === 'fraying') {
      const fr = this.mode.fraying(this.strokes, this.target);
      const map = { pending: ['', 'en attente'], tight: ['g', 'extrémités serrées'], one: ['g', 'un seul bout · normal'], both: ['r', 'des deux côtés'] };
      const [c, txt] = map[fr.verdict];
      $('chipFray').hidden = false;
      $('chipFray').innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--${c === 'r' ? 'bad' : c === 'g' ? 'good' : 'tx-lo'});display:block"></span>Fraying · ${txt}`;
    } else $('chipFray').hidden = true;

    // footer session
    if (n) {
      const avg = Math.round(this.strokes.reduce((s, x) => s + x.s100, 0) / n);
      const best = Math.max(...this.strokes.map(x => x.s100));
      $('sessionStat').innerHTML = `Moyenne <b style="color:var(--tx-hi)">${avg}</b> · meilleur ${best}`;
      $('sessionDots').innerHTML = dots;
    }
  }
}

function qRow(q) {
  return `<div class="qrow"><div class="qh"><span class="l">${q.label}</span><span class="v mono">${q.value}</span></div>
    <div class="qbar q-${q.band}"><i style="width:${q.value}%"></i></div></div>`;
}
function detailRow(r) {
  const cls = r.q == null ? '' : r.q > 0.7 ? 'q-good' : r.q > 0.45 ? 'q-mid' : 'q-bad';
  const bar = r.q == null ? '' : `<div class="qbar ${cls}"><i style="width:${Math.round(r.q * 100)}%"></i></div>`;
  return `<div class="metric"><div class="mt"><span class="ml">${r.label}</span><span class="mv">${r.value}</span></div>${bar}</div>`;
}
function fbCard(f) {
  const icons = {
    good: '<path d="M20 6 9 17l-5-5"/>',
    warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    bad: '<path d="M18 6 6 18M6 6l12 12"/>',
    tip: '<path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/>',
  };
  const t = f.t === 'good' ? 'good' : f.t === 'bad' ? 'bad' : f.t === 'tip' ? 'tip' : 'warn';
  return `<div class="fb ${t}"><span class="fbi"><svg viewBox="0 0 24 24">${icons[t]}</svg></span><p>${f.m}</p></div>`;
}

/* ---------------- Lecture ---------------- */
async function openReading(lesson) {
  show('reading');
  current.page = 0;
  $('rTitle').textContent = titleOf(lesson, 'lesson');
  mountVideos('lesson', lesson.id);
  buildToc();
  await renderReading();
  buildHome(); // maj complétion/déverrouillage
}

/* Remplace chaque vignette morte par son vrai lecteur, EXACTEMENT à sa place dans le
   texte (le site rendait ces images enveloppées d'un lien youtu.be que le scrape a perdu). */
function swapVideoThumbs(root) {
  for (const img of [...root.querySelectorAll('img')]) {
    const id = videoForThumb(img.getAttribute('src'));
    if (!id) continue;
    const fig = document.createElement('figure');
    fig.className = 'lvideo';
    const title = videoTitle(id);
    // playlistFor() renvoie null hors playlist : sinon YouTube jouerait la playlist
    // depuis le début au lieu de la vidéo demandée.
    fig.innerHTML =
      `<iframe src="${embedUrl(id, playlistFor(id))}" allow="${IFRAME_ALLOW}" allowfullscreen loading="lazy"></iframe>` +
      (title ? `<figcaption>${title}</figcaption>` : '');
    img.replaceWith(fig);
  }
}

/* Sommaire : une entrée par page, libellée par sa section. */
function buildToc() {
  const lesson = current.item, toc = $('rToc');
  toc.hidden = lesson.pages.length < 2;   // inutile pour les challenges d'une page
  if (toc.hidden) return;
  toc.innerHTML = `<div class="toch">${lesson.pages.length} pages</div>`;
  lesson.pages.forEach((p, i) => {
    const b = document.createElement('button');
    const read = prog.isPageRead(lesson.id, p.page);
    b.className = read ? 'read' : '';
    const label = (lang === 'fr' && frSection(lesson.id, p.page)) || p.section || ('Page ' + p.page);
    b.innerHTML = `<span class="num">${read ? '✓' : p.page}</span><span>${label}</span>`;
    b.addEventListener('click', () => goToPage(i));
    toc.appendChild(b);
  });
}

function goToPage(i) {
  const lesson = current.item;
  current.page = Math.max(0, Math.min(lesson.pages.length - 1, i));
  renderReading();
  $('rScroll').scrollTop = 0;
}

async function renderReading() {
  const lesson = current.item;
  const i = current.page || 0;
  const p = lesson.pages[i];

  let md = p.markdown || '', untranslated = false;
  if (lang === 'fr') {
    const fr = await fetchLessonPage(lesson.id, p.page);
    if (fr) md = fr; else untranslated = true;
  }
  $('rBanner').hidden = !untranslated;
  prog.markPageRead(lesson.id, p.page);   // une leçon est terminée quand toutes ses pages ont été vues
  buildToc();                             // reflète la page qu'on vient de lire (✓)

  // Le markdown scrapé répète déjà la section en `## ...` : on la retire pour ne pas
  // dupliquer le titre de page.
  const lines = md.split('\n');
  if (lines[0] && lines[0].trim().startsWith('## ')) lines.shift();
  const body = lines.join('\n').replace(/^\s+/, '');

  const section = (lang === 'fr' && frSection(lesson.id, p.page)) || p.section;
  $('rArticle').innerHTML = (section ? `<h1>${section}</h1>` : '') + renderMarkdown(body);
  swapVideoThumbs($('rArticle'));

  // état actif du sommaire
  const btns = $('rToc').querySelectorAll('button');
  btns.forEach((b, k) => b.classList.toggle('on', k === i));

  // précédent / suivant
  const last = lesson.pages.length - 1;
  $('rNav').innerHTML =
    (i > 0 ? `<button class="btn" data-page="${i - 1}"><svg class="ic" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Précédent</button>` : '') +
    `<span class="spacer"></span><span class="pos">${i + 1} / ${lesson.pages.length}</span><span class="spacer"></span>` +
    (i < last ? `<button class="btn primary" data-page="${i + 1}">Suivant<svg class="ic" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>` : '');
  $('rNav').querySelectorAll('[data-page]').forEach(b =>
    b.addEventListener('click', () => goToPage(+b.dataset.page)));
}

/* Dessin lancé depuis une leçon : page à rouvrir au retour (sinon on retombe sur
   l'accueil et on perd sa place au milieu d'une leçon de 12 pages). */
let drawReturn = null;

/* Canvas de dessin libre adossé à la page de leçon en cours, consultable via le
   bouton « Consigne ». */
function openLessonDraw() {
  const lesson = current.item;
  drawReturn = { lesson, page: current.page || 0 };
  const ex = {
    id: 'lesson-draw', lesson: 0, name: 'freedraw', url: '#', file: 'free',
    title: 'Dessin', sub: titleOf(lesson, 'lesson'),
    n_images: 0, images: [], markdown: '',
  };
  current = { item: ex, kind: 'exercise' };
  openPractice(ex, $('rArticle').innerHTML);
}

/* ---------------- Retour ---------------- */
function back() {
  if (practice) { practice.destroy(); practice = null; }
  if (video) video.hide();          // ferme aussi les duplicatas
  if (drawReturn) {                 // on revient à la leçon, sur la page quittée
    const { lesson, page } = drawReturn;
    drawReturn = null;
    current = { item: lesson, kind: 'lesson', page };
    show('reading');
    $('rTitle').textContent = titleOf(lesson, 'lesson');
    mountVideos('lesson', lesson.id);
    buildToc();
    renderReading();
    return;
  }
  current = null;
  buildHome();
  show('home');
}

/* ---------------- Bootstrap ---------------- */
async function main() {
  applyTheme(theme);
  for (const b of qa('[data-lang]')) b.classList.toggle('on', b.dataset.lang === lang);

  video = new VideoPanel(document.body);

  $('btnDrawFree').addEventListener('click', openFreeDraw);
  $('btnLessonDraw').addEventListener('click', openLessonDraw);

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-theme-toggle],[data-lang],[data-back],[data-video-toggle]');
    if (!t) return;
    if (t.hasAttribute('data-theme-toggle')) toggleTheme();
    else if (t.hasAttribute('data-lang')) setLang(t.dataset.lang);
    else if (t.hasAttribute('data-back')) back();
    else if (t.hasAttribute('data-video-toggle')) video.toggle();
  });

  $('lenSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-len]'); if (!b) return;
    for (const x of $('lenSeg').children) x.classList.toggle('on', x === b);
    practice && practice.newTarget();
  });
  $('btnNew').addEventListener('click', () => practice && practice.newTarget());
  $('btnReset').addEventListener('click', () => practice && practice.newTarget());
  $('btnUndo').addEventListener('click', () => practice && practice.undo());

  $('homeTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b && b.dataset.tab !== homeTab) setHomeTab(b.dataset.tab);
  });

  // --- barre d'outils de dessin (câblée une seule fois, cf. `tool`) ---
  // Ces réglages ne s'appliquent qu'aux traits à venir : chaque trait fige les siens
  // au moment du tracé (cf. onStroke), donc rien à redessiner ici.
  $('brushSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-brush]'); if (!b) return;
    for (const x of $('brushSeg').children) x.classList.toggle('on', x === b);
    tool.brush = b.dataset.brush;
  });
  $('penWidth').addEventListener('input', e => {
    tool.width = parseFloat(e.target.value);
    $('penWidthVal').textContent = tool.width.toFixed(1);
  });
  $('penOpacity').addEventListener('input', e => {
    tool.opacity = parseFloat(e.target.value);
    $('penOpacityVal').textContent = Math.round(tool.opacity * 100) + '%';
  });
  $('btnEraser').addEventListener('click', () => {
    tool.eraser = !tool.eraser;
    $('btnEraser').classList.toggle('on', tool.eraser);
    $('c').classList.toggle('erasing', tool.eraser);
  });
  $('btnConsigne').addEventListener('click', () => $('practice').classList.toggle('consigne-open'));
  $('btnConsigneClose').addEventListener('click', () => $('practice').classList.remove('consigne-open'));
  $('detailToggle').addEventListener('click', () => {
    const open = $('detail').hidden;
    $('detail').hidden = !open;
    $('detailToggle').setAttribute('aria-expanded', String(open));
    $('detailToggle').querySelector('span').textContent = open ? 'Masquer le détail' : 'Voir le détail des mesures';
  });

  try {
    data = await loadContent();
    await loadManifest();
    await loadVideos();
    anatomy = await loadAnatomy();
    for (const e of data.exercises) { exById.set(e.id, e); if (hasMode(e.name)) playableIds.add(e.id); }
    prog.touchStreak();
    buildHome();
  } catch (e) {
    $('homeInner').innerHTML = `<div class="err">Impossible de charger drawabox.json.<br>
      Lance un serveur local (voir README) — file:// bloque fetch.<br><code>${e.message}</code></div>`;
  }
}

function openFreeDraw() {
  const freeDrawExercise = {
    id: 'free-draw',
    lesson: 0,
    name: 'freedraw',
    title: 'Dessin libre',
    url: '#',
    file: 'free',
    n_images: 0,
    images: [],
    markdown: '# Dessin libre\n\nPage blanche, sans consigne ni notation.\n\n- **Photo / Vidéo** (en haut à droite du canvas) ajoutent une référence déplaçable et redimensionnable.\n- La barre du haut règle la brosse, le style de trait, la taille et l\'opacité.\n- La **gomme** efface un trait entier au passage.'
  };
  current = { item: freeDrawExercise, kind: 'exercise' };
  openPractice(freeDrawExercise);
}

main();
