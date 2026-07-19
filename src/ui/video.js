/* Lecteur vidéo tuto : fenêtres flottantes au-dessus du canvas, déplaçables et
   redimensionnables. On peut dupliquer l'affichage courant pour garder plusieurs
   vues côte à côte (ex. une vue d'ensemble + un détail mis en pause).

   Le détachement en Picture-in-Picture a été retiré : la fenêtre PiP du système
   n'est pas redimensionnable librement et sortait la vidéo du contexte de dessin. */

const PLAYER_BASE = 'https://www.youtube-nocookie.com/embed/';

export function embedUrl(videoId, playlist, autoplay) {
  const p = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (playlist) p.set('list', playlist);
  if (autoplay) p.set('autoplay', '1');
  return `${PLAYER_BASE}${videoId}?${p}`;
}

export const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; fullscreen';

const MIN_W = 280;
const GRIP_SVG = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
/* Libellé explicite plutôt qu'une icône seule : deux rectangles imbriqués se lisent
   comme un bouton Picture-in-Picture, ce que ce bouton n'est justement pas. */
const DUP_SVG = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

export class VideoPanel {
  constructor(host) {
    this.host = host;
    this.ids = [];
    this.idx = 0;
    this.playlistFor = () => null;
    this.titles = {};
    this.clones = [];

    const el = this._shell({ nav: true });
    host.appendChild(el);
    this.el = el;
    this.iframe = el.querySelector('iframe');

    el.querySelector('[data-close]').addEventListener('click', () => this.hide());
    el.querySelector('[data-dup]').addEventListener('click', () => this.duplicate());
    el.querySelector('[data-prev]').addEventListener('click', () => this.step(-1));
    el.querySelector('[data-next]').addEventListener('click', () => this.step(1));
    this._drag(el, el.querySelector('.vhead'));
    this._resize(el, el.querySelector('.vresize'));
  }

  /* Squelette commun fenêtre principale / duplicata. */
  _shell({ nav }) {
    const el = document.createElement('div');
    el.className = 'vpanel';
    el.hidden = true;
    el.innerHTML = `
      <div class="vhead">
        <span class="vgrip" title="Déplacer">${GRIP_SVG}</span>
        <span class="vtitle"></span>
        ${nav ? `<span class="vnav" hidden><button class="vbtn" data-prev title="Précédente">‹</button><span class="vcount mono"></span><button class="vbtn" data-next title="Suivante">›</button></span>` : ''}
        <button class="vbtn wide" data-dup title="Ouvrir une seconde vue de cette vidéo">${DUP_SVG}<span>Dupliquer</span></button>
        <button class="vbtn" data-close title="Fermer">✕</button>
      </div>
      <div class="vbody"><iframe allow="${IFRAME_ALLOW}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <span class="vresize" title="Redimensionner"></span>`;
    return el;
  }

  /* ids: string[] de videoId ; titles: map id->titre ;
     playlistFor: id -> playlist string | null (n'ajoute list= QUE si la vidéo y est,
     sinon YouTube ignore la vidéo demandée et joue la playlist depuis le début). */
  setVideos(ids, titles, playlistFor) {
    this.ids = ids || [];
    this.playlistFor = playlistFor || (() => null);
    this.titles = titles || {};
    this.idx = 0;
    this.closeClones();
    this.el.querySelector('.vnav').hidden = this.ids.length < 2;
    if (this.el.hidden) this.iframe.removeAttribute('src'); // chargement paresseux
    else this._load();
    return this.ids.length > 0;
  }

  get currentId() { return this.ids[this.idx]; }

  _load() {
    const id = this.currentId;
    if (!id) return;
    this.iframe.src = embedUrl(id, this.playlistFor(id));
    this.el.querySelector('.vtitle').textContent = this.titles[id] || 'Vidéo';
    this.el.querySelector('.vcount').textContent = `${this.idx + 1}/${this.ids.length}`;
  }

  step(d) {
    if (!this.ids.length) return;
    this.idx = (this.idx + d + this.ids.length) % this.ids.length;
    this._load();
  }

