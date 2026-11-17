/* ==========================================================================
   notify.js — Avisos y estados de la interfaz
   --------------------------------------------------------------------------
   Un solo sitio para el feedback del usuario:

   · Notify.error / success / info  → toast transitorio, abajo a la derecha.
   · Notify.state(contenedor, ...)  → bloque de estado cuando una zona no
                                      puede mostrar su contenido (error de red
                                      o lista vacía), con acción de reintento.

   Se usa en lugar de `alert()`: un alert bloquea el hilo, no se puede
   estilar, no se puede leer con lector de pantalla de forma consistente y en
   móvil obliga a cerrar un diálogo del navegador.
   ========================================================================== */

const Notify = (() => {
  'use strict';

  const ICONS = {
    success: 'fa-circle-check',
    error: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };

  let stackEl = null;

  function stack() {
    if (stackEl && stackEl.isConnected) return stackEl;
    stackEl = document.createElement('div');
    stackEl.className = 'toast-stack';
    // aria-live en el contenedor: los avisos se anuncian al insertarse.
    stackEl.setAttribute('role', 'status');
    stackEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(stackEl);
    return stackEl;
  }

  function dismiss(el) {
    if (!el || el.dataset.leaving === '1') return;
    el.dataset.leaving = '1';
    el.classList.add('is-leaving');
    // Se retira tras la transición; si el navegador no la dispara, un
    // temporizador lo limpia igualmente.
    const remove = () => el.remove();
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400);
  }

  function show(message, options = {}) {
    const type = ICONS[options.type] ? options.type : 'info';
    const timeout = options.timeout === undefined ? 6000 : options.timeout;

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('i');
    icon.className = `fa-solid ${ICONS[type]} toast-icon`;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('p');
    text.className = 'toast-text';
    text.textContent = message;             // texto, nunca HTML

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Cerrar aviso');
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    close.addEventListener('click', () => dismiss(el));

    el.append(icon, text, close);
    stack().appendChild(el);

    if (timeout > 0) setTimeout(() => dismiss(el), timeout);
    return el;
  }

  /* Bloque de estado dentro de un contenedor.
     opts: { icon, title, text, actionLabel, onAction, tone } */
  function state(container, opts = {}) {
    if (!container) return;

    const tone = opts.tone === 'error' ? ' ui-state--error' : '';
    container.innerHTML = `
      <div class="ui-state${tone}">
        <i class="fa-solid ${opts.icon || 'fa-circle-info'}" aria-hidden="true"></i>
        <p class="ui-state-title"></p>
        <p class="ui-state-text"></p>
      </div>
    `;

    container.querySelector('.ui-state-title').textContent = opts.title || '';
    const textEl = container.querySelector('.ui-state-text');
    if (opts.text) textEl.textContent = opts.text;
    else textEl.remove();

    if (opts.actionLabel && typeof opts.onAction === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--primary btn--sm ui-state-action';
      btn.textContent = opts.actionLabel;
      btn.addEventListener('click', opts.onAction);
      container.querySelector('.ui-state').appendChild(btn);
    }
  }

  return {
    show,
    error: (message, opts = {}) => show(message, { ...opts, type: 'error', timeout: opts.timeout ?? 8000 }),
    success: (message, opts = {}) => show(message, { ...opts, type: 'success' }),
    info: (message, opts = {}) => show(message, { ...opts, type: 'info' }),
    state
  };
})();

if (typeof window !== 'undefined') window.Notify = Notify;
