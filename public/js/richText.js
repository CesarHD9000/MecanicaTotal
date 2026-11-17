/* ==========================================================================
   richText.js — Renderizador de texto enriquecido para la teoría
   --------------------------------------------------------------------------
   El contenido se guarda como TEXTO PLANO en la base de datos (columna
   lesson_subsections.content). Este módulo lo convierte en HTML con estructura
   y estilo, sin dependencias externas.

   Sintaxis soportada (se escribe directamente en el textarea del admin):
     ## Texto            -> subtítulo de sección
     ### Texto           -> subtítulo de segundo nivel
     - item  /  • item   -> lista con viñetas
     1. item             -> lista numerada
     - [ ] item          -> lista de comprobación pendiente
     - [x] item          -> lista de comprobación hecha
     > Texto             -> nota destacada (aviso / consejo)
     > [!aviso] Texto    -> nota de atención   (también [!info] y [!peligro])
     | A | B |           -> tabla: cabecera, fila de guiones y filas de datos
     | --- | --- |
     | 1 | 2 |
     ![pie](url)         -> imagen con pie de foto (línea propia)
     [texto](url)        -> enlace
     ---                 -> separador
     **negrita**         -> énfasis fuerte
     *cursiva*           -> énfasis
     `código`            -> fragmento técnico monoespaciado
     línea en blanco     -> separa párrafos (cada línea suelta también es párrafo)

   Todo el texto se escapa antes de generar marcado; los enlaces y las imágenes
   solo se emiten con esquemas permitidos (http, https, mailto y rutas locales).
   ========================================================================== */

