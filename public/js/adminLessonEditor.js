/* ==========================================================================
   adminLessonEditor.js — editor integrado de lecciones y cuestionarios
   --------------------------------------------------------------------------
   Sustituye a los modales extensos de admin.html. Trabaja sobre un borrador en
   memoria y solo escribe en Supabase cuando el administrador pulsa Guardar.

   REGLAS
   · Un único borrador (`state.draft`) y una copia de lo guardado. Los cambios
     pendientes se marcan con acciones del usuario, no con eventos sueltos.
   · Nada de estilos inline: la CSP del sitio no permite `style="..."`.
   · Todo dato de la base de datos pasa por Utils.escapeHtml antes de pintarse.
   · El formato del contenido teórico no se toca: es el mismo texto con
     marcado ligero que renderiza RichText en el sitio del estudiante.
   ========================================================================== */

(function () {
  'use strict';

  const escapeHtml = (value) => Utils.escapeHtml(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const text = (value) => (value === null || value === undefined ? '' : String(value));
  const trimmed = (value) => text(value).trim();

  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const VIDEO_FILE_RE = /\.(mp4|webm|ogg)(\?.*)?$/i;

  const SECTIONS = [
    { id: 'general', num: '01', label: 'Datos generales', short: 'Datos', icon: 'fa-id-card' },
    { id: 'intro', num: '02', label: 'Objetivo e introducción', short: 'Objetivo', icon: 'fa-bullseye' },
    { id: 'theory', num: '03', label: 'Contenido teórico', short: 'Teoría', icon: 'fa-book-open' },
    { id: 'gallery', num: '04', label: 'Guía visual', short: 'Galería', icon: 'fa-images' },
    { id: 'video', num: '05', label: 'Video demostrativo', short: 'Video', icon: 'fa-circle-play' },
    { id: 'quiz', num: '06', label: 'Cuestionario', short: 'Quiz', icon: 'fa-circle-question' }
  ];

  const state = {
    context: null,          // 'lesson' | 'final'
    mode: 'create',
    dbId: null,
    dayNumber: null,
    section: 'general',
    selected: { theory: null, gallery: null, quiz: null },
    draft: null,
    original: null,
    saving: false,
    dirty: false,
    // Instancia del editor visual de la subsección abierta (se destruye al
    // cambiar de subsección para no dejar escuchas sueltas).
    theoryEditor: null,
    // El cuestionario se guarda en una segunda llamada: si esa falla, queda
    // pendiente para el siguiente intento aunque el día ya se haya guardado.
    quizPending: false
  };

  let refs = null;
  let bound = false;
  let thumbErrorBound = false;

  // --------------------------------------------------------------------------
  // UTILIDADES
  // --------------------------------------------------------------------------
  function excerpt(value, max = 90) {
    const plain = text(value)
      .replace(/^#{2,4}\s+/gm, '')
      .replace(/^\s*[-*>]\s+/gm, '')
      .replace(/\*\*|`/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length <= max) return plain;
    return plain.slice(0, max - 1).trimEnd() + '…';
  }

  /* Mismo criterio que el sitio del estudiante: un párrafo por salto de línea. */
  function toParagraphs(value) {
    return text(value)
      .split(/\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p)}</p>`)
      .join('');
  }

  function uploadFile(file, folder, maxBytes) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('EMPTY')); return; }
      if (file.size > maxBytes) { reject(new Error('TOO_LARGE')); return; }
      if (!window.DbService || typeof window.DbService.uploadMedia !== 'function') {
        reject(new Error('READ'));
        return;
      }
      window.DbService.uploadMedia(file, folder)
        .then((url) => resolve(url))
        .catch(() => reject(new Error('READ')));
    });
  }

  function fileError(err, kind) {
    const code = err && err.message;
    if (code === 'TOO_LARGE') {
      Notify.error(
        `El archivo supera el máximo de ${kind === 'video' ? 20 : 2} MB. ` +
        'Usa un enlace externo en su lugar.'
      );
    } else if (code === 'READ') {
      Notify.error('No se pudo subir el archivo al almacenamiento.');
    }
  }

  function normalizeQuestion(raw) {
    const source = raw || {};
    const options = Array.isArray(source.options) ? source.options.map(o => text(o)) : [];
    while (options.length < 4) options.push('');
    let correct = Number.isInteger(source.correct) ? source.correct : 0;
    if (correct < 0 || correct >= options.length) correct = 0;
    return { q: text(source.q), options, correct };
  }

  function lessonFromDay(day) {
    const sec = day.sections || {};
    const theory = sec.theory || {};
    const video = sec.video || {};
    return {
      dayNumber: String(day.dayNumber),
      title: text(day.title),
      icon: text(day.icon) || 'tools',
      shortDesc: text(day.shortDesc),
      coverImage: text(day.coverImage),
      objective: text(day.objective),
      introContent: text(day.introContent),
      theory: {
        subsections: (theory.subsections || []).map(s => ({
          subtitle: text(s.subtitle),
          content: text(s.content)
        }))
      },
      gallery: (sec.gallery || []).map(g => ({ image: text(g.image), caption: text(g.caption) })),
      video: {
        type: video.type === 'upload' ? 'upload' : 'url',
        src: text(video.src),
        title: text(video.title)
      },
      quiz: (sec.quiz || []).map(normalizeQuestion)
    };
  }

  function emptyLesson() {
    const days = (AdminApp.getDays && AdminApp.getDays()) || [];
    const next = days.length
      ? Math.max(...days.map(d => Number(d.dayNumber) || 0)) + 1
      : 1;
    return {
      dayNumber: String(next),
      title: '',
      icon: 'tools',
      shortDesc: '',
      coverImage: '',
      objective: '',
      introContent: '',
      theory: { subsections: [] },
      gallery: [],
      video: { type: 'url', src: '', title: '' },
      quiz: []
    };
  }

  // --------------------------------------------------------------------------
  // REFERENCIAS DEL DOM
  // --------------------------------------------------------------------------
  function getRefs() {
    if (refs) return refs;
    const byId = (id) => document.getElementById(id);

    refs = {
      view: byId('editor'),
      finalView: byId('quiz-final'),

      crumb: byId('edCrumb'),
      title: byId('edTitle'),
      sub: byId('edSub'),
      dirty: byId('edDirty'),
      save: byId('edSave'),
      nav: byId('edNavList'),
      navSummary: byId('edNavSummary'),
      canvas: byId('edCanvas'),
      panels: [...document.querySelectorAll('[data-ed-panel]')],

      dayNumber: byId('edDayNumber'),
      dayNumberErr: byId('edErrDayNumber'),
      titleInput: byId('edTitleInput'),
      titleErr: byId('edErrTitle'),
      icon: byId('edIcon'),
      shortDesc: byId('edShortDesc'),
      shortDescErr: byId('edErrShortDesc'),

      coverUrl: byId('edCoverUrl'),
      coverFile: byId('edCoverFile'),
      coverUpload: byId('edCoverUpload'),
      coverClear: byId('edCoverClear'),
      coverPreview: byId('edCoverPreview'),
      coverErr: byId('edErrCover'),

      objective: byId('edObjective'),
      objectiveErr: byId('edErrObjective'),
      intro: byId('edIntro'),
      introErr: byId('edErrIntro'),
      introPreview: byId('edIntroPreview'),

      thList: byId('thList'),
      thCount: byId('thCount'),
      thAdd: byId('thAdd'),
      thDetail: byId('thDetail'),

      galGrid: byId('galGrid'),
      galCount: byId('galCount'),
      galAdd: byId('galAdd'),
      galDetail: byId('galDetail'),

      videoTitle: byId('edVideoTitle'),
      videoType: byId('edVideoType'),
      videoSrc: byId('edVideoSrc'),
      videoUrlGroup: byId('edVideoUrlGroup'),
      videoUploadGroup: byId('edVideoUploadGroup'),
      videoFile: byId('edVideoFile'),
      videoUpload: byId('edVideoUpload'),
      videoClear: byId('edVideoClear'),
      videoFileHint: byId('edVideoFileHint'),
      videoPreview: byId('edVideoPreview'),
      videoErr: byId('edErrVideo'),

      quizHost: document.querySelector('[data-quiz-host="lesson"]'),
      finalHost: document.querySelector('[data-quiz-host="final"]'),
      finalDirty: byId('finalQuizDirty'),
      finalSave: byId('finalQuizSave'),
      finalSub: byId('finalQuizSub')
    };
    return refs;
  }

  // --------------------------------------------------------------------------
  // ESTADO DE GUARDADO
  // --------------------------------------------------------------------------
  function markDirty() {
    state.dirty = true;
    updateDirtyUI();
  }

  function updateDirtyUI() {
    if (!refs || !state.context) return;
    const isFinal = state.context === 'final';
    const chip = isFinal ? refs.finalDirty : refs.dirty;
    const btn = isFinal ? refs.finalSave : refs.save;

    if (chip) chip.hidden = !state.dirty;
    if (btn && !state.saving) btn.disabled = !state.dirty;
  }

  function setSaving(on) {
    state.saving = on;
    if (!refs || !state.context) return;
    const isFinal = state.context === 'final';
    const btn = isFinal ? refs.finalSave : refs.save;
    if (!btn) return;

    btn.disabled = on || !state.dirty;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    btn.innerHTML = on
      ? '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Guardando…'
      : '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ' +
        (isFinal ? 'Guardar cuestionario' : 'Guardar cambios');
  }

  function isDirty() {
    return Boolean(state.context) && state.dirty;
  }

  // --------------------------------------------------------------------------
  // CABECERA Y NAVEGACIÓN SECUNDARIA
  // --------------------------------------------------------------------------
  function completeness(d) {
    return [
      { label: 'datos generales', ok: Boolean(trimmed(d.title) && trimmed(d.shortDesc)) },
      { label: 'introducción', ok: Boolean(trimmed(d.objective) && trimmed(d.introContent)) },
      { label: 'teoría', ok: d.theory.subsections.some(s => trimmed(s.content) || trimmed(s.subtitle)) },
      { label: 'galería', ok: d.gallery.some(g => trimmed(g.image)) },
      { label: 'video', ok: Boolean(trimmed(d.video.src)) },
      { label: 'cuestionario', ok: d.quiz.some(q => trimmed(q.q)) }
    ];
  }

  function renderHeader() {
    const r = getRefs();
    const d = state.draft;
    if (!d) return;

    const isNew = state.mode === 'create';
    const n = Math.max(1, Number(d.dayNumber) || 1);

    r.crumb.textContent = isNew ? 'Nuevo día' : `Día ${d.dayNumber}`;
    r.title.textContent = isNew
      ? 'Nuevo día'
      : `Día ${d.dayNumber} — ${trimmed(d.title) || 'Sin título'}`;

    if (isNew) {
      r.sub.textContent = `Se guardará como día ${n}. Completa los datos y el contenido del módulo.`;
      return;
    }

    const checks = completeness(d);
    const done = checks.filter(c => c.ok).length;
    const falta = checks.filter(c => !c.ok).map(c => c.label);
    r.sub.textContent = done === checks.length
      ? 'Contenido completo: las seis secciones tienen lo necesario.'
      : `${done} de ${checks.length} secciones completas · falta ${falta.join(', ')}`;
  }

  function sectionState(id) {
    const d = state.draft;
    if (!d || !d.theory) return { tone: 'muted', text: '' };

    if (id === 'general') {
      return { tone: trimmed(d.title) && trimmed(d.shortDesc) ? 'ok' : 'muted', text: '' };
    }
    if (id === 'intro') {
      return { tone: trimmed(d.objective) && trimmed(d.introContent) ? 'ok' : 'muted', text: '' };
    }
    if (id === 'theory') {
      const n = d.theory.subsections.length;
      return { tone: n ? 'ok' : 'muted', text: n ? String(n) : '' };
    }
    if (id === 'gallery') {
      const n = d.gallery.length;
      return { tone: n ? 'ok' : 'muted', text: n ? String(n) : '' };
    }
    if (id === 'video') {
      return { tone: trimmed(d.video.src) ? 'ok' : 'muted', text: '' };
    }
    if (id === 'quiz') {
      const n = d.quiz.length;
      return { tone: n ? 'ok' : 'muted', text: n ? String(n) : '' };
    }
    return { tone: 'muted', text: '' };
  }

  function renderNav() {
    const r = getRefs();
    // La navegación secundaria solo existe en el editor de lecciones: al editar
    // el cuestionario final el borrador no tiene secciones.
    if (state.context !== 'lesson' || !state.draft || !state.draft.theory) return;

    r.nav.innerHTML = SECTIONS.map((section) => {
      const active = state.section === section.id;
      const info = sectionState(section.id);
      const meta = info.text
        ? `<span class="ed-nav-meta${info.tone === 'ok' ? ' is-ok' : ''}">${escapeHtml(info.text)}</span>`
        : `<span class="ed-nav-dot${info.tone === 'ok' ? ' is-ok' : ''}" aria-hidden="true"></span>`;

      return `
        <li>
          <button type="button" class="ed-nav-item${active ? ' is-active' : ''}"
                  data-section="${section.id}" aria-current="${active ? 'true' : 'false'}">
            <span class="ed-nav-num">${section.num}</span>
            <i class="fa-solid ${section.icon}" aria-hidden="true"></i>
            <span class="ed-nav-text">${escapeHtml(section.label)}</span>
            <span class="ed-nav-short">${escapeHtml(section.short)}</span>
            ${meta}
          </button>
        </li>`;
    }).join('');

    const checks = completeness(state.draft);
    const done = checks.filter(c => c.ok).length;
    r.navSummary.innerHTML = `
      <p class="ed-nav-total"><strong>${done}/${checks.length}</strong> secciones con contenido</p>
      <p class="ed-nav-note">Los cambios se guardan solo al pulsar Guardar.</p>`;
  }

  /* En móvil la lista y el detalle se apilan: al elegir un elemento se lleva
     la vista al detalle, que de otro modo queda fuera de pantalla. */
  function revealDetail(element) {
    if (!element) return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setSection(id, opts = {}) {
    if (!SECTIONS.some(s => s.id === id)) id = 'general';
    state.section = id;

    getRefs().panels.forEach(panel => {
      panel.hidden = panel.dataset.edPanel !== id;
    });
    getRefs().nav.querySelectorAll('[data-section]').forEach(btn => {
      const active = btn.dataset.section === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', active ? 'true' : 'false');
    });
    getRefs().canvas.scrollTop = 0;

    if (opts.syncRoute && state.context === 'lesson') {
      const day = state.mode === 'create' ? null : state.dayNumber;
      AdminApp.syncEditorRoute(day, id);
    }
  }

  // --------------------------------------------------------------------------
  // CAMPOS FIJOS: DATOS GENERALES, INTRODUCCIÓN Y VIDEO
  // --------------------------------------------------------------------------
  function fillFields() {
    const r = getRefs();
    const d = state.draft;

    r.dayNumber.value = d.dayNumber;
    r.titleInput.value = d.title;
    r.icon.value = d.icon;
    r.shortDesc.value = d.shortDesc;
    // Un data URL ocupa miles de caracteres: se muestra vacío y se conserva
    // en el borrador hasta que el administrador escriba otra ruta.
    r.coverUrl.value = d.coverImage.startsWith('data:') ? '' : d.coverImage;
    r.objective.value = d.objective;
    r.intro.value = d.introContent;

    r.videoTitle.value = d.video.title;
    r.videoType.value = d.video.type;
    r.videoSrc.value = d.video.type === 'upload' ? '' : d.video.src;
  }

  function renderCover() {
    const r = getRefs();
    const value = trimmed(state.draft.coverImage);
    const url = value ? Utils.safeImageUrl(value) : '';

    r.coverClear.hidden = !value;
    r.coverPreview.innerHTML = '';

    if (url) {
      const img = document.createElement('img');
      img.alt = 'Portada del módulo';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        r.coverPreview.innerHTML = `<span class="ed-cover-glyph">${icon(state.draft.icon)}</span>
          <span class="ed-cover-warn">La imagen no se pudo cargar</span>`;
      });
      img.src = url;
      r.coverPreview.appendChild(img);
      return;
    }

    r.coverPreview.innerHTML = `<span class="ed-cover-glyph">${icon(state.draft.icon)}</span>`;
  }

  function renderIntroPreview() {
    const target = getRefs().introPreview;
    if (!target) return;
    const html = toParagraphs(state.draft.introContent);
    target.innerHTML = html || '<p class="ed-muted">La vista previa aparecerá al escribir la introducción.</p>';
  }

  function videoSource() {
    const video = state.draft.video;
    if (!trimmed(video.src)) return '';
    return video.type === 'upload'
      ? Utils.safeMediaUrl(video.src)
      : Utils.formatVideoUrl(video.src);
  }

  function renderVideoPreview() {
    const r = getRefs();
    const video = state.draft.video;
    const src = videoSource();
    r.videoPreview.innerHTML = '';

    if (!src) {
      r.videoPreview.innerHTML = `
        <div class="ed-video-empty">
          <i class="fa-solid fa-video-slash" aria-hidden="true"></i>
          <p>Sin video asociado. Es opcional: la lección funciona sin él.</p>
        </div>`;
      return;
    }

    if (video.type === 'upload' || VIDEO_FILE_RE.test(video.src)) {
      const el = document.createElement('video');
      el.controls = true;
      el.preload = 'metadata';
      el.src = src;
      r.videoPreview.appendChild(el);
      return;
    }

    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = video.title || 'Video demostrativo del módulo';
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    r.videoPreview.appendChild(frame);
  }

  function renderVideo() {
    const r = getRefs();
    const video = state.draft.video;
    const isUpload = video.type === 'upload';

    r.videoType.value = video.type;
    r.videoUrlGroup.hidden = isUpload;
    r.videoUploadGroup.hidden = !isUpload;
    r.videoClear.hidden = !trimmed(video.src);
    r.videoFileHint.textContent = isUpload && trimmed(video.src)
      ? 'Archivo de video cargado. Se guarda en la base de datos.'
      : 'MP4 o WebM, máximo 20 MB.';

    if (!isUpload) r.videoSrc.value = video.src;
    renderVideoPreview();
  }

  // --------------------------------------------------------------------------
  // TEORÍA — LISTA COMPACTA + EDITOR DE LA SUBSECCIÓN
  // --------------------------------------------------------------------------
  function subsections() {
    return state.draft.theory.subsections;
  }

  function renderTheory() {
    const r = getRefs();
    const items = subsections();

    r.thCount.textContent = String(items.length);

    if (!items.length) {
      r.thList.innerHTML = `
        <li class="ed-empty">
          <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
          <p class="ed-empty-title">Todavía no hay subsecciones</p>
          <p class="ed-empty-text">Agrega la primera para empezar a escribir la teoría del día.</p>
        </li>`;
    } else {
      r.thList.innerHTML = items.map((item, index) => {
        const active = state.selected.theory === index;
        return `
          <li class="ed-item${active ? ' is-selected' : ''}">
            <button type="button" class="ed-item-main" data-th-select="${index}"
                    aria-current="${active ? 'true' : 'false'}">
              <span class="ed-item-num">${String(index + 1).padStart(2, '0')}</span>
              <span class="ed-item-body">
                <span class="ed-item-title" data-th-title="${index}">${escapeHtml(trimmed(item.subtitle) || 'Sin título')}</span>
                <span class="ed-item-excerpt" data-th-excerpt="${index}">${escapeHtml(excerpt(item.content) || 'Sin contenido')}</span>
              </span>
            </button>
            <span class="ed-item-tools">
              <button type="button" class="ed-icon-btn" data-th-act="up" data-i="${index}"
                      aria-label="Mover la subsección ${index + 1} hacia arriba" ${index === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
              </button>
              <button type="button" class="ed-icon-btn" data-th-act="down" data-i="${index}"
                      aria-label="Mover la subsección ${index + 1} hacia abajo" ${index === items.length - 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
              </button>
              <button type="button" class="ed-icon-btn ed-icon-btn--danger" data-th-act="del" data-i="${index}"
                      aria-label="Eliminar la subsección ${index + 1}">
                <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
              </button>
            </span>
          </li>`;
      }).join('');
    }

    renderTheoryDetail();
  }

  function renderTheoryDetail() {
    const r = getRefs();
    const items = subsections();
    const index = state.selected.theory;

    if (state.theoryEditor) {
      state.theoryEditor.destroy();
      state.theoryEditor = null;
    }
    if (index === null || !items[index]) {
      r.thDetail.innerHTML = `
        <div class="ed-detail-empty">
          <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          <p class="ed-empty-title">Selecciona una subsección</p>
          <p class="ed-empty-text">Su contenido se abre aquí, sin desplegar el resto.</p>
        </div>`;
      return;
    }

    const item = items[index];
    r.thDetail.innerHTML = `
      <div class="ed-detail-head">
        <div class="ed-detail-titles">
          <p class="ed-detail-kicker">Subsección ${String(index + 1).padStart(2, '0')}</p>
          <h3 class="ed-detail-title" data-th-headline>${escapeHtml(trimmed(item.subtitle) || 'Sin título')}</h3>
        </div>
        <div class="ed-detail-actions">
          <button type="button" class="ed-icon-btn" data-th-act="up" data-i="${index}"
                  aria-label="Mover arriba" ${index === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn" data-th-act="down" data-i="${index}"
                  aria-label="Mover abajo" ${index === items.length - 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn ed-icon-btn--danger" data-th-act="del" data-i="${index}"
                  aria-label="Eliminar subsección">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div class="form-group">
        <label for="thTitleField">Título de la subsección</label>
        <input type="text" id="thTitleField" maxlength="160"
               value="${escapeHtml(item.subtitle)}" placeholder="Conceptos fundamentales">
      </div>

      <div class="re-editor" data-th-editor></div>
    `;

    bindTheoryDetail(item, index);
  }

  function bindTheoryDetail(item, index) {
    const detail = getRefs().thDetail;
    const titleField = detail.querySelector('#thTitleField');
    const host = detail.querySelector('[data-th-editor]');

    titleField.addEventListener('input', () => {
      item.subtitle = titleField.value;
      markDirty();
      updateTheoryRow(index);
    });

    /* El editor visual escribe el mismo texto con marcado que consumía el
       editor anterior: no cambia el formato guardado ni el sitio público. */
    state.theoryEditor = window.RichEditor.mount(host, {
      value: item.content,
      onChange: (markdown) => {
        item.content = markdown;
        markDirty();
        updateTheoryRow(index);
      }
    });
  }

  function updateTheoryRow(index) {
    const items = subsections();
    const item = items[index];
    if (!item) return;

    const row = getRefs().thList.querySelector(`[data-th-title="${index}"]`);
    if (row) row.textContent = trimmed(item.subtitle) || 'Sin título';

    const ex = getRefs().thList.querySelector(`[data-th-excerpt="${index}"]`);
    if (ex) ex.textContent = excerpt(item.content) || 'Sin contenido';

    const head = getRefs().thDetail.querySelector('[data-th-headline]');
    if (head) head.textContent = trimmed(item.subtitle) || 'Sin título';
  }

  function addSubsection() {
    const items = subsections();
    items.push({ subtitle: '', content: '' });
    state.selected.theory = items.length - 1;
    markDirty();
    renderTheory();
    renderNav();

    const field = getRefs().thDetail.querySelector('#thTitleField');
    if (field) {
      field.focus({ preventScroll: true });
      getRefs().thDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function moveSubsection(index, delta) {
    const items = subsections();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;

    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    state.selected.theory = target;
    markDirty();
    renderTheory();

    const btn = getRefs().thList.querySelector(`[data-th-act="${delta < 0 ? 'up' : 'down'}"][data-i="${target}"]`)
      || getRefs().thList.querySelector(`[data-th-act="down"][data-i="${target}"]`);
    if (btn && !btn.disabled) btn.focus();
  }

  function removeSubsection(index) {
    const items = subsections();
    const item = items[index];
    if (!item) return;

    const hasContent = trimmed(item.subtitle) || trimmed(item.content);
    if (hasContent && !window.confirm(
      '¿Eliminar esta subsección y todo su contenido?\nEl cambio se aplica al guardar.'
    )) return;

    items.splice(index, 1);
    state.selected.theory = items.length ? Math.min(index, items.length - 1) : null;
    markDirty();
    renderTheory();
    renderNav();
  }

  function onTheoryListClick(event) {
    const select = event.target.closest('[data-th-select]');
    if (select) {
      state.selected.theory = Number(select.dataset.thSelect);
      renderTheory();
      revealDetail(getRefs().thDetail);
      return;
    }
    const action = event.target.closest('[data-th-act]');
    if (!action) return;
    handleTheoryAction(action);
  }

  function onTheoryDetailClick(event) {
    const action = event.target.closest('[data-th-act]');
    if (action) handleTheoryAction(action);
  }

  function handleTheoryAction(action) {
    const index = Number(action.dataset.i);
    const kind = action.dataset.thAct;
    if (kind === 'up') moveSubsection(index, -1);
    else if (kind === 'down') moveSubsection(index, 1);
    else if (kind === 'del') removeSubsection(index);
  }

  // --------------------------------------------------------------------------
  // GUÍA VISUAL — CUADRÍCULA + EDITOR DE LA IMAGEN
  // --------------------------------------------------------------------------
  function galleryItems() {
    return state.draft.gallery;
  }

  function renderGallery() {
    const r = getRefs();
    const items = galleryItems();

    r.galCount.textContent = String(items.length);

    if (!thumbErrorBound && r.galGrid) {
      r.galGrid.addEventListener('error', (event) => {
        const img = event.target;
        if (!img || img.tagName !== 'IMG') return;
        const placeholder = document.createElement('span');
        placeholder.className = 'ed-thumb-ph';
        placeholder.innerHTML = '<i class="fa-solid fa-image-slash" aria-hidden="true"></i>';
        img.replaceWith(placeholder);
      }, true);
      thumbErrorBound = true;
    }

    if (!items.length) {
      r.galGrid.innerHTML = `
        <div class="ed-empty ed-empty--grid">
          <i class="fa-solid fa-images" aria-hidden="true"></i>
          <p class="ed-empty-title">Sin imágenes todavía</p>
          <p class="ed-empty-text">Agrega la primera para ilustrar el módulo.</p>
        </div>`;
    } else {
      r.galGrid.innerHTML = items.map((item, index) => {
        const src = trimmed(item.image) ? Utils.safeImageUrl(item.image) : '';
        const active = state.selected.gallery === index;
        const media = src
          ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(trimmed(item.caption) || `Imagen ${index + 1}`)}" loading="lazy" decoding="async">`
          : `<span class="ed-thumb-ph"><i class="fa-solid fa-image" aria-hidden="true"></i></span>`;

        return `
          <button type="button" class="ed-thumb${active ? ' is-selected' : ''}"
                  data-gal-select="${index}" aria-current="${active ? 'true' : 'false'}">
            <span class="ed-thumb-media">${media}</span>
            <span class="ed-thumb-foot">
              <span class="ed-thumb-num">${String(index + 1).padStart(2, '0')}</span>
              <span class="ed-thumb-cap" data-gal-cap="${index}">${escapeHtml(trimmed(item.caption) || 'Sin descripción')}</span>
            </span>
          </button>`;
      }).join('');
    }

    renderGalleryDetail();
  }

  function renderGalleryDetail() {
    const r = getRefs();
    const items = galleryItems();
    const index = state.selected.gallery;

    if (index === null || !items[index]) {
      r.galDetail.innerHTML = `
        <div class="ed-detail-empty">
          <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          <p class="ed-empty-title">Selecciona una imagen</p>
          <p class="ed-empty-text">Aquí puedes cambiar su archivo, su ruta y su explicación.</p>
        </div>`;
      return;
    }

    const item = items[index];
    r.galDetail.innerHTML = `
      <div class="ed-detail-head">
        <div class="ed-detail-titles">
          <p class="ed-detail-kicker">Imagen ${String(index + 1).padStart(2, '0')}</p>
          <h3 class="ed-detail-title">${escapeHtml(trimmed(item.caption) || 'Sin descripción')}</h3>
        </div>
        <div class="ed-detail-actions">
          <button type="button" class="ed-icon-btn" data-gal-act="up" data-i="${index}"
                  aria-label="Mover arriba" ${index === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn" data-gal-act="down" data-i="${index}"
                  aria-label="Mover abajo" ${index === items.length - 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn ed-icon-btn--danger" data-gal-act="del" data-i="${index}"
                  aria-label="Eliminar imagen">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div class="ed-gal-preview" data-gal-preview></div>

      <div class="form-group">
        <label for="galUrl">Ruta o URL de la imagen</label>
        <input type="text" id="galUrl" value="${escapeHtml(trimmed(item.image).startsWith('data:') ? '' : item.image)}"
               placeholder="img/cursos/dia-1/foto.jpg o https://…">
        <div class="ed-file-row">
          <input type="file" id="galFile" accept="image/*" class="file-input-hidden">
          <button type="button" class="btn btn--outline btn--sm" data-gal-upload>
            <i class="fa-solid fa-upload" aria-hidden="true"></i> Subir imagen
          </button>
          <small class="ed-help">JPG o PNG, máximo 2 MB.</small>
        </div>
      </div>

      <div class="form-group">
        <label for="galCaption">Explicación inferior</label>
        <textarea id="galCaption" rows="3"
                  placeholder="Qué debe observar el estudiante en esta imagen…">${escapeHtml(item.caption)}</textarea>
      </div>
    `;

    bindGalleryDetail(item, index);
    paintGalleryPreview();
  }

  function bindGalleryDetail(item, index) {
    const detail = getRefs().galDetail;
    const urlField = detail.querySelector('#galUrl');
    const captionField = detail.querySelector('#galCaption');
    const fileField = detail.querySelector('#galFile');

    urlField.addEventListener('input', () => {
      item.image = urlField.value;
      markDirty();
      renderGalleryGridOnly();
      paintGalleryPreview();
    });

    captionField.addEventListener('input', () => {
      item.caption = captionField.value;
      markDirty();
      const cap = getRefs().galGrid.querySelector(`[data-gal-cap="${index}"]`);
      if (cap) cap.textContent = trimmed(item.caption) || 'Sin descripción';
      const title = detail.querySelector('.ed-detail-title');
      if (title) title.textContent = trimmed(item.caption) || 'Sin descripción';
    });

    detail.querySelector('[data-gal-upload]').addEventListener('click', () => fileField.click());
    fileField.addEventListener('change', async () => {
      try {
        const url = await uploadFile(fileField.files[0], 'gallery', MAX_IMAGE_BYTES);
        item.image = url;
        urlField.value = '';
        markDirty();
        renderGalleryGridOnly();
        paintGalleryPreview();
      } catch (err) {
        fileError(err, 'imagen');
      }
      fileField.value = '';
    });
  }

  /* Rehace solo la cuadrícula: el foco sigue en el campo que se está editando. */
  function renderGalleryGridOnly() {
    const r = getRefs();
    const items = galleryItems();
    r.galCount.textContent = String(items.length);
    r.galGrid.querySelectorAll('[data-gal-select]').forEach((btn, index) => {
      const item = items[index];
      if (!item) return;
      const media = btn.querySelector('.ed-thumb-media');
      const src = trimmed(item.image) ? Utils.safeImageUrl(item.image) : '';
      if (!media) return;
      if (src) {
        const current = media.querySelector('img');
        if (current) current.src = src;
        else media.innerHTML = `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async">`;
      } else {
        media.innerHTML = '<span class="ed-thumb-ph"><i class="fa-solid fa-image" aria-hidden="true"></i></span>';
      }
    });
  }

  function paintGalleryPreview() {
    const detail = getRefs().galDetail;
    const container = detail.querySelector('[data-gal-preview]');
    const items = galleryItems();
    const index = state.selected.gallery;
    const item = index === null ? null : items[index];
    if (!container || !item) return;

    const src = trimmed(item.image) ? Utils.safeImageUrl(item.image) : '';
    container.innerHTML = '';

    if (!src) {
      container.innerHTML = `<span class="ed-ph"><i class="fa-solid fa-image" aria-hidden="true"></i> Sin imagen seleccionada</span>`;
      return;
    }

    const img = document.createElement('img');
    img.alt = trimmed(item.caption) || 'Vista previa de la imagen';
    img.loading = 'lazy';

    // Mientras la imagen viaja, el hueco queda cubierto por el aviso.
    const hint = document.createElement('span');
    hint.className = 'ed-ph';
    hint.textContent = 'Cargando imagen…';
    container.appendChild(hint);

    img.addEventListener('load', () => hint.remove());
    img.addEventListener('error', () => {
      container.innerHTML = `<span class="ed-ph ed-ph--error">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        La ruta no devuelve una imagen válida
      </span>`;
    });
    img.src = src;
    container.appendChild(img);
  }

  function addGalleryItem() {
    const items = galleryItems();
    items.push({ image: '', caption: '' });
    state.selected.gallery = items.length - 1;
    markDirty();
    renderGallery();
    renderNav();

    const field = getRefs().galDetail.querySelector('#galUrl');
    if (field) {
      field.focus({ preventScroll: true });
      getRefs().galDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function moveGalleryItem(index, delta) {
    const items = galleryItems();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;

    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    state.selected.gallery = target;
    markDirty();
    renderGallery();
  }

  function removeGalleryItem(index) {
    const items = galleryItems();
    const item = items[index];
    if (!item) return;

    if (trimmed(item.image) && !window.confirm(
      '¿Quitar esta imagen de la galería?\nEl cambio se aplica al guardar.'
    )) return;

    items.splice(index, 1);
    state.selected.gallery = items.length ? Math.min(index, items.length - 1) : null;
    markDirty();
    renderGallery();
    renderNav();
  }

  function onGalleryGridClick(event) {
    const select = event.target.closest('[data-gal-select]');
    if (!select) return;
    state.selected.gallery = Number(select.dataset.galSelect);
    renderGallery();
    revealDetail(getRefs().galDetail);
  }

  function onGalleryDetailClick(event) {
    const action = event.target.closest('[data-gal-act]');
    if (!action) return;
    const index = Number(action.dataset.i);
    const kind = action.dataset.galAct;
    if (kind === 'up') moveGalleryItem(index, -1);
    else if (kind === 'down') moveGalleryItem(index, 1);
    else if (kind === 'del') removeGalleryItem(index);
  }

  // --------------------------------------------------------------------------
  // CUESTIONARIO — COMPONENTE COMPARTIDO (LECCIÓN Y EXAMEN FINAL)
  // --------------------------------------------------------------------------
  function quizHost() {
    return state.context === 'final' ? getRefs().finalHost : getRefs().quizHost;
  }

  function quizItems() {
    return state.draft ? state.draft.quiz : [];
  }

  function questionStatus(question) {
    const hasText = Boolean(trimmed(question.q));
    const filled = question.options.filter(o => trimmed(o)).length;
    const correctText = Boolean(trimmed(question.options[question.correct]));

    if (!hasText && filled === 0) return { tone: 'muted', icon: 'fa-circle', label: 'Vacía' };
    if (!hasText || filled < 2 || !correctText) {
      return { tone: 'warn', icon: 'fa-triangle-exclamation', label: 'Incompleta' };
    }
    return { tone: 'ok', icon: 'fa-circle-check', label: 'Lista' };
  }

  function renderQuizPanel() {
    const host = quizHost();
    if (!host) return;

    host.innerHTML = `
      <div class="ed-col">
        <div class="ed-col-head">
          <h3>Preguntas</h3>
          <span class="ed-count" data-role="quiz-count">0</span>
        </div>
        <ol class="ed-list" data-role="quiz-list"></ol>
        <button type="button" class="ed-add" data-role="quiz-add">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar pregunta
        </button>
      </div>
      <div class="ed-detail" data-role="quiz-detail"></div>
    `;

    renderQuizList();
    renderQuizDetail();
  }

  function renderQuizList() {
    const host = quizHost();
    if (!host) return;
    const list = host.querySelector('[data-role="quiz-list"]');
    const count = host.querySelector('[data-role="quiz-count"]');
    const items = quizItems();
    if (!list) return;

    if (count) count.textContent = String(items.length);

    if (!items.length) {
      list.innerHTML = `
        <li class="ed-empty">
          <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
          <p class="ed-empty-title">Sin preguntas todavía</p>
          <p class="ed-empty-text">Cada pregunta tiene cuatro alternativas y una correcta.</p>
        </li>`;
      return;
    }

    list.innerHTML = items.map((question, index) => {
      const status = questionStatus(question);
      const active = state.selected.quiz === index;
      return `
        <li class="ed-item${active ? ' is-selected' : ''}">
          <button type="button" class="ed-item-main" data-quiz-select="${index}"
                  aria-current="${active ? 'true' : 'false'}">
            <span class="ed-item-num">${String(index + 1).padStart(2, '0')}</span>
            <span class="ed-item-body">
              <span class="ed-item-title">${escapeHtml(excerpt(question.q, 70) || 'Pregunta sin enunciado')}</span>
              <span class="ed-item-excerpt">
                <span class="ed-status ed-status--${status.tone}">
                  <i class="fa-solid ${status.icon}" aria-hidden="true"></i>${status.label}
                </span>
                <span class="ed-item-sep">·</span>
                ${question.options.length} alternativas
              </span>
            </span>
          </button>
          <span class="ed-item-tools">
            <button type="button" class="ed-icon-btn" data-quiz-act="up" data-i="${index}"
                    aria-label="Mover la pregunta ${index + 1} hacia arriba" ${index === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
            </button>
            <button type="button" class="ed-icon-btn" data-quiz-act="down" data-i="${index}"
                    aria-label="Mover la pregunta ${index + 1} hacia abajo" ${index === items.length - 1 ? 'disabled' : ''}>
              <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
            </button>
            <button type="button" class="ed-icon-btn ed-icon-btn--danger" data-quiz-act="del" data-i="${index}"
                    aria-label="Eliminar la pregunta ${index + 1}">
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            </button>
          </span>
        </li>`;
    }).join('');
  }

  function renderQuizDetail() {
    const host = quizHost();
    if (!host) return;
    const detail = host.querySelector('[data-role="quiz-detail"]');
    const items = quizItems();
    const index = state.selected.quiz;
    if (!detail) return;

    if (index === null || !items[index]) {
      detail.innerHTML = `
        <div class="ed-detail-empty">
          <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          <p class="ed-empty-title">Selecciona una pregunta</p>
          <p class="ed-empty-text">Su enunciado y sus alternativas se editan aquí.</p>
        </div>`;
      return;
    }

    const question = items[index];
    const radioName = `qzCorrect-${state.context}`;
    const options = question.options.map((option, optionIndex) => {
      const correct = question.correct === optionIndex;
      return `
        <div class="ed-option${correct ? ' is-correct' : ''}" data-opt-row="${optionIndex}">
          <input type="radio" class="ed-option-radio" name="${radioName}"
                 id="qzOpt-${state.context}-${optionIndex}" value="${optionIndex}" ${correct ? 'checked' : ''}>
          <label class="ed-option-letter" for="qzOpt-${state.context}-${optionIndex}"
                 title="Marcar como correcta">${LETTERS[optionIndex]}</label>
          <input type="text" class="ed-option-input" data-opt-text="${optionIndex}"
                 value="${escapeHtml(option)}" aria-label="Alternativa ${LETTERS[optionIndex]}"
                 placeholder="Texto de la alternativa ${LETTERS[optionIndex]}">
          <span class="ed-option-flag" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
        </div>`;
    }).join('');

    detail.innerHTML = `
      <div class="ed-detail-head">
        <div class="ed-detail-titles">
          <p class="ed-detail-kicker">Pregunta ${String(index + 1).padStart(2, '0')}</p>
          <h3 class="ed-detail-title" data-qz-headline>${escapeHtml(excerpt(question.q, 60) || 'Sin enunciado')}</h3>
        </div>
        <div class="ed-detail-actions">
          <button type="button" class="ed-icon-btn" data-quiz-act="up" data-i="${index}"
                  aria-label="Mover la pregunta arriba" ${index === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn" data-quiz-act="down" data-i="${index}"
                  aria-label="Mover la pregunta abajo" ${index === items.length - 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn" data-quiz-act="dup" data-i="${index}"
                  aria-label="Duplicar pregunta" title="Duplicar pregunta">
            <i class="fa-solid fa-copy" aria-hidden="true"></i>
          </button>
          <button type="button" class="ed-icon-btn" data-quiz-act="del" data-i="${index}"
                  aria-label="Eliminar pregunta" title="Eliminar pregunta">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div class="form-group">
        <label for="qzText">Enunciado</label>
        <textarea id="qzText" rows="3"
                  placeholder="¿Qué componente regula la presión del circuito de frenos?">${escapeHtml(question.q)}</textarea>
      </div>

      <fieldset class="ed-options">
        <legend class="ed-options-legend">Alternativas <span>marca la correcta</span></legend>
        <div class="ed-options-list">${options}</div>
      </fieldset>

      <p class="ed-help">La respuesta correcta se guarda por posición. En el curso las alternativas se barajan en cada intento, así que evita opciones que citen letras («A y B»).</p>
    `;

    bindQuizDetail(question, index);
  }

  function bindQuizDetail(question, index) {
    const host = quizHost();
    const detail = host.querySelector('[data-role="quiz-detail"]');
    const statement = detail.querySelector('#qzText');

    statement.addEventListener('input', () => {
      question.q = statement.value;
      markDirty();
      const rowTitle = host.querySelector(`[data-quiz-select="${index}"] .ed-item-title`);
      if (rowTitle) rowTitle.textContent = excerpt(question.q, 70) || 'Pregunta sin enunciado';
      const head = detail.querySelector('[data-qz-headline]');
      if (head) head.textContent = excerpt(question.q, 60) || 'Sin enunciado';
      renderQuizList();
    });

    detail.querySelectorAll('[data-opt-text]').forEach(input => {
      input.addEventListener('input', () => {
        question.options[Number(input.dataset.optText)] = input.value;
        markDirty();
        renderQuizList();
      });
    });

    detail.querySelectorAll('.ed-option-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        question.correct = Number(radio.value);
        markDirty();
        paintCorrectOption(detail, question.correct);
        renderQuizList();
      });
    });
  }

  function paintCorrectOption(detail, correct) {
    detail.querySelectorAll('[data-opt-row]').forEach(row => {
      row.classList.toggle('is-correct', Number(row.dataset.optRow) === correct);
    });
  }

  function addQuestion() {
    const items = quizItems();
    items.push({ q: '', options: ['', '', '', ''], correct: 0 });
    state.selected.quiz = items.length - 1;
    markDirty();
    renderQuizList();
    renderQuizDetail();
    renderNav();

    const host = quizHost();
    const field = host.querySelector('#qzText');
    if (field) {
      field.focus({ preventScroll: true });
      host.querySelector('[data-role="quiz-detail"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function duplicateQuestion(index) {
    const items = quizItems();
    if (!items[index]) return;
    items.splice(index + 1, 0, clone(items[index]));
    state.selected.quiz = index + 1;
    markDirty();
    renderQuizList();
    renderQuizDetail();
    renderNav();
  }

  function moveQuestion(index, delta) {
    const items = quizItems();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;

    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    state.selected.quiz = target;
    markDirty();
    renderQuizList();
    renderQuizDetail();
  }

  function removeQuestion(index) {
    const items = quizItems();
    const question = items[index];
    if (!question) return;

    const hasContent = trimmed(question.q) || question.options.some(o => trimmed(o));
    if (hasContent && !window.confirm(
      '¿Eliminar esta pregunta y sus alternativas?\nEl cambio se aplica al guardar.'
    )) return;

    items.splice(index, 1);
    state.selected.quiz = items.length ? Math.min(index, items.length - 1) : null;
    markDirty();
    renderQuizList();
    renderQuizDetail();
    renderNav();
  }

  function onQuizClick(event) {
    const host = quizHost();
    const select = event.target.closest('[data-quiz-select]');
    if (select) {
      state.selected.quiz = Number(select.dataset.quizSelect);
      renderQuizList();
      renderQuizDetail();
      revealDetail(host.querySelector('[data-role="quiz-detail"]'));
      return;
    }

    if (event.target.closest('[data-role="quiz-add"], [data-role="quiz-new"]')) {
      addQuestion();
      return;
    }

    const action = event.target.closest('[data-quiz-act]');
    if (action) {
      const index = Number(action.dataset.i);
      const kind = action.dataset.quizAct;
      if (kind === 'up') moveQuestion(index, -1);
      else if (kind === 'down') moveQuestion(index, 1);
      else if (kind === 'dup') duplicateQuestion(index);
      else if (kind === 'del') removeQuestion(index);
      return;
    }

    // Clic en una fila de alternativa (fuera del campo de texto): la marca.
    const row = event.target.closest('[data-opt-row]');
    if (row && !event.target.closest('input[type="text"]')) {
      const index = state.selected.quiz;
      const question = quizItems()[index];
      if (!question) return;
      question.correct = Number(row.dataset.optRow);
      markDirty();
      const detail = host.querySelector('[data-role="quiz-detail"]');
      const radio = detail.querySelector(`.ed-option-radio[value="${question.correct}"]`);
      if (radio) radio.checked = true;
      paintCorrectOption(detail, question.correct);
      renderQuizList();
    }
  }

  // --------------------------------------------------------------------------
  // VALIDACIÓN
  // --------------------------------------------------------------------------
  function clearErrors() {
    const r = getRefs();
    [
      r.dayNumberErr, r.titleErr, r.shortDescErr, r.coverErr,
      r.objectiveErr, r.introErr, r.videoErr
    ].forEach(el => {
      if (!el) return;
      el.hidden = true;
      el.textContent = '';
    });
    [r.dayNumber, r.titleInput, r.shortDesc, r.coverUrl, r.objective, r.intro, r.videoSrc]
      .forEach(el => el && el.removeAttribute('aria-invalid'));
  }

  function quizProblem() {
    const items = quizItems();
    for (let index = 0; index < items.length; index += 1) {
      const question = items[index];
      const empty = !trimmed(question.q) && question.options.every(o => !trimmed(o));
      if (empty) continue;

      if (!trimmed(question.q)) {
        return { section: 'quiz', question: index, message: `La pregunta ${index + 1} no tiene enunciado.` };
      }
      const filled = question.options.filter(o => trimmed(o)).length;
      if (filled < 2) {
        return { section: 'quiz', question: index, message: `La pregunta ${index + 1} necesita al menos dos alternativas con texto.` };
      }
      if (!trimmed(question.options[question.correct])) {
        return { section: 'quiz', question: index, message: `La pregunta ${index + 1} no tiene una alternativa correcta con texto.` };
      }
    }
    return null;
  }

  function validateLesson() {
    const r = getRefs();
    const d = state.draft;
    const problems = [];

    const day = parseInt(d.dayNumber, 10);
    if (!Number.isInteger(day) || day < 1) {
      problems.push({ section: 'general', field: 'dayNumber', message: 'El número de día debe ser un entero mayor que cero.' });
    } else {
      const duplicate = (AdminApp.getDays() || []).find(
        item => Number(item.dayNumber) === day && item.dbId !== state.dbId
      );
      if (duplicate) {
        problems.push({ section: 'general', field: 'dayNumber', message: `El día ${day} ya existe. Abre esa lección o elige otro número.` });
      }
    }

    if (!trimmed(d.title)) {
      problems.push({ section: 'general', field: 'title', message: 'El título de la lección es obligatorio.' });
    }
    if (!trimmed(d.shortDesc)) {
      problems.push({ section: 'general', field: 'shortDesc', message: 'El resumen breve es obligatorio: es lo que se ve en el índice.' });
    }
    if (trimmed(d.coverImage) && !Utils.safeImageUrl(d.coverImage)) {
      problems.push({ section: 'general', field: 'cover', message: 'La portada no es una ruta de imagen válida.' });
    }

    if (!trimmed(d.objective)) {
      problems.push({ section: 'intro', field: 'objective', message: 'El objetivo del módulo es obligatorio.' });
    }
    if (!trimmed(d.introContent)) {
      problems.push({ section: 'intro', field: 'intro', message: 'La introducción es obligatoria.' });
    }

    d.gallery.forEach((item, index) => {
      if (trimmed(item.image) && !Utils.safeImageUrl(item.image)) {
        problems.push({
          section: 'gallery',
          gallery: index,
          message: `La imagen ${index + 1} no tiene una ruta válida.`
        });
      }
    });

    if (trimmed(d.video.src)) {
      const valid = d.video.type === 'upload'
        ? Boolean(Utils.safeMediaUrl(d.video.src))
        : Boolean(Utils.formatVideoUrl(d.video.src));
      if (!valid) {
        problems.push({
          section: 'video',
          field: 'video',
          message: 'El enlace del video no es válido. Usa YouTube, Vimeo o un archivo MP4/WebM.'
        });
      }
    }

    const quizIssue = quizProblem();
    if (quizIssue) problems.push(quizIssue);

    return problems;
  }

  function showProblem(problem) {
    if (!problem) return;
    const r = getRefs();

    if (state.context === 'lesson') setSection(problem.section, { syncRoute: true });
    clearErrors();

    if (problem.field) {
      const map = {
        dayNumber: [r.dayNumber, r.dayNumberErr],
        title: [r.titleInput, r.titleErr],
        shortDesc: [r.shortDesc, r.shortDescErr],
        cover: [r.coverUrl, r.coverErr],
        objective: [r.objective, r.objectiveErr],
        intro: [r.intro, r.introErr],
        video: [r.videoSrc, r.videoErr]
      };
      const pair = map[problem.field];
      if (pair) {
        const [input, errorEl] = pair;
        if (errorEl) {
          errorEl.textContent = problem.message;
          errorEl.hidden = false;
        }
        if (input) {
          input.setAttribute('aria-invalid', 'true');
          input.focus();
        }
      }
    }

    if (typeof problem.gallery === 'number') {
      state.selected.gallery = problem.gallery;
      renderGallery();
      getRefs().galDetail.querySelector('#galUrl')?.focus();
    }

    if (typeof problem.question === 'number') {
      state.selected.quiz = problem.question;
      renderQuizList();
      renderQuizDetail();
      quizHost().querySelector('#qzText')?.focus();
    }

    Notify.error(problem.message);
  }

  // --------------------------------------------------------------------------
  // GUARDADO
  // --------------------------------------------------------------------------
  function cleanQuiz() {
    return quizItems()
      .filter(q => trimmed(q.q) || q.options.some(o => trimmed(o)))
      .map(q => ({
        q: trimmed(q.q),
        options: q.options.map(o => trimmed(o)),
        correct: q.correct
      }));
  }

  function quizChanged() {
    return JSON.stringify(state.draft.quiz) !== JSON.stringify(state.original.quiz);
  }

  function buildPayload() {
    const d = state.draft;
    return {
      dbId: state.dbId,
      dayNumber: parseInt(d.dayNumber, 10),
      title: trimmed(d.title),
      icon: d.icon,
      shortDesc: trimmed(d.shortDesc),
      coverImage: trimmed(d.coverImage),
      objective: trimmed(d.objective),
      introContent: trimmed(d.introContent),
      sections: {
        // mainTitle no existe como columna: el sitio público usa el título de
        // la lección. Enviar un campo propio aquí lo perdería en silencio.
        theory: {
          subsections: d.theory.subsections
            .filter(s => trimmed(s.subtitle) || trimmed(s.content))
            .map(s => ({ subtitle: trimmed(s.subtitle), content: s.content }))
        },
        gallery: d.gallery
          .filter(g => trimmed(g.image))
          .map(g => ({ image: trimmed(g.image), caption: trimmed(g.caption) })),
        video: {
          type: d.video.type,
          src: trimmed(d.video.src),
          title: trimmed(d.video.title)
        }
      }
    };
  }

  async function save() {
    if (!state.context || state.saving) return;

    const problems = state.context === 'lesson'
      ? validateLesson()
      : (quizProblem() ? [quizProblem()] : []);

    if (problems.length) {
      showProblem(problems[0]);
      return;
    }

    clearErrors();
    setSaving(true);

    try {
      if (state.context === 'final') {
        await DbService.saveFinalQuiz(cleanQuiz());
        state.original = clone(state.draft);
        state.dirty = false;
        renderFinalHeader();
        Notify.success('Cuestionario final guardado.');
        AdminApp.refresh?.();
        return;
      }

      const quizTouched = quizChanged() || state.quizPending;
      let days = await DbService.saveDay(buildPayload());
      let quizError = null;

      if (quizTouched) {
        try {
          await DbService.saveQuiz(parseInt(state.draft.dayNumber, 10), cleanQuiz());
          state.quizPending = false;
        } catch (err) {
          quizError = err;
          state.quizPending = true;
        }
        // Se relee para traer las preguntas recién guardadas a la caché.
        days = await DbService.getAllDays();
      }

      // A partir de aquí la lección existe: los siguientes guardados actualizan.
      state.mode = 'edit';
      state.dayNumber = parseInt(state.draft.dayNumber, 10);
      const saved = (days || []).find(item => Number(item.dayNumber) === state.dayNumber);
      if (saved) state.dbId = saved.dbId;

      state.original = clone(state.draft);
      // Si el cuestionario falló, el trabajo no está guardado del todo: el aviso
      // de cambios pendientes debe seguir visible para poder reintentar.
      state.dirty = Boolean(quizError);

      await AdminApp.refresh(days);
      renderHeader();
      renderNav();
      AdminApp.syncEditorRoute(state.dayNumber, state.section);

      if (quizError) {
        Notify.error('La lección se guardó, pero el cuestionario no: ' + AdminApp.errorMessage(quizError));
      } else {
        Notify.success('Lección guardada.');
      }
    } catch (err) {
      console.error('[Editor] Error al guardar:', err && err.code);
      Notify.error('No se pudo guardar: ' + AdminApp.errorMessage(err));
    } finally {
      setSaving(false);
      updateDirtyUI();
    }
  }

  // --------------------------------------------------------------------------
  // MONTAJE
  // --------------------------------------------------------------------------
  function resetErrors() {
    clearErrors();
  }

  function renderAll() {
    renderHeader();
    renderNav();
    renderCover();
    renderIntroPreview();
    renderTheory();
    renderGallery();
    renderVideo();
    renderQuizPanel();
    setSaving(false);
    updateDirtyUI();
  }

  function mountLesson(dayNumber, section) {
    bind();
    const days = (AdminApp.getDays && AdminApp.getDays()) || [];

    let day = null;
    if (dayNumber !== null && dayNumber !== undefined && dayNumber !== '') {
      day = days.find(item => Number(item.dayNumber) === Number(dayNumber)) || null;
      if (!day) return false;
    }

    state.context = 'lesson';
    state.mode = day ? 'edit' : 'create';
    state.dbId = day ? day.dbId : null;
    state.dayNumber = day ? Number(day.dayNumber) : null;
    state.draft = day ? lessonFromDay(day) : emptyLesson();
    state.original = clone(state.draft);
    state.selected = {
      theory: state.draft.theory.subsections.length ? 0 : null,
      gallery: state.draft.gallery.length ? 0 : null,
      quiz: state.draft.quiz.length ? 0 : null
    };
    state.dirty = false;
    state.saving = false;
    state.quizPending = false;
    state.section = SECTIONS.some(s => s.id === section) ? section : 'general';

    resetErrors();
    fillFields();
    renderAll();
    setSection(state.section);
    return true;
  }

  async function mountFinalQuiz() {
    bind();

    state.context = 'final';
    state.mode = 'edit';
    state.dbId = null;
    state.dayNumber = null;
    state.section = 'quiz';
    state.draft = { quiz: [] };
    state.original = { quiz: [] };
    state.selected = { theory: null, gallery: null, quiz: null };
    state.dirty = false;
    state.saving = false;
    state.quizPending = false;

    const r = getRefs();
    r.finalHost.innerHTML = '<div class="ed-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Cargando preguntas…</div>';
    if (r.finalDirty) r.finalDirty.hidden = true;
    if (r.finalSave) r.finalSave.disabled = true;

    try {
      const finalQuiz = await DbService.getFinalQuiz();
      // Si el administrador ya cambió de vista, no se pinta.
      if (state.context !== 'final') return;
      const questions = (finalQuiz && finalQuiz.questions) || [];
      state.draft = { quiz: questions.map(normalizeQuestion) };
      state.original = clone(state.draft);
      state.selected.quiz = state.draft.quiz.length ? 0 : null;
    } catch (err) {
      Notify.error('No se pudo cargar el cuestionario final: ' + AdminApp.errorMessage(err));
    }

    if (state.context !== 'final') return;
    renderFinalHeader();
    renderQuizPanel();
    setSaving(false);
    updateDirtyUI();
  }

  function renderFinalHeader() {
    const r = getRefs();
    if (!r.finalSub || !state.draft) return;
    const items = quizItems();
    const ready = items.filter(q => questionStatus(q).tone === 'ok').length;
    r.finalSub.textContent = items.length
      ? `${items.length} ${items.length === 1 ? 'pregunta' : 'preguntas'} · ` +
        `${ready} ${ready === 1 ? 'lista' : 'listas'} para el estudiante.`
      : 'Todavía no hay preguntas. Agrega la primera para empezar.';
  }

  function unmount() {
    if (state.theoryEditor) {
      state.theoryEditor.destroy();
      state.theoryEditor = null;
    }
    state.context = null;
    state.draft = null;
    state.original = null;
    state.dirty = false;
    state.saving = false;
    state.quizPending = false;
    state.selected = { theory: null, gallery: null, quiz: null };
  }

  // --------------------------------------------------------------------------
  // EVENTOS ÚNICOS
  // --------------------------------------------------------------------------
  function bind() {
    if (bound) return;
    const r = getRefs();
    bound = true;

    r.dayNumber.addEventListener('input', () => {
      state.draft.dayNumber = r.dayNumber.value;
      markDirty();
      renderHeader();
    });

    r.titleInput.addEventListener('input', () => {
      state.draft.title = r.titleInput.value;
      markDirty();
      renderHeader();
      renderNav();
    });

    r.icon.addEventListener('change', () => {
      state.draft.icon = r.icon.value;
      markDirty();
      renderCover();
      renderNav();
    });

    r.shortDesc.addEventListener('input', () => {
      state.draft.shortDesc = r.shortDesc.value;
      markDirty();
      renderNav();
    });

    r.coverUrl.addEventListener('input', () => {
      state.draft.coverImage = r.coverUrl.value;
      markDirty();
      renderCover();
      renderNav();
    });
    r.coverUpload.addEventListener('click', () => r.coverFile.click());
    r.coverFile.addEventListener('change', async () => {
      try {
        const url = await uploadFile(r.coverFile.files[0], 'covers', MAX_IMAGE_BYTES);
        state.draft.coverImage = url;
        r.coverUrl.value = '';
        markDirty();
        renderCover();
        renderNav();
      } catch (err) {
        fileError(err, 'imagen');
      }
      r.coverFile.value = '';
    });
    r.coverClear.addEventListener('click', () => {
      state.draft.coverImage = '';
      r.coverUrl.value = '';
      markDirty();
      renderCover();
      renderNav();
    });

    r.objective.addEventListener('input', () => {
      state.draft.objective = r.objective.value;
      markDirty();
      renderNav();
    });

    r.intro.addEventListener('input', () => {
      state.draft.introContent = r.intro.value;
      markDirty();
      renderIntroPreview();
      renderNav();
    });

    r.nav.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-section]');
      if (!btn) return;
      setSection(btn.dataset.section, { syncRoute: true });
    });

    r.thList.addEventListener('click', onTheoryListClick);
    r.thDetail.addEventListener('click', onTheoryDetailClick);
    r.thAdd.addEventListener('click', addSubsection);

    r.galGrid.addEventListener('click', onGalleryGridClick);
    r.galDetail.addEventListener('click', onGalleryDetailClick);
    r.galAdd.addEventListener('click', addGalleryItem);

    r.quizHost.addEventListener('click', onQuizClick);
    r.finalHost.addEventListener('click', onQuizClick);

    r.videoType.addEventListener('change', () => {
      state.draft.video.type = r.videoType.value;
      markDirty();
      renderVideo();
    });
    r.videoTitle.addEventListener('input', () => {
      state.draft.video.title = r.videoTitle.value;
      markDirty();
    });
    r.videoSrc.addEventListener('input', () => {
      state.draft.video.src = r.videoSrc.value;
      markDirty();
      renderVideoPreview();
    });
    r.videoUpload.addEventListener('click', () => r.videoFile.click());
    r.videoFile.addEventListener('change', async () => {
      try {
        const url = await uploadFile(r.videoFile.files[0], 'videos', MAX_VIDEO_BYTES);
        state.draft.video.src = url;
        state.draft.video.type = 'upload';
        markDirty();
        renderVideo();
      } catch (err) {
        fileError(err, 'video');
      }
      r.videoFile.value = '';
    });
    r.videoClear.addEventListener('click', () => {
      state.draft.video.src = '';
      markDirty();
      renderVideo();
    });

    r.save.addEventListener('click', save);
    r.finalSave.addEventListener('click', save);

    // Protección ante cierre o recarga con cambios pendientes.
    window.addEventListener('beforeunload', (event) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  // --------------------------------------------------------------------------
  // API PÚBLICA
  // --------------------------------------------------------------------------
  window.LessonEditor = {
    mountLesson,
    mountFinalQuiz,
    unmount,
    isDirty,
    setSection: (id) => setSection(id, { syncRoute: true })
  };
})();
