/* ==========================================================================
   richText.js — Renderizador de texto enriquecido para la teoría
   --------------------------------------------------------------------------
   El contenido se guarda como TEXTO PLANO en la base de datos (columna
   lesson_subsections.content). Este módulo lo convierte en HTML con estructura
   y estilo, sin dependencias externas.

   Sintaxis soportada (se escribe directamente en el textarea del admin):
     ## Texto            -> subtítulo dentro de la sección
     - item  /  • item   -> lista con viñetas
     1. item             -> lista numerada
     > Texto             -> nota destacada (aviso / consejo)
     ---                 -> separador
     **negrita**         -> énfasis fuerte
     *cursiva*           -> énfasis
     `código`            -> fragmento técnico monoespaciado
     línea en blanco     -> separa párrafos (cada línea suelta también es párrafo)
   ========================================================================== */

const RichText = (() => {

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* Formato en línea. Se aplica SOBRE el texto ya escapado, así que el
     resultado siempre es seguro para innerHTML. */
  function inline(text) {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code class="rt-code">$1</code>');
  }

  function render(text) {
    if (text === null || text === undefined) return '';
    const raw = String(text).replace(/\r\n?/g, '\n');
    if (!raw.trim()) return '';

    const lines = raw.split('\n');
    const out = [];
    let list = null;   // { tag: 'ul' | 'ol', items: [] }
    let note = null;   // [líneas de la nota]

    const flushList = () => {
      if (!list) return;
      out.push(`<${list.tag} class="rt-list">${list.items.join('')}</${list.tag}>`);
      list = null;
    };
    const flushNote = () => {
      if (!note) return;
      out.push(`<div class="rt-note">${note.map(inline).join('<br>')}</div>`);
      note = null;
    };
    const flushAll = () => { flushList(); flushNote(); };

    lines.forEach(line => {
      const t = line.trim();

      // Línea vacía: cierra bloques abiertos
      if (!t) { flushAll(); return; }

      // Separador
      if (/^-{3,}$/.test(t)) { flushAll(); out.push('<hr class="rt-hr">'); return; }

      // Subtítulo interno
      const heading = t.match(/^#{2,4}\s+(.+)$/);
      if (heading) {
        flushAll();
        out.push(`<h4 class="rt-h">${inline(escapeHtml(heading[1]))}</h4>`);
        return;
      }

      // Nota destacada (puede ocupar varias líneas consecutivas)
      const noteMatch = t.match(/^>\s?(.*)$/);
      if (noteMatch) {
        flushList();
        if (!note) note = [];
        note.push(escapeHtml(noteMatch[1]));
        return;
      }

      // Viñeta: acepta "-", "•", "·" y también el guion largo
      const bullet = t.match(/^[-•·–]\s*(.+)$/);
      if (bullet) {
        flushNote();
        if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
        list.items.push(`<li>${inline(escapeHtml(bullet[1]))}</li>`);
        return;
      }

      // Lista numerada
      const numbered = t.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        flushNote();
        if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
        list.items.push(`<li>${inline(escapeHtml(numbered[1]))}</li>`);
        return;
      }

      // Párrafo normal
      flushAll();
      out.push(`<p>${inline(escapeHtml(t))}</p>`);
    });

    flushAll();
    return out.join('');
  }

  return { render, escapeHtml };
})();

if (typeof window !== 'undefined') window.RichText = RichText;