  /* ---- Duplication ----
     Chaque duplicata est une fenêtre autonome : on y recharge un iframe neuf sur la
     vidéo courante. Les deux lectures sont indépendantes (on peut en mettre une en
     pause sur une pose et laisser l'autre tourner). */
  duplicate() {
    if (!this.currentId) return;
    const el = this._shell({ nav: false });
    this.host.appendChild(el);
    el.hidden = false;

    // Cascade vers le haut-gauche : la fenêtre source est ancrée en bas à droite,
    // c'est de ce côté-là qu'il reste de la place (décaler vers le bas-droite se
    // ferait écraser par le clamp et empilerait les copies au même endroit).
    const n = this.clones.length + 1;
    const src = this.el.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
    const off = n * 30;
    el.style.width = src.width + 'px';
    el.style.left = Math.max(8, Math.min(hr.width - src.width - 8, src.left - hr.left - off)) + 'px';
    el.style.top = Math.max(8, src.top - hr.top - off) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';

    el.querySelector('.vtitle').textContent = this.titles[this.currentId] || 'Vidéo';
    void el.offsetHeight;                                   // cf. show() : évite l'iframe 0x0
    el.querySelector('iframe').src = embedUrl(this.currentId, this.playlistFor(this.currentId));

    el.querySelector('[data-close]').addEventListener('click', () => this._removeClone(el));
    el.querySelector('[data-dup]').addEventListener('click', () => this.duplicate());
    this._drag(el, el.querySelector('.vhead'));
    this._resize(el, el.querySelector('.vresize'));

    this.clones.push(el);
    return el;
  }

  _removeClone(el) {
    const i = this.clones.indexOf(el);
    if (i !== -1) this.clones.splice(i, 1);
    el.remove();
  }

  closeClones() { for (const el of this.clones.slice()) this._removeClone(el); }

  /* On n'affecte le src qu'une fois le panneau affiché ET sa mise en page calculée :
     un iframe YouTube qui démarre dans un conteneur 0x0 (encore `hidden` au moment du
     chargement) se croit trop petit, bascule en présentation « regarder sur YouTube »
     et redirige vers youtube.com au clic sur play au lieu de lire inline.
     La lecture de offsetHeight force un reflow synchrone : l'iframe a ses dimensions
     finales avant que le player ne démarre. (Ne pas remplacer par un rAF : il est
     suspendu quand l'onglet est en arrière-plan, et le src ne serait jamais posé.) */
  show() {
    if (!this.ids.length) return;
    this.el.hidden = false;
    if (!this.iframe.getAttribute('src')) {
      void this.el.offsetHeight;
      this._load();
    }
  }
  hide() {
    this.el.hidden = true;
    this.iframe.removeAttribute('src');
    this.closeClones();
  }
  toggle() { this.el.hidden ? this.show() : this.hide(); }
  get visible() { return !this.el.hidden; }

  destroy() { this.closeClones(); this.el.remove(); }

  /* ---- déplacement ---- */
  _drag(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('.vbtn')) return;
      on = true; handle.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
      ox = r.left - hr.left; oy = r.top - hr.top;
      sx = e.clientX; sy = e.clientY;
      el.style.left = ox + 'px'; el.style.top = oy + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      e.preventDefault();
    });
    handle.addEventListener('pointermove', e => {
      if (!on) return;
      const hr = this.host.getBoundingClientRect(), r = el.getBoundingClientRect();
      el.style.left = Math.max(0, Math.min(hr.width - r.width, ox + e.clientX - sx)) + 'px';
      el.style.top = Math.max(0, Math.min(hr.height - r.height, oy + e.clientY - sy)) + 'px';
    });
    const end = () => { on = false; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /* ---- redimensionnement ----
     On ne pilote que la largeur : `.vbody` porte un aspect-ratio 16/9, la hauteur
     suit donc toute seule et la vidéo ne peut jamais être déformée. */
  _resize(el, handle) {
    let sx = 0, ow = 0, left = 0, on = false;
    handle.addEventListener('pointerdown', e => {
      on = true; handle.setPointerCapture(e.pointerId);
      // La fenêtre est ancrée à droite au départ : on la fige sur son bord gauche le
      // temps du geste, sinon élargir la pousserait vers la gauche au lieu de la
      // faire grandir vers la droite (et la borne de largeur serait vite atteinte).
      const r = el.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
      left = r.left - hr.left;
      el.style.left = left + 'px'; el.style.top = (r.top - hr.top) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      sx = e.clientX; ow = r.width;
      e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('pointermove', e => {
      if (!on) return;
      const hw = this.host.getBoundingClientRect().width;
      const w = Math.round(Math.max(MIN_W, Math.min(hw - 16, ow + e.clientX - sx)));
      // La fenêtre part collée au bord droit : borner la largeur à l'espace restant à
      // sa droite la bloquerait au premier pixel. On la laisse donc glisser vers la
      // gauche au fur et à mesure qu'elle grandit, jusqu'à occuper toute la largeur.
      el.style.width = w + 'px';
      el.style.left = Math.max(8, Math.min(left, hw - 8 - w)) + 'px';
    });
    const end = () => { on = false; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
