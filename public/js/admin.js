/* ==========================================================================
   admin.js — Lógica del panel de administración
   --------------------------------------------------------------------------
   Extraído del <script> inline de admin.html para poder aplicar una
   Content-Security-Policy estricta (sin 'unsafe-inline' en script-src).

   REGLAS
   · Ningún dato de la BD se concatena sin pasar por Utils.escapeHtml.
   · Ningún manejador onclick="..." en el HTML: todo se enlaza por JS.
   · La sesión se valida contra Supabase Auth; no hay banderas locales.
   ========================================================================== */

(function () {
  'use strict';

  const escapeHtml = (value) => Utils.escapeHtml(value);
  const safeImageUrl = (value) => Utils.safeImageUrl(value);

  // Límites de subida: los archivos se guardan como data URL en la BD, así que
  // un archivo enorme degrada todas las consultas. Mejor bloquearlo antes.
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;   // 2 MB
  const MAX_VIDEO_BYTES = 20 * 1024 * 1024;  // 20 MB

  /* Mensajes de error de cara al usuario según el código del servicio. */
  const ERROR_MESSAGES = {
    CONNECTION: 'No hay conexión con la base de datos. Revisa tu sesión e inténtalo de nuevo.',
    FORBIDDEN: 'Tu cuenta no tiene permisos de administrador.',
    VALIDATION: 'Los datos enviados no son válidos.',
    DB_ERROR: 'La base de datos rechazó la operación.'
  };

  function describeError(err) {
    if (!err) return ERROR_MESSAGES.DB_ERROR;
    if (err.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code];
    return ERROR_MESSAGES.DB_ERROR;
  }

  // Los iconos SVG de la navbar los pinta js/boot.js.

  document.addEventListener('DOMContentLoaded', () => {
    let currentEditingDayNum = null;
    let currentQuizDayNum = null;
    let tempQuizQuestions = [];

    const tableBody = document.getElementById('adminDaysTableBody');
    const searchInput = document.getElementById('adminSearch');

    // Day Modal
    const dayModal = document.getElementById('dayModal');
    const dayForm = document.getElementById('dayForm');
    const subsectionsContainer = document.getElementById('subsectionsContainer');
    const galleryContainer = document.getElementById('galleryContainer');

    // Video Controls
    const videoTypeSelect = document.getElementById('videoType');
    const videoUrlGroup = document.getElementById('videoUrlGroup');
    const videoUploadGroup = document.getElementById('videoUploadGroup');
    const videoFileInput = document.getElementById('videoFileInput');
    const videoDataUrlInput = document.getElementById('videoDataUrl');
    const videoFileNameLabel = document.getElementById('videoFileName');

    // Quiz Modal
    const quizModal = document.getElementById('quizModal');
    const quizList = document.getElementById('quizQuestionsList');

    let cachedDays = [];

    // ------------------------------------------------------------------------
    // SUBIDA DE ARCHIVOS (imagen / video) → data URL con límite de tamaño
    // ------------------------------------------------------------------------
    function readFileAsDataUrl(file, maxBytes, targetInput, labelEl, okText) {
      if (!file) return;
      if (file.size > maxBytes) {
        alert(
          `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ` +
          `${Math.round(maxBytes / 1024 / 1024)} MB.\n\n` +
          'Usa un enlace externo (URL) en lugar de subir el archivo: mantiene la base de datos ligera.'
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        targetInput.value = evt.target.result;
        if (labelEl) labelEl.textContent = okText || file.name;
      };
      reader.onerror = () => alert('No se pudo leer el archivo seleccionado.');
      reader.readAsDataURL(file);
    }

    videoTypeSelect.addEventListener('change', () => {
      const isUpload = videoTypeSelect.value === 'upload';
      videoUrlGroup.style.display = isUpload ? 'none' : 'block';
      videoUploadGroup.style.display = isUpload ? 'block' : 'none';
    });

    videoFileInput.addEventListener('change', (e) => {
      readFileAsDataUrl(e.target.files[0], MAX_VIDEO_BYTES, videoDataUrlInput, videoFileNameLabel);
    });

    const btnUploadVideo = document.getElementById('btnUploadVideo');
    if (btnUploadVideo) btnUploadVideo.addEventListener('click', () => videoFileInput.click());

    // ------------------------------------------------------------------------
    // DASHBOARD
    // ------------------------------------------------------------------------
    async function renderDashboard() {
      cachedDays = await DbService.getAllDays();
      let totalSubsections = 0;
      let totalGalleryItems = 0;
      let totalQuizzes = 0;

      cachedDays.forEach(d => {
        const sec = d.sections || {};
        if (sec.theory && sec.theory.subsections) totalSubsections += sec.theory.subsections.length;
        if (sec.gallery) totalGalleryItems += sec.gallery.length;
        if (sec.quiz) totalQuizzes += sec.quiz.length;
      });

      const finalQuiz = await DbService.getFinalQuiz();

      document.getElementById('statDays').textContent = cachedDays.length;
      document.getElementById('statSubsections').textContent = totalSubsections;
      document.getElementById('statGalleryItems').textContent = totalGalleryItems;
      document.getElementById('statQuizzes').textContent = totalQuizzes;
      document.getElementById('statFinalQuizCount').textContent = finalQuiz ? finalQuiz.length : 0;

      renderTable();
    }

    function renderTable() {
      const days = cachedDays;
      const q = searchInput.value.trim().toLowerCase();
      let html = '';

      days.forEach(d => {
        const textMatch = !q ||
          String(d.dayNumber).includes(q) ||
          String(d.title).toLowerCase().includes(q) ||
          String(d.shortDesc || '').toLowerCase().includes(q);
        if (!textMatch) return;

        const sec = d.sections || {};
        const subCount = (sec.theory && sec.theory.subsections) ? sec.theory.subsections.length : 0;
        const galCount = sec.gallery ? sec.gallery.length : 0;
        const quizCount = sec.quiz ? sec.quiz.length : 0;

        html += `
          <tr>
            <td><span class="badge badge--level">Día ${escapeHtml(d.dayNumber)}</span></td>
            <td><span class="m-icon-sm m-icon-sm--table">${Utils.safeIcon(d.icon)}</span></td>
            <td>
              <div class="table-day-title">${escapeHtml(d.title)}</div>
              <small class="table-day-desc">${escapeHtml(d.shortDesc || '')}</small>
            </td>
            <td><span class="badge">${subCount} subsecciones</span></td>
            <td><span class="badge">${galCount} imágenes</span></td>
            <td><span class="badge">${quizCount} preguntas</span></td>
            <td>
              <div class="table-actions">
                <button type="button" class="btn btn--outline btn--sm" data-action="edit" data-day="${escapeHtml(d.dayNumber)}"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                <button type="button" class="btn btn--outline btn--sm" data-action="quiz" data-day="${escapeHtml(d.dayNumber)}"><i class="fa-solid fa-circle-question"></i> Cuestionario</button>
                <button type="button" class="btn btn--ghost btn--sm btn--danger-ghost" data-action="delete" data-day="${escapeHtml(d.dayNumber)}" aria-label="Eliminar día ${escapeHtml(d.dayNumber)}"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </td>
          </tr>
        `;
      });

      if (!html) {
        html = `<tr><td colspan="7" class="table-empty">No se encontraron días que coincidan con la búsqueda.</td></tr>`;
      }

      tableBody.innerHTML = html;

      tableBody.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => openDayModal(btn.dataset.day, btn));
      });

      tableBody.querySelectorAll('[data-action="quiz"]').forEach(btn => {
        btn.addEventListener('click', () => openQuizModal(btn.dataset.day));
      });

      tableBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const day = btn.dataset.day;
          if (!confirm(`¿Estás seguro de que deseas eliminar el Día ${day}?\nEsta acción no se puede deshacer.`)) return;
          try {
            await DbService.deleteDay(day);
            await renderDashboard();
          } catch (err) {
            alert('No se pudo eliminar el día.\n\n' + describeError(err));
          }
        });
      });
    }

    searchInput.addEventListener('input', renderTable);

    // ------------------------------------------------------------------------
    // EDITOR DE TEXTO ENRIQUECIDO (subsecciones)
    // ------------------------------------------------------------------------
    function wrapSelection(ta, marker) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const val = ta.value;
      const sel = val.slice(s, e) || 'texto';
      ta.value = val.slice(0, s) + marker + sel + marker + val.slice(e);
      ta.selectionStart = s + marker.length;
      ta.selectionEnd = s + marker.length + sel.length;
      ta.focus();
    }

    function prefixLines(ta, prefix) {
      const val = ta.value;
      const s = ta.selectionStart, e = ta.selectionEnd;
      let from = val.lastIndexOf('\n', s - 1) + 1;
      let to = val.indexOf('\n', e);
      if (to === -1) to = val.length;

      const block = val.slice(from, to);
      const numbered = /^\d+\.\s$/.test(prefix);
      const newBlock = block.split('\n').map((ln, i) => {
        const clean = ln.replace(/^(\s*)([-•·–]|#{2,4}|>|\d+[.)])\s+/, '$1');
        return (numbered ? (i + 1) + '. ' : prefix) + clean;
      }).join('\n');

      ta.value = val.slice(0, from) + newBlock + val.slice(to);
      ta.selectionStart = from;
      ta.selectionEnd = from + newBlock.length;
      ta.focus();
    }

    function insertText(ta, text) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.focus();
    }

    let subSeq = 0;

    function refreshSubsectionOrder() {
      const items = subsectionsContainer.querySelectorAll('.sub-item');
      items.forEach((item, i) => {
        const idx = item.querySelector('[data-sub-index]');
        if (idx) idx.textContent = String(i + 1).padStart(2, '0');
        const up = item.querySelector('[data-move="up"]');
        const down = item.querySelector('[data-move="down"]');
        if (up) up.disabled = i === 0;
        if (down) down.disabled = i === items.length - 1;
      });
      const count = document.getElementById('subCount');
      if (count) {
        count.textContent = items.length === 1 ? '1 subsección' : `${items.length} subsecciones`;
      }
    }

    /* Contrae o expande sin tocar el contenido (los valores siguen en el DOM). */
    function setSubsectionOpen(item, open) {
      item.classList.toggle('is-open', open);
      const btn = item.querySelector('[data-toggle]');
      if (!btn) return;
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Contraer subsección' : 'Expandir subsección');
      btn.title = open ? 'Contraer' : 'Expandir';
      const icon = btn.querySelector('i');
      if (icon) icon.className = open ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    }

    function moveSubsection(item, delta) {
      const items = Array.from(subsectionsContainer.querySelectorAll('.sub-item'));
      const i = items.indexOf(item);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= items.length) return;

      if (delta < 0) subsectionsContainer.insertBefore(item, items[j]);
      else subsectionsContainer.insertBefore(item, items[j].nextSibling);

      refreshSubsectionOrder();
      markDirty();

      const btn = item.querySelector(delta < 0 ? '[data-move="up"]' : '[data-move="down"]');
      if (btn) btn.focus();
    }

    function removeSubsection(item) {
      const title = (item.querySelector('.sub-subtitle')?.value || '').trim();
      const content = (item.querySelector('.sub-content')?.value || '').trim();
      if ((title || content) && !confirm('¿Eliminar esta subsección y todo su contenido?\nEsta acción no se puede deshacer.')) {
        return;
      }
      item.remove();
      refreshSubsectionOrder();
      markDirty();
    }

    let draggedSub = null;

    function bindSubsectionDrag(item) {
      const handle = item.querySelector('.sub-drag');
      if (!handle) return;

      handle.addEventListener('dragstart', (e) => {
        draggedSub = item;
        item.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', ''); } catch (_) { /* Firefox */ }
      });

      handle.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        subsectionsContainer.querySelectorAll('.sub-item').forEach(el => {
          el.classList.remove('is-drop-before', 'is-drop-after');
        });
        draggedSub = null;
        refreshSubsectionOrder();
        markDirty();
      });

      item.addEventListener('dragover', (e) => {
        if (!draggedSub || draggedSub === item) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = item.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        subsectionsContainer.querySelectorAll('.sub-item').forEach(el => {
          el.classList.remove('is-drop-before', 'is-drop-after');
        });
        item.classList.add(after ? 'is-drop-after' : 'is-drop-before');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('is-drop-before', 'is-drop-after');
      });

      item.addEventListener('drop', (e) => {
        if (!draggedSub || draggedSub === item) return;
        e.preventDefault();
        const rect = item.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        item.classList.remove('is-drop-before', 'is-drop-after');
        if (after) subsectionsContainer.insertBefore(draggedSub, item.nextSibling);
        else subsectionsContainer.insertBefore(draggedSub, item);
        refreshSubsectionOrder();
        markDirty();
      });
    }

    function addSubsectionRow(subtitle = '', content = '', opts = {}) {
      const card = document.createElement('div');
      card.className = 'dynamic-card-item sub-item';
      const uid = 'sub-body-' + (++subSeq);

      card.innerHTML = `
        <div class="sub-head">
          <button type="button" class="sub-drag" draggable="true" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar">
            <i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <span class="sub-index" data-sub-index>00</span>
          <input type="text" class="sub-subtitle sub-title" placeholder="Título de la subsección"
                 aria-label="Título de la subsección" value="${escapeHtml(subtitle)}">
          <div class="sub-actions">
            <button type="button" class="sub-btn" data-move="up" aria-label="Mover arriba" title="Mover arriba"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="sub-btn" data-move="down" aria-label="Mover abajo" title="Mover abajo"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="sub-btn" data-toggle aria-expanded="true" aria-controls="${uid}" aria-label="Contraer subsección" title="Contraer"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
            <button type="button" class="sub-btn sub-btn--danger" data-remove aria-label="Eliminar subsección" title="Eliminar subsección"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
          </div>
        </div>
        <div class="sub-body" id="${uid}">
          <div class="sub-editor">
            <div class="sub-toolbar" role="toolbar" aria-label="Formato del texto">
              <div class="sub-fmt">
                <div class="sub-tool-group">
                  <button type="button" class="sub-tool" data-fmt="bold" title="Negrita (**texto**)" aria-label="Negrita"><b>B</b></button>
                  <button type="button" class="sub-tool" data-fmt="italic" title="Cursiva (*texto*)" aria-label="Cursiva"><i>I</i></button>
                  <button type="button" class="sub-tool" data-fmt="heading" title="Subtítulo interno (## texto)" aria-label="Subtítulo interno">H</button>
                </div>
                <span class="sub-tool-sep" aria-hidden="true"></span>
                <div class="sub-tool-group">
                  <button type="button" class="sub-tool" data-fmt="ul" title="Lista con viñetas (- texto)" aria-label="Lista con viñetas">&#8226;</button>
                  <button type="button" class="sub-tool" data-fmt="ol" title="Lista numerada (1. texto)" aria-label="Lista numerada">1.</button>
                  <button type="button" class="sub-tool" data-fmt="note" title="Nota destacada (&gt; texto)" aria-label="Nota destacada">!</button>
                  <button type="button" class="sub-tool" data-fmt="hr" title="Separador (---)" aria-label="Separador">&mdash;</button>
                </div>
              </div>
              <div class="sub-mode" role="group" aria-label="Modo de edición">
                <button type="button" class="sub-mode-btn is-active" data-mode="edit">Editar</button>
                <button type="button" class="sub-mode-btn" data-mode="preview">Vista previa</button>
              </div>
            </div>
            <textarea class="sub-content" rows="12" placeholder="Contenido o explicación detallada...">${escapeHtml(content)}</textarea>
            <div class="sub-preview" aria-live="polite"></div>
          </div>
        </div>
      `;

      const ta = card.querySelector('.sub-content');
      const preview = card.querySelector('.sub-preview');
      const editor = card.querySelector('.sub-editor');
      const modeBtns = card.querySelectorAll('.sub-mode-btn');

      function setMode(mode) {
        const isPreview = mode === 'preview';
        editor.classList.toggle('is-previewing', isPreview);
        modeBtns.forEach(b => b.classList.toggle('is-active', b.dataset.mode === mode));
        if (isPreview) preview.innerHTML = RichText.render(ta.value);
        else ta.focus();
      }

      modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

      card.querySelectorAll('.sub-tool[data-fmt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const fmt = btn.dataset.fmt;
          if (fmt === 'bold') wrapSelection(ta, '**');
          else if (fmt === 'italic') wrapSelection(ta, '*');
          else if (fmt === 'heading') prefixLines(ta, '## ');
          else if (fmt === 'ul') prefixLines(ta, '- ');
          else if (fmt === 'ol') prefixLines(ta, '1. ');
          else if (fmt === 'note') prefixLines(ta, '> ');
          else if (fmt === 'hr') insertText(ta, '\n---\n');
          markDirty();
        });
      });

      card.querySelector('[data-toggle]').addEventListener('click', (e) => {
        e.stopPropagation();
        setSubsectionOpen(card, !card.classList.contains('is-open'));
      });
      card.querySelector('[data-remove]').addEventListener('click', () => removeSubsection(card));
      card.querySelector('[data-move="up"]').addEventListener('click', () => moveSubsection(card, -1));
      card.querySelector('[data-move="down"]').addEventListener('click', () => moveSubsection(card, 1));

      // Clic en la cabecera (fuera del título y los botones) alterna el acordeón.
      card.querySelector('.sub-head').addEventListener('click', (e) => {
        if (e.target.closest('input, button')) return;
        setSubsectionOpen(card, !card.classList.contains('is-open'));
      });

      bindSubsectionDrag(card);

      subsectionsContainer.appendChild(card);
      setSubsectionOpen(card, opts.open === true);
      refreshSubsectionOrder();

      if (opts.focus) card.querySelector('.sub-subtitle').focus();
      return card;
    }

    document.getElementById('btnAddSubsection').addEventListener('click', () => {
      const card = addSubsectionRow('', '', { open: true, focus: true });
      markDirty();
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // ------------------------------------------------------------------------
    // GALERÍA
    // ------------------------------------------------------------------------
    function addGalleryRow(image = '', caption = '') {
      const card = document.createElement('div');
      card.className = 'dynamic-card-item gallery-row-item';
      card.style.cssText = 'background:var(--c-surface); border:1px solid var(--c-border); padding:1rem; border-radius:var(--radius-m); margin-bottom:0.8rem;';
      card.innerHTML = `
        <div class="dynamic-card-head">
          <strong>Elemento de Galería</strong>
          <button type="button" class="btn btn--ghost btn--sm btn--danger-ghost" data-remove-gallery>&times; Eliminar</button>
        </div>
        <div class="form-group form-group--tight">
          <label class="label-sm">Imagen (URL o Subir archivo)</label>
          <div class="input-inline-row">
            <input type="text" class="gal-image-url" placeholder="URL de la imagen o deja en blanco para ilustración por defecto" value="${escapeHtml(image)}">
            <input type="file" accept="image/*" class="gal-file-input file-input-hidden">
            <button type="button" class="btn btn--outline btn--sm" data-upload-gallery><i class="fa-solid fa-upload"></i> Subir</button>
          </div>
        </div>
        <div class="form-group form-group--flush">
          <label class="label-sm">Explicación / Texto Inferior (Caption)</label>
          <textarea class="gal-caption" rows="2" placeholder="Explicación detallada del componente mostrado...">${escapeHtml(caption)}</textarea>
        </div>
      `;

      const fileInput = card.querySelector('.gal-file-input');
      const urlInput = card.querySelector('.gal-image-url');

      card.querySelector('[data-remove-gallery]').addEventListener('click', () => {
        card.remove();
        markDirty();
      });

      card.querySelector('[data-upload-gallery]').addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        readFileAsDataUrl(e.target.files[0], MAX_IMAGE_BYTES, urlInput);
        markDirty();
      });

      galleryContainer.appendChild(card);
    }

    document.getElementById('btnAddGalleryItem').addEventListener('click', () => addGalleryRow());

    // PORTADA DEL MÓDULO (ruta/URL o archivo local)
    const coverUrlInput = document.getElementById('dayCoverUrl');
    const coverFileInput = document.getElementById('dayCoverFile');
    document.getElementById('btnUploadCover').addEventListener('click', () => coverFileInput.click());
    coverFileInput.addEventListener('change', (e) => {
      readFileAsDataUrl(e.target.files[0], MAX_IMAGE_BYTES, coverUrlInput);
    });

    // --- Estado de cambios sin guardar ---
    let isDirty = false;
    let suppressDirty = false;
    let lastFocusedEl = null;

    function markDirty() {
      if (suppressDirty) return;
      isDirty = true;
      const badge = document.getElementById('dayDirtyBadge');
      if (badge) badge.classList.add('is-visible');
    }

    function clearDirty() {
      isDirty = false;
      const badge = document.getElementById('dayDirtyBadge');
      if (badge) badge.classList.remove('is-visible');
    }

    dayForm.addEventListener('input', markDirty);
    dayForm.addEventListener('change', markDirty);

    // ------------------------------------------------------------------------
    // MODAL DE DÍA
    // ------------------------------------------------------------------------
    function openDayModal(dayNum = null, triggerEl = null) {
      lastFocusedEl = triggerEl || document.activeElement;
      suppressDirty = true;
      currentEditingDayNum = dayNum;
      subsectionsContainer.innerHTML = '';
      galleryContainer.innerHTML = '';
      videoFileNameLabel.textContent = '';
      videoDataUrlInput.value = '';

      if (dayNum) {
        document.getElementById('dayModalTitle').textContent = `Editar Día ${dayNum}`;
        const day = cachedDays.find(d => String(d.dayNumber) === String(dayNum));
        if (day) {
          document.getElementById('dayNumber').value = day.dayNumber;
          document.getElementById('dayTitle').value = day.title;
          document.getElementById('dayIcon').value = day.icon || 'tools';
          document.getElementById('dayShortDesc').value = day.shortDesc || '';
          document.getElementById('dayCoverUrl').value = day.coverImage || '';
          document.getElementById('dayObjective').value = day.objective || '';
          document.getElementById('dayIntroContent').value = day.introContent || '';

          const sec = day.sections || {};
          const theory = sec.theory || {};
          document.getElementById('theoryMainTitle').value = theory.mainTitle || '';

          if (theory.subsections && theory.subsections.length) {
            theory.subsections.forEach(s => addSubsectionRow(s.subtitle, s.content));
            // Se abre solo la primera para no convertir el formulario en un muro.
            const firstSub = subsectionsContainer.querySelector('.sub-item');
            if (firstSub) setSubsectionOpen(firstSub, true);
          } else {
            addSubsectionRow('', '', { open: true });
          }

          if (sec.gallery && sec.gallery.length) {
            sec.gallery.forEach(g => addGalleryRow(g.image, g.caption));
          } else {
            addGalleryRow();
          }

          const vid = sec.video || {};
          document.getElementById('videoTitle').value = vid.title || '';
          videoTypeSelect.value = vid.type || 'url';
          videoTypeSelect.dispatchEvent(new Event('change'));
          if (vid.type === 'upload') {
            videoDataUrlInput.value = vid.src || '';
            if (vid.src) videoFileNameLabel.textContent = 'Archivo de video cargado';
          } else {
            document.getElementById('videoSrcUrl').value = vid.src || '';
          }
        }
      } else {
        document.getElementById('dayModalTitle').textContent = 'Crear Nuevo Día / Lección';
        dayForm.reset();
        document.getElementById('dayCoverUrl').value = '';
        document.getElementById('dayCoverFile').value = '';
        document.getElementById('dayObjective').value = '';
        document.getElementById('dayIntroContent').value = '';
        const nextNum = cachedDays.length ? Math.max(...cachedDays.map(d => d.dayNumber)) + 1 : 1;
        document.getElementById('dayNumber').value = nextNum;
        videoTypeSelect.value = 'url';
        videoTypeSelect.dispatchEvent(new Event('change'));

        addSubsectionRow('1. Conceptos Fundamentales', 'Escribe aquí la explicación teórica...', { open: true });
        addGalleryRow('', 'Figura 1.1 — Descripción del componente.');
      }

      const subtitle = document.getElementById('dayModalSubtitle');
      if (subtitle) {
        subtitle.textContent = dayNum
          ? 'Modifica los datos y el contenido de este módulo.'
          : 'Completa los datos del módulo y su contenido educativo.';
      }

      dayModal.classList.add('is-open');
      suppressDirty = false;
      clearDirty();

      const shell = dayModal.querySelector('.admin-modal-content');
      if (shell) setTimeout(() => shell.focus(), 40);
    }

    function closeDayModal() {
      dayModal.classList.remove('is-open');
      clearDirty();
      if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
        lastFocusedEl.focus();
      }
    }

    function requestCloseDayModal() {
      if (isDirty && !confirm('Tienes cambios sin guardar en este módulo.\n¿Cerrar el editor y descartarlos?')) {
        return;
      }
      closeDayModal();
    }

    document.getElementById('btnNewDay').addEventListener('click', (e) => openDayModal(null, e.currentTarget));
    document.getElementById('btnNewDayNav').addEventListener('click', (e) => openDayModal(null, e.currentTarget));
    document.getElementById('closeDayModal').addEventListener('click', requestCloseDayModal);
    document.getElementById('cancelDayModal').addEventListener('click', requestCloseDayModal);

    // Cerrar con Esc o con clic en el fondo (siempre con aviso si hay cambios)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dayModal.classList.contains('is-open')) {
        e.preventDefault();
        requestCloseDayModal();
      }
    });
    dayModal.addEventListener('click', (e) => {
      if (e.target === dayModal) requestCloseDayModal();
    });

    // Retención de foco dentro del modal mientras está abierto
    dayModal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(dayModal.querySelectorAll(
        'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    // SUBMIT FORMULARIO DE DÍA
    dayForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dayNumber = parseInt(document.getElementById('dayNumber').value, 10);
      const title = document.getElementById('dayTitle').value.trim();
      const icon = document.getElementById('dayIcon').value;
      const shortDesc = document.getElementById('dayShortDesc').value.trim();
      const coverImage = document.getElementById('dayCoverUrl').value.trim();
      const objective = document.getElementById('dayObjective').value.trim();
      const introContent = document.getElementById('dayIntroContent').value.trim();
      const theoryMainTitle = document.getElementById('theoryMainTitle').value.trim();

      if (!Number.isInteger(dayNumber) || dayNumber < 1) {
        alert('El número de día debe ser un entero mayor que cero.');
        return;
      }
      if (!title) {
        alert('El título de la lección es obligatorio.');
        return;
      }

      const subsections = [];
      subsectionsContainer.querySelectorAll('.dynamic-card-item').forEach(card => {
        const sub = card.querySelector('.sub-subtitle').value.trim();
        const cnt = card.querySelector('.sub-content').value.trim();
        if (sub || cnt) subsections.push({ subtitle: sub, content: cnt });
      });

      const gallery = [];
      galleryContainer.querySelectorAll('.gallery-row-item').forEach(card => {
        const img = card.querySelector('.gal-image-url').value.trim();
        const cap = card.querySelector('.gal-caption').value.trim();
        if (img) gallery.push({ image: img, caption: cap });
      });

      const vType = videoTypeSelect.value;
      const vTitle = document.getElementById('videoTitle').value.trim();
      const rawSrc = vType === 'upload' ? videoDataUrlInput.value : document.getElementById('videoSrcUrl').value.trim();

      if (vType === 'url' && rawSrc && !Utils.formatVideoUrl(rawSrc)) {
        alert('El enlace de video no es válido.\n\nUsa un enlace de YouTube, Vimeo o un archivo MP4/WebM.');
        return;
      }

      // Retrieve existing quiz if available
      const existingDay = cachedDays.find(d => String(d.dayNumber) === String(dayNumber));
      const existingQuiz = (existingDay && existingDay.sections && existingDay.sections.quiz) ? existingDay.sections.quiz : [];

      const dayObj = {
        id: `day-${dayNumber}`,
        dayNumber,
        title,
        icon,
        coverImage,
        shortDesc,
        objective,
        introContent,
        sections: {
          theory: { mainTitle: theoryMainTitle || title, subsections },
          gallery,
          video: { type: vType, src: rawSrc, title: vTitle },
          quiz: existingQuiz
        }
      };

      const submitBtn = dayForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando en Base de Datos...';
        await DbService.saveDay(dayObj);
        closeDayModal();
        await renderDashboard();
      } catch (err) {
        console.error('[Admin] Error al guardar el día:', err && err.code);
        alert('No se pudo guardar la lección.\n\n' + describeError(err));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    // ------------------------------------------------------------------------
    // MODAL DE CUESTIONARIO
    // ------------------------------------------------------------------------
    async function openQuizModal(dayNum) {
      currentQuizDayNum = dayNum;
      if (dayNum === 'FINAL') {
        document.getElementById('quizModalTitle').textContent = 'Cuestionario Final del Curso (Evaluación Global de Certificación)';
        const fQuiz = await DbService.getFinalQuiz();
        tempQuizQuestions = JSON.parse(JSON.stringify(fQuiz || []));
      } else {
        const day = cachedDays.find(d => String(d.dayNumber) === String(dayNum));
        if (!day) return;
        document.getElementById('quizModalTitle').textContent = `Cuestionario del Día ${day.dayNumber}: ${day.title}`;
        tempQuizQuestions = JSON.parse(JSON.stringify((day.sections && day.sections.quiz) || []));
      }

      renderQuizQuestions();
      quizModal.classList.add('is-open');
    }

    const btnManageFinalQuiz = document.getElementById('btnManageFinalQuiz');
    const cardFinalQuiz = document.getElementById('cardFinalQuiz');
    if (btnManageFinalQuiz) btnManageFinalQuiz.addEventListener('click', () => openQuizModal('FINAL'));
    if (cardFinalQuiz) cardFinalQuiz.addEventListener('click', () => openQuizModal('FINAL'));

    function renderQuizQuestions() {
      if (!tempQuizQuestions.length) {
        quizList.innerHTML = `<p class="quiz-empty-msg">Este cuestionario aún no tiene preguntas configuradas.</p>`;
        return;
      }

      quizList.innerHTML = tempQuizQuestions.map((qObj, qIdx) => `
        <div class="quiz-q-card">
          <div class="quiz-q-head">
            <strong>Pregunta ${qIdx + 1}</strong>
            <button type="button" class="btn btn--ghost btn--sm btn--danger-ghost" data-delete-q="${qIdx}">&times; Eliminar Pregunta</button>
          </div>
          <div class="form-group">
            <input type="text" value="${escapeHtml(qObj.q || '')}" data-q-title="${qIdx}" placeholder="Enunciado de la pregunta..." class="input-full">
          </div>
          <div class="quiz-options-grid">
            ${(qObj.options || ['', '', '', '']).map((opt, oIdx) => `
              <div class="quiz-opt-row">
                <input type="radio" name="correct_${qIdx}" value="${oIdx}" ${qObj.correct === oIdx ? 'checked' : ''} data-correct-radio="${qIdx}">
                <input type="text" value="${escapeHtml(opt)}" data-opt-text="${qIdx}_${oIdx}" placeholder="Opción ${oIdx + 1}" class="input-flex">
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      quizList.querySelectorAll('[data-delete-q]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.deleteQ, 10);
          tempQuizQuestions.splice(idx, 1);
          renderQuizQuestions();
        });
      });
    }

    document.getElementById('btnAddQuizQuestion').addEventListener('click', () => {
      tempQuizQuestions.push({
        q: '',
        options: ['', '', '', ''],
        correct: 0
      });
      renderQuizQuestions();
    });

    document.getElementById('saveQuizBtn').addEventListener('click', async () => {
      // Se leen los valores del DOM antes de validar.
      tempQuizQuestions.forEach((qObj, qIdx) => {
        const titleInput = quizList.querySelector(`[data-q-title="${qIdx}"]`);
        if (titleInput) qObj.q = titleInput.value.trim();

        for (let oIdx = 0; oIdx < 4; oIdx++) {
          const optInput = quizList.querySelector(`[data-opt-text="${qIdx}_${oIdx}"]`);
          if (optInput) qObj.options[oIdx] = optInput.value.trim();
        }

        const checkedRadio = quizList.querySelector(`[data-correct-radio="${qIdx}"]:checked`);
        if (checkedRadio) qObj.correct = parseInt(checkedRadio.value, 10);
      });

      // Validación mínima: sin enunciado ni dos opciones la pregunta es inútil.
      const invalid = tempQuizQuestions.some(q =>
        !q.q || (q.options || []).filter(o => o && o.trim()).length < 2
      );
      if (invalid) {
        alert('Cada pregunta necesita un enunciado y al menos dos opciones con texto.');
        return;
      }

      const saveQuizBtnEl = document.getElementById('saveQuizBtn');
      const origText = saveQuizBtnEl.textContent;
      try {
        saveQuizBtnEl.disabled = true;
        saveQuizBtnEl.textContent = 'Guardando en Base de Datos...';
        if (currentQuizDayNum === 'FINAL') {
          await DbService.saveFinalQuiz(tempQuizQuestions);
        } else {
          await DbService.saveQuiz(currentQuizDayNum, tempQuizQuestions);
        }
        quizModal.classList.remove('is-open');
        await renderDashboard();
      } catch (err) {
        console.error('[Admin] Error al guardar el cuestionario:', err && err.code);
        alert('No se pudo guardar el cuestionario.\n\n' + describeError(err));
      } finally {
        saveQuizBtnEl.disabled = false;
        saveQuizBtnEl.textContent = origText;
      }
    });

    document.getElementById('closeQuizModal').addEventListener('click', () => quizModal.classList.remove('is-open'));
    document.getElementById('cancelQuizModal').addEventListener('click', () => quizModal.classList.remove('is-open'));

    // Sincronizar datos desde la BD
    document.getElementById('btnResetData').addEventListener('click', async () => {
      if (!confirm('¿Recargar los datos desde la base de datos de Supabase?')) return;
      await renderDashboard();
    });

    // ------------------------------------------------------------------------
    // AUTENTICACIÓN
    // ------------------------------------------------------------------------
    const loginOverlay = document.getElementById('adminLoginOverlay');
    const loginForm = document.getElementById('adminLoginForm');
    const loginError = document.getElementById('loginErrorMsg');
    const logoutBtn = document.getElementById('btnLogoutAdmin');

    /* La sesión depende exclusivamente de Supabase Auth. No se consulta
       sessionStorage ni localStorage: eran falsificables desde DevTools. */
    async function checkAuth() {
      const session = await DbService.getSession();
      const isAdmin = Boolean(session && session.isAdmin);

      if (isAdmin) {
        loginOverlay.classList.add('is-hidden');
        document.body.classList.remove('is-locked');
        await renderDashboard();
      } else {
        if (session && !session.isAdmin) {
          await DbService.logout();
        }
        loginOverlay.classList.remove('is-hidden');
        document.body.classList.add('is-locked');
        loginError.classList.remove('is-visible');
        cachedDays = [];
        renderTable();
      }
      return isAdmin;
    }

    if (loginForm) {
      // Mensajes genéricos: no se revela si falló el usuario, la contraseña,
      // la configuración del servidor ni si la cuenta existe.
      const MENSAJES_ERROR = {
        INVALID_CREDENTIALS: 'Credenciales incorrectas. Inténtalo de nuevo.',
        CONNECTION: 'No se pudo iniciar sesión en este momento. Inténtalo más tarde.'
      };

      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;

        loginError.classList.remove('is-visible');

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const textoOriginal = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';

        const { user: authUser, error } = await DbService.login(email, pass);

        submitBtn.disabled = false;
        submitBtn.innerHTML = textoOriginal;

        if (authUser) {
          loginError.classList.remove('is-visible');
          loginForm.reset();
          await checkAuth();
        } else {
          const mensaje = MENSAJES_ERROR[error && error.code] || MENSAJES_ERROR.INVALID_CREDENTIALS;
          loginError.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(mensaje)}`;
          loginError.classList.add('is-visible');
          document.getElementById('loginPass').value = '';
          document.getElementById('loginPass').focus();
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await DbService.logout();
        await checkAuth();
      });
    }

    checkAuth();
  });
})();
