/* Gestionnaire de fenêtres Picture-in-Picture avancé :
   - Photos (upload ou URL)
   - Vidéos (YouTube ou upload)
   - Duplication / suppression
   - Drag & resize */

export class PipManager {
  constructor(host) {
    this.host = host;
    this.pips = [];
    this.nextId = 1;
    this.windowOffset = 0;

    const container = document.createElement('div');
    container.className = 'pip-container';
    container.id = 'pipContainer';
    host.appendChild(container);
    this.container = container;

    this._createControlPanel();
  }

  _createControlPanel() {
    const ctrl = document.createElement('div');
    ctrl.className = 'pip-control';
    ctrl.innerHTML = `
      <button class="pip-btn" id="pipAddPhoto" title="Ajouter une photo">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m3 13 5-5 9 9v2H5z"/></svg>
        Photo
      </button>
      <button class="pip-btn" id="pipAddVideo" title="Ajouter une vidéo YouTube">
        <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 15v4M17 15v4M7 19h10M9 3h6M9 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2"/></svg>
        Vidéo
      </button>
      <input type="file" id="pipPhotoInput" hidden accept="image/*">
      <input type="text" id="pipVideoInput" hidden placeholder="URL YouTube ou ID vidéo">
    `;
    this.host.insertBefore(ctrl, this.host.firstChild);

    const photoBtn = ctrl.querySelector('#pipAddPhoto');
    const videoBtn = ctrl.querySelector('#pipAddVideo');
    const photoInput = ctrl.querySelector('#pipPhotoInput');
    const videoInput = ctrl.querySelector('#pipVideoInput');

    photoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        const url = URL.createObjectURL(e.target.files[0]);
        this.addPhoto(url, e.target.files[0].name);
      }
    });

    videoBtn.addEventListener('click', () => {
      const url = prompt('Colle une URL YouTube ou un ID vidéo :');
      if (url) this.addVideo(url);
    });
  }

  addPhoto(url, name = 'Photo') {
    const id = this.nextId++;
    const pip = {
      id,
      type: 'photo',
      url,
      name,
      el: null,
    };

    const el = document.createElement('div');
    el.className = 'pip-window';
    el.dataset.id = id;
    el.innerHTML = `
      <div class="pip-header">
        <span class="pip-title">${name}</span>
        <div class="pip-actions">
          <button class="pip-dup" title="Dupliquer">⬚</button>
          <button class="pip-close" title="Fermer">✕</button>
        </div>
      </div>
      <div class="pip-body">
        <img src="${url}" alt="${name}" style="width:100%;height:100%;object-fit:contain">
      </div>
    `;

    this.container.appendChild(el);
    pip.el = el;

    // Décaler la position pour éviter la superposition
    const offset = this.windowOffset * 30;
    el.style.right = (16 + offset) + 'px';
    el.style.bottom = (16 + offset) + 'px';
    this.windowOffset = (this.windowOffset + 1) % 5; // max 5 décalages

    el.querySelector('.pip-dup').addEventListener('click', () => this.addPhoto(url, name + ' (copie)'));
    el.querySelector('.pip-close').addEventListener('click', () => this.removePip(id));
    this._makeResizable(el);
    this._makeDraggable(el);

    this.pips.push(pip);
    return pip;
  }

  addVideo(input) {
    // Extraire l'ID YouTube
    let id = input;
    if (input.includes('youtube.com')) {
      const u = new URL(input);
      id = u.searchParams.get('v');
    } else if (input.includes('youtu.be')) {
      id = input.split('/').pop().split('?')[0];
    }

    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
      alert('ID YouTube invalide');
      return;
    }

    const pipId = this.nextId++;
    const pip = {
      id: pipId,
      type: 'video',
      videoId: id,
      name: 'Vidéo YouTube',
      el: null,
    };

    const el = document.createElement('div');
    el.className = 'pip-window';
    el.dataset.id = pipId;
    el.innerHTML = `
      <div class="pip-header">
        <span class="pip-title">Vidéo YouTube</span>
        <div class="pip-actions">
          <button class="pip-dup" title="Dupliquer">⬚</button>
          <button class="pip-close" title="Fermer">✕</button>
        </div>
      </div>
      <div class="pip-body">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowfullscreen
          style="width:100%;height:100%;border:0">
        </iframe>
      </div>
    `;

    this.container.appendChild(el);
    pip.el = el;

    // Décaler la position pour éviter la superposition
    const offset = this.windowOffset * 30;
    el.style.right = (16 + offset) + 'px';
    el.style.bottom = (16 + offset) + 'px';
    this.windowOffset = (this.windowOffset + 1) % 5; // max 5 décalages

    el.querySelector('.pip-dup').addEventListener('click', () => this.addVideo(id));
    el.querySelector('.pip-close').addEventListener('click', () => this.removePip(pipId));
    this._makeResizable(el);
    this._makeDraggable(el);

    this.pips.push(pip);
    return pip;
  }

  removePip(id) {
    const idx = this.pips.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.pips[idx].el?.remove();
      this.pips.splice(idx, 1);
    }
  }

  _makeDraggable(el) {
    const header = el.querySelector('.pip-header');
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;

    header.addEventListener('pointerdown', e => {
      if (e.target.closest('.pip-actions')) return;
      on = true;
      header.setPointerCapture(e.pointerId);
      ox = el.offsetLeft;
      oy = el.offsetTop;
      sx = e.clientX;
      sy = e.clientY;
      e.preventDefault();
    });

    document.addEventListener('pointermove', e => {
      if (!on) return;
      el.style.left = (ox + e.clientX - sx) + 'px';
      el.style.top = (oy + e.clientY - sy) + 'px';
    });

    document.addEventListener('pointerup', () => { on = false; });
  }

  _makeResizable(el) {
    const resize = document.createElement('div');
    resize.className = 'pip-resize';
    el.appendChild(resize);

    let sx = 0, sy = 0, ow = 0, oh = 0, on = false;

    resize.addEventListener('pointerdown', e => {
      on = true;
      resize.setPointerCapture(e.pointerId);
      sx = e.clientX;
      sy = e.clientY;
      ow = el.offsetWidth;
      oh = el.offsetHeight;
      e.preventDefault();
    });

    document.addEventListener('pointermove', e => {
      if (!on) return;
      el.style.width = Math.max(200, ow + e.clientX - sx) + 'px';
      el.style.height = Math.max(150, oh + e.clientY - sy) + 'px';
    });

    document.addEventListener('pointerup', () => { on = false; });
  }

  clear() {
    this.pips.forEach(p => p.el?.remove());
    this.pips = [];
  }
}
