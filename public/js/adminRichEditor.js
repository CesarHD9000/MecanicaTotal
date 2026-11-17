/* ==========================================================================
   adminRichEditor.js — Editor visual del contenido teórico
   --------------------------------------------------------------------------
   La base de datos sigue guardando TEXTO PLANO con el marcado ligero que
   entiende richText.js. Este módulo lo edita como un documento normal: la
   barra escribe ese marcado por ti y al cargar se vuelve a leer con
   RichText.render.

   Nunca se guarda HTML: `getValue()` devuelve el mismo texto de siempre, así
   que el sitio del estudiante, el contenido ya guardado y la vista previa
   siguen funcionando sin cambios.

   Modelo de bloques soportado (el mismo del renderizador):
     párrafo · título (##) · subtítulo (###) · cita/nota (>) con tipo
     listas (viñetas, numeradas, tareas) · tabla · imagen con pie · separador
   Marcas en línea: negrita, cursiva, subrayado, tachado, resaltado, código
   y enlaces.
   ========================================================================== */

const RichEditor = (() => {

  // ------------------------------------------------------------------------
  // UTILIDADES
  // ------------------------------------------------------------------------
  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /* Envuelve el texto con un marcador sin dejar espacios dentro del marcado
     ("** texto **" no lo entiende el renderizador). */
  function wrapMark(marker, inner) {
    const core = inner.trim();
    if (!core) return inner;
    const lead = inner.match(/^\s*/)[0];
    const trail = inner.match(/\s*$/)[0];
    return `${lead}${marker}${core}${marker}${trail}`;
  }

  function textToLines(text) {
    return String(text)
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  function isBlockTag(tag) {
    return /^(P|DIV|SECTION|ARTICLE|UL|OL|TABLE|FIGURE|BLOCKQUOTE|HR|H[1-6])$/.test(tag);
  }

  function makeCheck(done) {
    const span = document.createElement('span');
    span.className = 're-check';
    span.contentEditable = 'false';
    span.setAttribute('role', 'checkbox');
    span.setAttribute('aria-checked', done ? 'true' : 'false');
    span.tabIndex = 0;
    span.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
    return span;
  }

  // ------------------------------------------------------------------------
  // MARCADO -> DOCUMENTO EDITABLE
  // ------------------------------------------------------------------------
  function toEditable(markdown) {
    const tpl = document.createElement('template');
    tpl.innerHTML = window.RichText ? RichText.render(markdown) : '';

    // Tablas: fuera el marco con el aviso de deslizamiento; queda la tabla.
    tpl.content.querySelectorAll('.rt-table-block').forEach(block => {
      const table = block.querySelector('table');
      if (!table) { block.remove(); return; }
      block.querySelectorAll('.rt-table-hint').forEach(node => node.remove());
      const holder = table.closest('.rt-table-wrap') || block;
      holder.replaceWith(table);
      table.classList.add('rt-table');
    });

    // Listas de tareas: el marcador del sitio (icono + texto oculto) se
    // sustituye por una casilla real, clicable y accesible.
    tpl.content.querySelectorAll('ul.rt-checklist').forEach(list => {
      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        const done = li.classList.contains('is-done');
        li.dataset.done = done ? '1' : '0';
        li.classList.remove('is-done');
        li.querySelectorAll('.rt-check-icon, .rt-sr').forEach(node => node.remove());
        li.insertBefore(makeCheck(done), li.firstChild);
      });
    });

    return tpl.content;
  }

  // ------------------------------------------------------------------------
  // DOCUMENTO EDITABLE -> MARCADO
  // ------------------------------------------------------------------------
  function inlineMd(node) {
    let out = '';

    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += normalize(child.nodeValue);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      // Nodos del propio editor que no forman parte del contenido
      if (child.classList.contains('re-check')) return;

      const tag = child.tagName;
      if (tag === 'BR') { out += '\n'; return; }

      const inner = inlineMd(child);
      if (!inner) return;

      if (tag === 'STRONG' || tag === 'B') out += wrapMark('**', inner);
      else if (tag === 'EM' || tag === 'I') out += wrapMark('*', inner);
      else if (tag === 'U') out += wrapMark('__', inner);
      else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += wrapMark('~~', inner);
      else if (tag === 'MARK') out += wrapMark('==', inner);
      else if (tag === 'CODE') out += wrapMark('`', inner);
      else if (tag === 'IMG') {
        out += `![${child.getAttribute('alt') || ''}](${child.getAttribute('src') || ''})`;
      } else if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        out += href ? `[${inner.trim()}](${href})` : inner;
      } else {
        out += inner;
      }
    });

    return out;
  }

  function noteToLines(node) {
    const type = node.classList.contains('rt-note--warn') ? 'aviso'
      : node.classList.contains('rt-note--danger') ? 'peligro'
        : node.classList.contains('rt-note--info') ? 'info'
          : '';

    const blocks = Array.from(node.children).filter(child => isBlockTag(child.tagName));
    const raw = blocks.length
      ? blocks.flatMap(block => inlineMd(block).split('\n'))
      : inlineMd(node).split('\n');

    const lines = raw.map(line => line.trim()).filter(Boolean);
    return lines.map((line, i) => `> ${i === 0 && type ? `[!${type}] ` : ''}${line}`);
  }

  function listToLines(list) {
    const isTask = list.classList.contains('rt-checklist');
    const items = Array.from(list.children).filter(li => li.tagName === 'LI');
    if (!items.length) return [];

    return items.map((li, i) => {
      const text = inlineMd(li).trim();
      if (isTask) return `- [${li.dataset.done === '1' ? 'x' : ' '}] ${text}`;
      return list.tagName === 'OL' ? `${i + 1}. ${text}` : `- ${text}`;
    });
  }

  function tableToLines(table) {
    const rows = Array.from(table.rows || []);
    if (!rows.length) return [];

    const cellText = cell => inlineMd(cell).trim().replace(/\s*\n\s*/g, ' ');

    const head = Array.from(rows[0].cells).map(cellText);
    if (!head.length) return [];

    const align = cell => (cell.classList.contains('rt-al-center') ? ':---:'
      : cell.classList.contains('rt-al-right') ? '---:'
        : '---');
    const aligns = Array.from(rows[0].cells).map(align);

    const lines = [
      `| ${head.join(' | ')} |`,
      `| ${aligns.join(' | ')} |`
    ];
    rows.slice(1).forEach(row => {
      lines.push(`| ${Array.from(row.cells).map(cellText).join(' | ')} |`);
    });
    return lines;
  }

  function figureToLines(figure) {
    const img = figure.querySelector('img');
    const caption = figure.querySelector('figcaption');
    const alt = (caption ? caption.textContent : (img && img.getAttribute('alt')) || '').trim();
    const src = (img && img.getAttribute('src')) || '';
    if (!src) return [];
    return [`![${alt}](${src})`];
  }

  function blockToLines(el) {
    const tag = el.tagName;

    if (el.classList.contains('rt-note')) return noteToLines(el);
    if (tag === 'UL' || tag === 'OL') return listToLines(el);
    if (tag === 'TABLE') return tableToLines(el);
    if (tag === 'FIGURE') return figureToLines(el);
    if (tag === 'HR') return ['---'];
    if (tag === 'BLOCKQUOTE') return noteToLines(el);
    if (/^H[1-6]$/.test(tag)) {
      const text = inlineMd(el).trim();
      if (!text) return [];
      return [`${Number(tag[1]) >= 4 ? '###' : '##'} ${text}`];
    }
    if (tag === 'P') return textToLines(inlineMd(el));

    if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') {
      const hasBlocks = Array.from(el.children).some(child => isBlockTag(child.tagName));
      if (hasBlocks) {
        return Array.from(el.children).flatMap(child => blockToLines(child));
      }
      return textToLines(inlineMd(el));
    }

    return textToLines(inlineMd(el));
  }

  function serialize(root) {
    const blocks = [];
    Array.from(root.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const lines = textToLines(normalize(node.nodeValue));
        if (lines.length) blocks.push(lines);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const lines = blockToLines(node);
      if (lines.length) blocks.push(lines);
    });

    return blocks.map(lines => lines.join('\n')).join('\n\n').trim();
  }

  // ------------------------------------------------------------------------
  // PLANTILLA
  // ------------------------------------------------------------------------
  const TEMPLATE = `
    <div class="re-bar" role="toolbar" aria-label="Formato del texto">
      <div class="re-group">
        <button type="button" class="re-btn re-btn--label" data-re-menu="style"
                aria-haspopup="true" aria-expanded="false" title="Estilo del bloque">
          <span data-re-style-label>Párrafo</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="re-menu" data-re-panel="style" hidden>
          <button type="button" class="re-menu-item" data-re-cmd="style:p">Párrafo</button>
          <button type="button" class="re-menu-item" data-re-cmd="style:h3">Título</button>
          <button type="button" class="re-menu-item" data-re-cmd="style:h4">Subtítulo</button>
        </div>
      </div>

      <span class="re-sep" aria-hidden="true"></span>

      <button type="button" class="re-btn" data-re-cmd="bold" title="Negrita (Ctrl+B)" aria-label="Negrita"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
      <button type="button" class="re-btn" data-re-cmd="italic" title="Cursiva (Ctrl+I)" aria-label="Cursiva"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
      <button type="button" class="re-btn" data-re-cmd="underline" title="Subrayado (Ctrl+U)" aria-label="Subrayado"><i class="fa-solid fa-underline" aria-hidden="true"></i></button>
      <button type="button" class="re-btn" data-re-cmd="strike" title="Tachado" aria-label="Tachado"><i class="fa-solid fa-strikethrough" aria-hidden="true"></i></button>
      <button type="button" class="re-btn" data-re-cmd="mark" title="Resaltar" aria-label="Resaltar"><i class="fa-solid fa-highlighter" aria-hidden="true"></i></button>

      <span class="re-sep" aria-hidden="true"></span>

      <div class="re-group">
        <button type="button" class="re-btn re-btn--label" data-re-menu="list"
                aria-haspopup="true" aria-expanded="false" title="Listas">
          <i class="fa-solid fa-list-ul" aria-hidden="true"></i>
          <span>Listas</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="re-menu" data-re-panel="list" hidden>
          <button type="button" class="re-menu-item" data-re-cmd="list:ul"><i class="fa-solid fa-list-ul" aria-hidden="true"></i> Con viñetas</button>
          <button type="button" class="re-menu-item" data-re-cmd="list:ol"><i class="fa-solid fa-list-ol" aria-hidden="true"></i> Numerada</button>
          <button type="button" class="re-menu-item" data-re-cmd="list:task"><i class="fa-solid fa-square-check" aria-hidden="true"></i> De tareas</button>
        </div>
      </div>

      <div class="re-group">
        <button type="button" class="re-btn re-btn--label" data-re-menu="block"
                aria-haspopup="true" aria-expanded="false" title="Notas y avisos">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <span>Bloque</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="re-menu" data-re-panel="block" hidden>
          <button type="button" class="re-menu-item" data-re-cmd="note:"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Nota</button>
          <button type="button" class="re-menu-item" data-re-cmd="note:warn"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Atención</button>
          <button type="button" class="re-menu-item" data-re-cmd="note:danger"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Peligro</button>
          <span class="re-menu-sep" aria-hidden="true"></span>
          <button type="button" class="re-menu-item" data-re-cmd="hr"><i class="fa-solid fa-minus" aria-hidden="true"></i> Separador</button>
        </div>
      </div>

      <div class="re-group">
        <button type="button" class="re-btn re-btn--label" data-re-menu="insert"
                aria-haspopup="true" aria-expanded="false" title="Insertar">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <span>Insertar</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="re-menu" data-re-panel="insert" hidden>
          <button type="button" class="re-menu-item" data-re-cmd="image"><i class="fa-solid fa-image" aria-hidden="true"></i> Imagen</button>
          <button type="button" class="re-menu-item" data-re-cmd="table"><i class="fa-solid fa-table" aria-hidden="true"></i> Tabla</button>
          <button type="button" class="re-menu-item" data-re-cmd="link"><i class="fa-solid fa-link" aria-hidden="true"></i> Enlace</button>
        </div>
      </div>

      <div class="re-group re-table-tools" data-re-table-tools hidden>
        <span class="re-sep" aria-hidden="true"></span>
        <button type="button" class="re-btn re-btn--table" data-re-table="row-add" title="Agregar fila">+ fila</button>
        <button type="button" class="re-btn re-btn--table" data-re-table="col-add" title="Agregar columna">+ columna</button>
        <button type="button" class="re-btn re-btn--table" data-re-table="row-del" title="Eliminar fila">− fila</button>
        <button type="button" class="re-btn re-btn--table" data-re-table="col-del" title="Eliminar columna">− columna</button>
      </div>

      <button type="button" class="re-btn re-btn--mode" data-re-cmd="preview" title="Ver como lo verá el estudiante">
        <i class="fa-solid fa-eye" aria-hidden="true"></i>
        <span data-re-mode-label>Vista del estudiante</span>
      </button>

      <button type="button" class="re-btn" data-re-cmd="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
      <button type="button" class="re-btn" data-re-cmd="redo" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
    </div>

    <div class="re-panels">
      <div class="re-panel" data-re-form="table" hidden>
        <label class="sub-field">Filas
          <input type="number" data-re-input="rows" min="1" max="20" value="3" step="1">
        </label>
        <label class="sub-field">Columnas
          <input type="number" data-re-input="cols" min="2" max="6" value="3" step="1">
        </label>
        <button type="button" class="btn btn--primary btn--sm" data-re-ok="table">Insertar tabla</button>
        <button type="button" class="btn btn--outline btn--sm" data-re-cancel>Cancelar</button>
      </div>

      <div class="re-panel" data-re-form="image" hidden>
        <label class="sub-field sub-field--grow">Dirección de la imagen
          <input type="url" data-re-input="url" placeholder="https://…/foto.jpg" autocomplete="off">
        </label>
        <label class="sub-field sub-field--grow">Pie de foto
          <input type="text" data-re-input="caption" placeholder="Qué muestra la imagen" maxlength="140">
        </label>
        <button type="button" class="btn btn--primary btn--sm" data-re-ok="image">Insertar imagen</button>
        <button type="button" class="btn btn--outline btn--sm" data-re-cancel>Cancelar</button>
      </div>

      <div class="re-panel" data-re-form="link" hidden>
        <label class="sub-field sub-field--grow">Dirección
          <input type="url" data-re-input="href" placeholder="https://…" autocomplete="off">
        </label>
        <label class="sub-field sub-field--grow">Texto del enlace
          <input type="text" data-re-input="text" placeholder="Selecciona texto o escríbelo aquí" maxlength="140">
        </label>
        <button type="button" class="btn btn--primary btn--sm" data-re-ok="link">Aplicar</button>
        <button type="button" class="btn btn--outline btn--sm" data-re-cancel>Cancelar</button>
      </div>

      <p class="re-error" data-re-error role="alert" hidden></p>
    </div>

    <div class="re-surface" contenteditable="true" role="textbox" aria-multiline="true"
         aria-label="Contenido de la subsección"
         data-placeholder="Escribe la explicación de esta subsección…"></div>
    <div class="re-preview" data-re-preview hidden></div>
  `;

  // ------------------------------------------------------------------------
  // MONTAJE
  // ------------------------------------------------------------------------
  function mount(host, opts = {}) {
    host.innerHTML = TEMPLATE;

    const surface = host.querySelector('.re-surface');
    const preview = host.querySelector('[data-re-preview]');
    const bar = host.querySelector('.re-bar');
    const errorBox = host.querySelector('[data-re-error]');
    const forms = Array.from(host.querySelectorAll('[data-re-form]'));
    const tableTools = host.querySelector('[data-re-table-tools]');
    const styleLabel = host.querySelector('[data-re-style-label]');
    const modeLabel = host.querySelector('[data-re-mode-label]');
    const panels = host.querySelector('.re-panels');

    let savedRange = null;
    let previewing = false;
    let history = [];
    let historyIndex = -1;
    let snapshotTimer = 0;

    // --- utilidades de selección -------------------------------------------
    function selectionInSurface() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      return surface.contains(range.commonAncestorContainer) ? range : null;
    }

    function caretBlock() {
      const range = selectionInSurface();
      if (!range) return null;
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (!node || !surface.contains(node)) return null;
      while (node && node.parentNode !== surface) node = node.parentNode;
      return node && node !== surface ? node : null;
    }

    function caretCell() {
      const range = selectionInSurface();
      if (!range) return null;
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      return node ? node.closest('td, th') : null;
    }

    function placeCaretAtEnd(el) {
      if (!el) return;
      surface.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function caretPath() {
      const range = selectionInSurface();
      if (!range) return null;
      const path = [];
      let node = range.startContainer;
      while (node && node !== surface) {
        path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
        node = node.parentNode;
      }
      if (node !== surface) return null;
      return { path, offset: range.startOffset };
    }

    function restorePath(saved) {
      if (!saved) return false;
      let node = surface;
      for (let i = 0; i < saved.path.length; i++) {
        const next = node.childNodes[saved.path[i]];
        if (!next) return false;
        node = next;
      }
      const max = node.nodeType === Node.TEXT_NODE ? node.nodeValue.length : node.childNodes.length;
      const range = document.createRange();
      range.setStart(node, Math.min(saved.offset, max));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }

    function restoreSelection() {
      surface.focus();
      if (savedRange && surface.contains(savedRange.startContainer)) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }

    function ensureTrailingParagraph() {
      const last = surface.lastElementChild;
      const needsParagraph = !last
        || last.tagName === 'TABLE'
        || last.tagName === 'FIGURE'
        || last.tagName === 'HR';

      if (needsParagraph) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        surface.appendChild(p);
        return p;
      }
      return last;
    }

    // --- historial ---------------------------------------------------------
    function snapshot() {
      window.clearTimeout(snapshotTimer);
      const html = surface.innerHTML;
      const caret = caretPath();

      if (historyIndex >= 0 && history[historyIndex].html === html) {
        if (caret) history[historyIndex].caret = caret;
        return;
      }
      history = history.slice(0, historyIndex + 1);
      history.push({ html, caret });
      if (history.length > 60) history.shift();
      historyIndex = history.length - 1;
    }

    function queueSnapshot() {
      window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(snapshot, 350);
    }

    function applyHistory(entry) {
      surface.innerHTML = entry.html;
      ensureTrailingParagraph();
      if (!restorePath(entry.caret)) placeCaretAtEnd(surface.lastElementChild);
      emitChange();
      syncToolbar();
    }

    function undo() {
      snapshot();
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      applyHistory(history[historyIndex]);
    }

    function redo() {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      applyHistory(history[historyIndex]);
    }

    // --- aviso de cambios --------------------------------------------------
    function emitChange() {
      const value = serialize(surface);
      surface.classList.toggle('is-empty', value.trim() === '');
      if (typeof opts.onChange === 'function') opts.onChange(value);
    }

    function focusSurface() {
      if (previewing) return;
      surface.focus();
    }

    // --- comandos ----------------------------------------------------------
    function exec(command) {
      restoreSelection();
      focusSurface();
      document.execCommand(command, false, null);
      snapshot();
      emitChange();
      syncToolbar();
    }

    function setStyle(tag) {
      restoreSelection();
      focusSurface();
      document.execCommand('formatBlock', false, `<${tag}>`);
      snapshot();
      emitChange();
      syncToolbar();
    }

    function activeList() {
      const block = caretBlock();
      return block ? block.closest('ul, ol') : null;
    }

    function makeChecklist(list) {
      list.classList.add('rt-checklist');
      list.classList.remove('rt-list');
      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        if (li.dataset.done !== '1') li.dataset.done = '0';
        if (!li.querySelector(':scope > .re-check')) {
          li.insertBefore(makeCheck(li.dataset.done === '1'), li.firstChild);
        }
      });
    }

    function clearChecklist(list) {
      list.classList.remove('rt-checklist');
      list.classList.add('rt-list');
      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        li.querySelectorAll(':scope > .re-check').forEach(node => node.remove());
        delete li.dataset.done;
      });
    }

    /* Cambia el tipo de lista conservando el texto de cada elemento. */
    function convertList(list, tag, keepChecks) {
      const next = document.createElement(tag);
      next.className = keepChecks ? 'rt-checklist' : 'rt-list';

      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        const item = document.createElement('li');
        Array.from(li.childNodes).forEach(node => {
          const isCheck = node.nodeType === Node.ELEMENT_NODE && node.classList.contains('re-check');
          if (!isCheck) item.appendChild(node.cloneNode(true));
        });
        if (keepChecks) item.dataset.done = li.dataset.done === '1' ? '1' : '0';
        next.appendChild(item);
      });

      list.replaceWith(next);
      return next;
    }

    function unwrapList(list) {
      const frag = document.createDocumentFragment();
      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        const p = document.createElement('p');
        const content = li.cloneNode(true);
        content.querySelectorAll(':scope > .re-check').forEach(node => node.remove());
        p.innerHTML = content.innerHTML || '<br>';
        frag.appendChild(p);
      });
      const first = frag.firstElementChild;
      list.replaceWith(frag);
      if (first) placeCaretAtEnd(first);
    }

    /* Bloques que toca la selección actual (para convertir varios párrafos
       en elementos de la misma lista). */
    function selectedBlocks() {
      const range = selectionInSurface();
      if (!range) return [];
      return Array.from(surface.children).filter(el => {
        if (!/^(P|H[1-6])$/.test(el.tagName)) return false;
        try { return range.intersectsNode(el); } catch (err) { return false; }
      });
    }

    /* Crea la lista a mano: execCommand anida <ul> dentro de <p> en algunos
       casos y deja un documento inválido. */
    function createList(kind, tag) {
      const blocks = selectedBlocks();
      if (!blocks.length) {
        const block = caretBlock() || ensureTrailingParagraph();
        if (block && /^(P|H[1-6])$/.test(block.tagName)) blocks.push(block);
      }

      const list = document.createElement(tag);
      list.className = kind === 'task' ? 'rt-checklist' : 'rt-list';

      if (!blocks.length) {
        const li = document.createElement('li');
        li.innerHTML = '<br>';
        list.appendChild(li);
        surface.appendChild(list);
      } else {
        blocks.forEach(block => {
          const li = document.createElement('li');
          li.innerHTML = block.innerHTML || '<br>';
          list.appendChild(li);
        });
        blocks[0].replaceWith(list);
        blocks.slice(1).forEach(block => block.remove());
      }

      if (kind === 'task') makeChecklist(list);
      else list.classList.add('rt-list');

      const first = list.querySelector('li');
      if (first) placeCaretAtEnd(first);
      return list;
    }

    function setList(kind) {
      restoreSelection();
      focusSurface();

      const current = activeList();
      const target = kind === 'ol' ? 'OL' : 'UL';

      if (!current) {
        createList(kind, target);
      } else if (kind === 'task' && current.classList.contains('rt-checklist')) {
        clearChecklist(current);
      } else if (kind !== 'task' && current.tagName === target && !current.classList.contains('rt-checklist')) {
        unwrapList(current);
      } else {
        const converted = convertList(current, target, kind === 'task');
        if (kind === 'task') {
          makeChecklist(converted);
        } else {
          converted.classList.add('rt-list');
          converted.classList.remove('rt-checklist');
        }
        const first = converted.querySelector('li');
        if (first) placeCaretAtEnd(first);
      }

      snapshot();
      emitChange();
      syncToolbar();
    }

    function setNote(type) {
      restoreSelection();
      focusSurface();

      const block = caretBlock();
      const existing = block ? block.closest('.rt-note') : null;

      if (existing) {
        if (!type) {
          const frag = document.createDocumentFragment();
          Array.from(existing.children).forEach(child => {
            if (/^(P|DIV)$/.test(child.tagName)) frag.appendChild(child);
            else {
              const p = document.createElement('p');
              p.append(child);
              frag.appendChild(p);
            }
          });
          if (!frag.childNodes.length) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            frag.appendChild(p);
          }
          existing.replaceWith(frag);
        } else {
          existing.className = `rt-note rt-note--${type}`;
        }
      } else {
        const target = block || ensureTrailingParagraph();
        const note = document.createElement('div');
        note.className = type ? `rt-note rt-note--${type}` : 'rt-note';
        target.replaceWith(note);
        note.appendChild(target);
        placeCaretAtEnd(target);
      }

      snapshot();
      emitChange();
      syncToolbar();
    }

    function existsInside(selector) {
      const block = caretBlock();
      return block ? block.closest(selector) : null;
    }

    function toggleMark() {
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      const marked = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer.closest('mark')
        : range.commonAncestorContainer.parentElement.closest('mark');

      if (marked) {
        const parent = marked.parentNode;
        while (marked.firstChild) parent.insertBefore(marked.firstChild, marked);
        parent.removeChild(marked);
        parent.normalize();
      } else {
        if (range.collapsed) return;
        const mark = document.createElement('mark');
        try {
          range.surroundContents(mark);
        } catch (err) {
          mark.appendChild(range.extractContents());
          range.insertNode(mark);
        }
        const after = document.createRange();
        after.selectNodeContents(mark);
        sel.removeAllRanges();
        sel.addRange(after);
      }

      snapshot();
      emitChange();
      syncToolbar();
    }

    function insertBlockNode(node) {
      const block = caretBlock();
      const empty = block && block.textContent.trim() === '' && block.tagName === 'P';

      if (empty) block.replaceWith(node);
      else if (block) block.after(node);
      else surface.appendChild(node);

      ensureTrailingParagraph();
      emitChange();
    }

    function insertHr() {
      const hr = document.createElement('hr');
      insertBlockNode(hr);
      const last = ensureTrailingParagraph();
      placeCaretAtEnd(last);
      snapshot();
    }

    function buildTable(rows, cols) {
      const table = document.createElement('table');
      table.className = 'rt-table';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const th = document.createElement('th');
        th.textContent = `Columna ${c + 1}`;
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);

      const tbody = document.createElement('tbody');
      for (let r = 0; r < rows; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < cols; c++) {
          const td = document.createElement('td');
          td.innerHTML = '<br>';
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }

      table.append(thead, tbody);
      return table;
    }

    function tableAction(action) {
      const cell = caretCell();
      if (!cell) return;
      const row = cell.parentElement;
      const table = cell.closest('table');
      const column = Array.from(row.children).indexOf(cell);
      const bodyRows = Array.from(table.tBodies[0] ? table.tBodies[0].rows : []);

      if (action === 'row-add') {
        const tag = row.parentElement.tagName === 'THEAD' ? 'th' : 'td';
        const next = document.createElement('tr');
        for (let i = 0; i < row.children.length; i++) {
          const c = document.createElement(tag);
          c.innerHTML = '<br>';
          next.appendChild(c);
        }
        row.after(next);
      } else if (action === 'col-add') {
        Array.from(table.rows).forEach(tr => {
          const tag = tr.parentElement.tagName === 'THEAD' ? 'th' : 'td';
          const c = document.createElement(tag);
          c.innerHTML = '<br>';
          tr.children[column].after(c);
        });
      } else if (action === 'row-del') {
        if (table.rows.length > 2) {
          row.remove();
        } else if (bodyRows.length) {
          bodyRows[0].remove();
        }
      } else if (action === 'col-del') {
        if (row.children.length > 2) {
          Array.from(table.rows).forEach(tr => tr.children[column] && tr.children[column].remove());
        }
      }

      snapshot();
      emitChange();
      syncToolbar();
    }

    // --- paneles de inserción ---------------------------------------------
    function closeForms() {
      forms.forEach(form => { form.hidden = true; });
      if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    }

    function openForm(kind) {
      closeMenus();
      const form = forms.find(f => f.dataset.reForm === kind);
      if (!form) return;
      forms.forEach(f => { f.hidden = f !== form; });
      if (errorBox) errorBox.hidden = true;

      if (kind === 'link') {
        const textField = form.querySelector('[data-re-input="text"]');
        const sel = window.getSelection();
        const selected = sel && !sel.isCollapsed ? sel.toString().trim() : '';
        if (selected) textField.value = selected;
      }

      const first = form.querySelector('input');
      if (first) { first.focus(); first.select(); }
    }

    function safeUrl(value, kind) {
      const url = String(value || '').trim();
      if (!url) return '';
      if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
      if (/^\/[^/]/.test(url)) return url;
      if (kind === 'image' && /^img\//i.test(url)) return url;
      return '';
    }

    function showError(message) {
      if (!errorBox) return;
      errorBox.textContent = message;
      errorBox.hidden = false;
    }

    function confirmForm(kind) {
      const form = forms.find(f => f.dataset.reForm === kind);
      if (!form) return;
      if (errorBox) errorBox.hidden = true;

      if (kind === 'table') {
        const rows = Math.min(20, Math.max(1, parseInt(form.querySelector('[data-re-input="rows"]').value, 10) || 3));
        const cols = Math.min(6, Math.max(2, parseInt(form.querySelector('[data-re-input="cols"]').value, 10) || 3));
        const table = buildTable(rows, cols);
        closeForms();
        insertBlockNode(table);
        const firstCell = table.querySelector('th');
        if (firstCell) {
          const range = document.createRange();
          range.selectNodeContents(firstCell);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        snapshot();
        return;
      }

      if (kind === 'image') {
        const urlField = form.querySelector('[data-re-input="url"]');
        const src = safeUrl(urlField.value, 'image');
        if (!src) {
          showError('Usa una dirección que empiece por https:// o una ruta del sitio (/img/…).');
          urlField.focus();
          return;
        }
        const caption = form.querySelector('[data-re-input="caption"]').value.trim();
        const figure = document.createElement('figure');
        figure.className = 'rt-figure';
        const img = document.createElement('img');
        img.src = src;
        img.alt = caption;
        figure.appendChild(img);
        if (caption) {
          const cap = document.createElement('figcaption');
          cap.textContent = caption;
          figure.appendChild(cap);
        }
        urlField.value = '';
        form.querySelector('[data-re-input="caption"]').value = '';
        closeForms();
        insertBlockNode(figure);
        snapshot();
        return;
      }

      if (kind === 'link') {
        const hrefField = form.querySelector('[data-re-input="href"]');
        const href = safeUrl(hrefField.value, 'link');
        if (!href) {
          showError('Escribe una dirección que empiece por https:// o una ruta del sitio.');
          hrefField.focus();
          return;
        }
        const text = form.querySelector('[data-re-input="text"]').value.trim();
        const range = savedRange && surface.contains(savedRange.startContainer) ? savedRange : null;

        hrefField.value = '';
        form.querySelector('[data-re-input="text"]').value = '';
        closeForms();

        restoreSelection();
        focusSurface();
        const selection = window.getSelection();
        if (!selection.rangeCount) placeCaretAtEnd(surface.lastElementChild || surface);
        const target = range || selection.getRangeAt(0);

        const link = document.createElement('a');
        link.href = href;
        try {
          if (!target.collapsed) link.appendChild(target.extractContents());
          else link.textContent = text || href;
          target.insertNode(link);
        } catch (err) {
          link.textContent = text || href;
          target.insertNode(link);
        }

        snapshot();
        emitChange();
        syncToolbar();
      }
    }

    // --- menús -------------------------------------------------------------
    function closeMenus(except) {
      host.querySelectorAll('.re-menu').forEach(panel => {
        if (panel === except) return;
        panel.hidden = true;
        const button = host.querySelector(`[data-re-menu="${panel.dataset.rePanel}"]`);
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    }

    // --- barra -------------------------------------------------------------
    function isActive(command) {
      try { return document.queryCommandState(command); } catch (err) { return false; }
    }

    function syncToolbar() {
      if (previewing) return;

      host.querySelectorAll('[data-re-cmd="bold"]').forEach(btn => btn.classList.toggle('is-active', isActive('bold')));
      host.querySelectorAll('[data-re-cmd="italic"]').forEach(btn => btn.classList.toggle('is-active', isActive('italic')));
      host.querySelectorAll('[data-re-cmd="underline"]').forEach(btn => btn.classList.toggle('is-active', isActive('underline')));
      host.querySelectorAll('[data-re-cmd="strike"]').forEach(btn => btn.classList.toggle('is-active', isActive('strikeThrough')));

      const block = caretBlock();
      const range = selectionInSurface();
      const anchorEl = range
        ? (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement)
        : null;
      const inMark = Boolean(anchorEl && anchorEl.closest('mark'));
      host.querySelectorAll('[data-re-cmd="mark"]').forEach(btn => btn.classList.toggle('is-active', inMark));

      let label = 'Párrafo';
      if (block) {
        if (block.closest('.rt-note--danger')) label = 'Peligro';
        else if (block.closest('.rt-note--warn')) label = 'Atención';
        else if (block.closest('.rt-note--info')) label = 'Información';
        else if (block.closest('.rt-note')) label = 'Nota';
        else if (block.closest('li')) label = 'Lista';
        else if (block.tagName === 'H3' || block.tagName === 'H1' || block.tagName === 'H2') label = 'Título';
        else if (/^H[4-6]$/.test(block.tagName)) label = 'Subtítulo';
      }
      if (styleLabel) styleLabel.textContent = label;

      const inTable = Boolean(caretCell());
      if (tableTools) tableTools.hidden = !inTable;
    }

    // --- vista del estudiante ---------------------------------------------
    function togglePreview() {
      previewing = !previewing;
      preview.hidden = !previewing;
      surface.hidden = previewing;
      host.classList.toggle('is-preview', previewing);
      if (modeLabel) modeLabel.textContent = previewing ? 'Volver a editar' : 'Vista del estudiante';

      if (previewing) {
        snapshot();
        preview.innerHTML = window.RichText ? RichText.render(serialize(surface)) : '';
        if (window.RichText && RichText.enhance) RichText.enhance(preview);
        closeForms();
        closeMenus();
      } else {
        focusSurface();
      }
    }

    function runCommand(raw) {
      const split = raw.indexOf(':');
      const name = split === -1 ? raw : raw.slice(0, split);
      const arg = split === -1 ? '' : raw.slice(split + 1);

      switch (name) {
        case 'bold': exec('bold'); break;
        case 'italic': exec('italic'); break;
        case 'underline': exec('underline'); break;
        case 'strike': exec('strikeThrough'); break;
        case 'mark': toggleMark(); break;
        case 'style': setStyle(arg); break;
        case 'list': setList(arg); break;
        case 'note': setNote(arg); break;
        case 'hr': insertHr(); break;
        case 'table': openForm('table'); break;
        case 'image': openForm('image'); break;
        case 'link': openForm('link'); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'preview': togglePreview(); break;
        default: break;
      }
    }

    // --- eventos -----------------------------------------------------------
    // Al pulsar la barra no se pierde la selección del texto.
    bar.addEventListener('mousedown', event => {
      if (event.target.closest('button')) event.preventDefault();
    });

    bar.addEventListener('click', event => {
      const menuButton = event.target.closest('[data-re-menu]');
      if (menuButton) {
        const name = menuButton.dataset.reMenu;
        const panel = host.querySelector(`[data-re-panel="${name}"]`);
        const open = panel.hidden;
        closeMenus();
        closeForms();
        panel.hidden = !open;
        menuButton.setAttribute('aria-expanded', String(open));
        return;
      }

      const tableButton = event.target.closest('[data-re-table]');
      if (tableButton) { tableAction(tableButton.dataset.reTable); return; }

      const commandButton = event.target.closest('[data-re-cmd]');
      if (commandButton) {
        closeMenus();
        runCommand(commandButton.dataset.reCmd);
      }
    });

    panels.addEventListener('click', event => {
      if (event.target.closest('[data-re-cancel]')) { closeForms(); focusSurface(); return; }
      const ok = event.target.closest('[data-re-ok]');
      if (ok) confirmForm(ok.dataset.reOk);
    });

    panels.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        const ok = event.target.closest('[data-re-form]');
        if (ok) { event.preventDefault(); confirmForm(ok.dataset.reForm); }
      }
      if (event.key === 'Escape') { closeForms(); focusSurface(); }
    });

    document.addEventListener('mousedown', event => {
      if (!host.contains(event.target)) { closeMenus(); }
    });

    document.addEventListener('selectionchange', onSelectionChange);

    function onSelectionChange() {
      const range = selectionInSurface();
      if (!range) return;
      savedRange = range.cloneRange();
      syncToolbar();
    }

    surface.addEventListener('input', () => {
      // Cualquier elemento nuevo de una lista de tareas necesita su casilla
      // (al pulsar Enter, al pegar o al convertir desde otra lista).
      surface.querySelectorAll('.rt-checklist > li').forEach(li => {
        if (!li.querySelector(':scope > .re-check')) {
          if (li.dataset.done !== '1') li.dataset.done = '0';
          li.insertBefore(makeCheck(li.dataset.done === '1'), li.firstChild);
        }
      });
      queueSnapshot();
      emitChange();
    });

    surface.addEventListener('keydown', event => {
      const meta = event.ctrlKey || event.metaKey;

      if (meta) {
        const key = event.key.toLowerCase();
        if (key === 'b') { event.preventDefault(); return exec('bold'); }
        if (key === 'i') { event.preventDefault(); return exec('italic'); }
        if (key === 'u') { event.preventDefault(); return exec('underline'); }
        if (key === 'k') { event.preventDefault(); return openForm('link'); }
        if (key === 'z') { event.preventDefault(); return event.shiftKey ? redo() : undo(); }
        if (key === 'y') { event.preventDefault(); return redo(); }
      }

      if (event.key === 'Escape') { closeMenus(); return; }

      // Tab dentro de una tabla: celda siguiente / anterior
      if (event.key === 'Tab') {
        const cell = caretCell();
        if (cell) {
          event.preventDefault();
          const cells = Array.from(cell.closest('table').querySelectorAll('th, td'));
          const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
          if (next) placeCaretAtEnd(next);
        }
        return;
      }

      // Enter en la última línea vacía de una nota: se sale de la nota.
      if (event.key === 'Enter' && !event.shiftKey) {
        const block = caretBlock();
        const note = block ? block.closest('.rt-note') : null;
        if (note && block === note.lastElementChild && block.textContent.trim() === '') {
          event.preventDefault();
          const paragraph = document.createElement('p');
          paragraph.innerHTML = '<br>';
          note.after(paragraph);
          if (!note.textContent.trim()) note.remove();
          placeCaretAtEnd(paragraph);
          snapshot();
          emitChange();
        }
      }
    });

    // Pegar siempre como texto: fuera estilos y estructuras ajenas.
    surface.addEventListener('paste', event => {
      const data = event.clipboardData || window.clipboardData;
      if (!data) return;
      event.preventDefault();
      const text = data.getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    surface.addEventListener('click', event => {
      const check = event.target.closest('.re-check');
      if (check) {
        const li = check.closest('li');
        const done = li.dataset.done === '1';
        li.dataset.done = done ? '0' : '1';
        check.setAttribute('aria-checked', done ? 'false' : 'true');
        snapshot();
        emitChange();
        return;
      }
      const link = event.target.closest('a');
      if (link) event.preventDefault();
    });

    surface.addEventListener('keydown', event => {
      const check = event.target.closest && event.target.closest('.re-check');
      if (check && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        check.click();
      }
    });

    // --- API ---------------------------------------------------------------
    function setValue(markdown) {
      surface.replaceChildren(toEditable(markdown || ''));
      ensureTrailingParagraph();
      surface.classList.toggle('is-empty', serialize(surface).trim() === '');
      history = [];
      historyIndex = -1;
      snapshot();
    }

    function getValue() {
      return serialize(surface);
    }

    setValue(opts.value || '');

    return {
      getValue,
      setValue,
      focus: focusSurface,
      destroy() {
        document.removeEventListener('selectionchange', onSelectionChange);
        window.clearTimeout(snapshotTimer);
      }
    };
  }

  return { mount, serialize };
})();

if (typeof window !== 'undefined') window.RichEditor = RichEditor;