const RichText = (() => {

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* Solo se aceptan destinos que no puedan ejecutar código. Las URLs llegan ya
     escapadas, así que aquí se valida el esquema y se devuelve la misma cadena
     (lista para ir dentro de un atributo entre comillas). */
  function safeLinkUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
    if (/^\/(?!\/)/.test(value) || value.startsWith('#')) return value;
    return '';
  }

  function safeImageUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (/^\/(?!\/)/.test(value) || /^img\//.test(value)) return value;
    return '';
  }

  /* Marcas en línea. Se aplican sobre texto ya escapado. La raya baja evita
     tocar rutas y esquemas de URL (__ en un enlace) y se resuelve después de
     separar los enlaces. */
  function marks(text) {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code class="rt-code">$1</code>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/==([^=]+)==/g, '<mark class="rt-mark">$1</mark>')
      .replace(/(^|[^/:_])__([^_]+)__/g, '$1<u>$2</u>');
  }

  /* Los enlaces se apartan antes de aplicar el formato: así una dirección con
     guiones bajos o signos iguales no se convierte en subrayado ni en
     resaltado. Dentro del texto del enlace sí se aplica el formato. */
  function inline(text) {
    const links = [];
    const masked = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      const href = safeLinkUrl(url);
      if (!href) return match;
      links.push({ label, href });
      return `\u0000${links.length - 1}\u0000`;
    });

    return marks(masked).replace(/\u0000(\d+)\u0000/g, (match, index) => {
      const link = links[Number(index)];
      if (!link) return '';
      const external = /^https?:\/\//i.test(link.href);
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a class="rt-link" href="${link.href}"${attrs}>${marks(link.label)}</a>`;
    });
  }

  // ------------------------------------------------------------------------
  // TABLAS
  // ------------------------------------------------------------------------
  const TABLE_ROW = /^\|/;
  const TABLE_SEP = /^:?-{2,}:?$/;

  function splitCells(line) {
    let body = String(line).trim();
    if (body.startsWith('|')) body = body.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);
    return body.split('|').map(cell => cell.trim());
  }

  function isTableSeparator(line) {
    if (!line.startsWith('|') || !line.includes('-')) return false;
    const cells = splitCells(line);
    return cells.length > 0 && cells.every(cell => TABLE_SEP.test(cell));
  }

  function cellAlign(cell) {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  }

  /* Ajusta la fila al número de columnas de la cabecera: una fila escrita con
     celdas de menos no rompe la cuadrícula. */
  function fitRow(cells, width) {
    const row = cells.slice(0, width);
    while (row.length < width) row.push('');
    return row;
  }

  function buildTable(head, aligns, rows) {
    const cls = align => (align === 'center' ? ' class="rt-al-center"'
      : align === 'right' ? ' class="rt-al-right"'
        : '');

    const headHtml = head.map((cell, i) =>
      `<th${cls(aligns[i])}>${inline(escapeHtml(cell))}</th>`).join('');

    const bodyHtml = rows.map(row =>
      `<tr>${fitRow(row, head.length).map((cell, i) =>
        `<td${cls(aligns[i])}>${inline(escapeHtml(cell))}</td>`).join('')}</tr>`
    ).join('');

    return `<div class="rt-table-block">`
      + `<div class="rt-table-wrap"><table class="rt-table">`
      + `<thead><tr>${headHtml}</tr></thead>`
      + (bodyHtml ? `<tbody>${bodyHtml}</tbody>` : '')
      + `</table></div>`
      + `<span class="rt-table-hint">Desliza la tabla para ver todas las columnas</span>`
      + `</div>`;
  }

  /* Devuelve { html, next } si en la línea `start` empieza una tabla válida. */
  function readTable(lines, start) {
    if (!TABLE_ROW.test(lines[start].trim())) return null;
    const separator = (lines[start + 1] || '').trim();
    if (!isTableSeparator(separator)) return null;

    const head = splitCells(lines[start]);
    const aligns = splitCells(separator).map(cellAlign);
    const rows = [];

    let i = start + 2;
    while (i < lines.length && TABLE_ROW.test(lines[i].trim())) {
      rows.push(splitCells(lines[i]));
      i++;
    }
    return { html: buildTable(head, aligns, rows), next: i };
  }

  // ------------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------------
  const NOTE_TYPES = {
    info: 'info', nota: 'info', importante: 'info', dato: 'info',
    aviso: 'warn', atencion: 'warn', 'atención': 'warn', warn: 'warn', ojo: 'warn',
    peligro: 'danger', cuidado: 'danger', danger: 'danger', riesgo: 'danger'
  };

  function render(text) {
    if (text === null || text === undefined) return '';
    const raw = String(text).replace(/\r\n?/g, '\n');
    if (!raw.trim()) return '';

    const lines = raw.split('\n');
    const out = [];
    let list = null;   // { tag: 'ul' | 'ol' | 'task', items: [] }
    let note = null;   // { type: 'warn' | 'danger' | null, lines: [] }

    const flushList = () => {
      if (!list) return;
      if (list.tag === 'task') {
        out.push(`<ul class="rt-checklist">${list.items.join('')}</ul>`);
      } else {
        out.push(`<${list.tag} class="rt-list">${list.items.join('')}</${list.tag}>`);
      }
      list = null;
    };
    const flushNote = () => {
      if (!note) return;
      const cls = note.type ? `rt-note rt-note--${note.type}` : 'rt-note';
      out.push(`<div class="${cls}">${note.lines.map(inline).join('<br>')}</div>`);
      note = null;
    };
    const flushAll = () => { flushList(); flushNote(); };

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();

      // Línea vacía: cierra bloques abiertos
      if (!t) { flushAll(); continue; }

      // Tabla (necesita mirar la línea siguiente: va antes que el separador)
      const table = readTable(lines, i);
      if (table) {
        flushAll();
        out.push(table.html);
        i = table.next - 1;
        continue;
      }

      // Separador
      if (/^-{3,}$/.test(t)) { flushAll(); out.push('<hr class="rt-hr">'); continue; }

      // Subtítulo interno
      const heading = t.match(/^(#{2,4})\s+(.+)$/);
      if (heading) {
        flushAll();
        // h3: el título del tema es h2 en la vista de lectura del estudiante.
        const small = heading[1].length >= 3;
        out.push(`<h${small ? '4' : '3'} class="rt-h${small ? ' rt-h--sub' : ''}">`
          + `${inline(escapeHtml(heading[2]))}</h${small ? '4' : '3'}>`);
        continue;
      }

      // Nota destacada, con tipo opcional: > [!aviso] texto
      const noteMatch = t.match(/^>\s?(.*)$/);
      if (noteMatch) {
        flushList();
        let body = noteMatch[1];
        let type = null;
        const tag = body.match(/^\[!([^\]]+)\]\s*(.*)$/);
        if (tag) {
          type = NOTE_TYPES[tag[1].trim().toLowerCase()] || null;
          body = tag[2];
          // Un tipo nuevo abre otra nota; una línea de continuación sin
          // distintivo sigue en la misma.
          if (!note || note.type !== type) { flushNote(); note = { type, lines: [] }; }
        } else if (!note) {
          note = { type: null, lines: [] };
        }
        note.lines.push(escapeHtml(body));
        continue;
      }

      // Lista de comprobación: - [ ] / - [x]
      const task = t.match(/^[-*•·–]\s*\[([ xX])\]\s*(.*)$/);
      if (task) {
        flushNote();
        if (!list || list.tag !== 'task') { flushList(); list = { tag: 'task', items: [] }; }
        const done = task[1].toLowerCase() === 'x';
        const icon = done ? 'fa-square-check' : 'fa-square';
        const label = done ? 'Completado' : 'Pendiente';
        list.items.push(`<li class="rt-check${done ? ' is-done' : ''}">`
          + `<i class="fa-solid ${icon} rt-check-icon" aria-hidden="true"></i>`
          + `<span class="rt-sr">${label}: </span>`
          + `<span>${inline(escapeHtml(task[2]))}</span></li>`);
        continue;
      }

      // Viñeta: acepta "-", "•", "·" y también el guion largo
      const bullet = t.match(/^[-•·–]\s*(.+)$/);
      if (bullet) {
        flushNote();
        if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
        list.items.push(`<li>${inline(escapeHtml(bullet[1]))}</li>`);
        continue;
      }

      // Lista numerada
      const numbered = t.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        flushNote();
        if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
        list.items.push(`<li>${inline(escapeHtml(numbered[1]))}</li>`);
        continue;
      }

      // Imagen con pie de foto (solo si ocupa la línea completa)
      const image = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (image) {
        flushAll();
        const src = safeImageUrl(image[2]);
        if (src) {
          const alt = image[1].trim();
          out.push(`<figure class="rt-figure"><img src="${src}" `
            + `alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`
            + (alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '')
            + `</figure>`);
        } else {
          // URL no permitida: se muestra tal cual para que el autor la corrija.
          out.push(`<p>${inline(escapeHtml(t))}</p>`);
        }
        continue;
      }

      // Párrafo normal
      flushAll();
      out.push(`<p>${inline(escapeHtml(t))}</p>`);
    }

    flushAll();
    return out.join('');
  }

  // ------------------------------------------------------------------------
  // AJUSTES POST-RENDER
  // ------------------------------------------------------------------------
  /* Una tabla ancha se desplaza en horizontal dentro de su marco; el aviso de
     "desliza" solo se muestra cuando de verdad no cabe. Se recalcula al cambiar
     el ancho (rotación del móvil, panel lateral), no al hacer scroll. */
  function enhance(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.rt-table-block').forEach(block => {
      const wrap = block.querySelector('.rt-table-wrap');
      if (!wrap) return;

      const measure = () => {
        const overflows = wrap.scrollWidth - wrap.clientWidth > 4;
        block.classList.toggle('is-scrollable', overflows);
      };
      measure();

      if (!block.dataset.rtObserved && typeof ResizeObserver !== 'undefined') {
        block.dataset.rtObserved = '1';
        new ResizeObserver(measure).observe(wrap);
      }
    });
  }

  return { render, escapeHtml, enhance };
})();

if (typeof window !== 'undefined') window.RichText = RichText;
