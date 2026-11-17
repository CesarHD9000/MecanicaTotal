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
  let confirmEl = null;

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

  /* --------------------------------------------------------------------------
     DIÁLOGO DE CONFIRMACIÓN
     Sustituye a window.confirm() por un <dialog> del propio sitio:
       const ok = await Notify.confirm({
         title: 'Eliminar lección',
         message: 'Esta acción no se puede deshacer.',
         confirmText: 'Eliminar',
         danger: true
       });
     Devuelve true si se confirma y false si se cancela (botón o Escape).
     -------------------------------------------------------------------------- */
  function confirmAction(options = {}) {
    const title = String(options.title || 'Confirmar acción');
    const message = String(options.message || '');
    const confirmText = String(options.confirmText || 'Aceptar');
    const cancelText = String(options.cancelText || 'Cancelar');
    const danger = options.danger === true;

    // Solo un diálogo a la vez: si ya hay uno, se cancela.
    if (confirmEl && confirmEl.open) confirmEl.close('cancel');

    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = `confirm-dialog${danger ? ' confirm-dialog--danger' : ''}`;
      dialog.setAttribute('aria-labelledby', 'confirmDialogTitle');
      dialog.setAttribute('aria-describedby', 'confirmDialogText');
      dialog.innerHTML = `
        <div class="confirm-dialog__body">
          <div class="confirm-dialog__icon" aria-hidden="true">
            <i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i>
          </div>
          <h2 class="confirm-dialog__title" id="confirmDialogTitle"></h2>
          <p class="confirm-dialog__text" id="confirmDialogText"></p>
        </div>
        <div class="confirm-dialog__actions">
          <button type="button" class="btn btn--outline" data-confirm-cancel></button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm-ok></button>
        </div>
      `;

      dialog.querySelector('.confirm-dialog__title').textContent = title;
      dialog.querySelector('.confirm-dialog__text').textContent = message;
      dialog.querySelector('[data-confirm-cancel]').textContent = cancelText;
      dialog.querySelector('[data-confirm-ok]').textContent = confirmText;

      const finish = value => {
        if (dialog.open) dialog.close(value);
      };

      dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish('cancel'));
      dialog.querySelector('[data-confirm-ok]').addEventListener('click', () => finish('confirm'));
      dialog.addEventListener('click', event => {
        // Clic en el fondo (el target es el propio <dialog>).
        if (event.target === dialog) finish('cancel');
      });
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish('cancel');
      });
      dialog.addEventListener('close', () => {
        const accepted = dialog.returnValue === 'confirm';
        dialog.remove();
        if (confirmEl === dialog) confirmEl = null;
        resolve(accepted);
      });

      document.body.appendChild(dialog);
      confirmEl = dialog;

      try {
        dialog.showModal();
      } catch (err) {
        // Navegador sin <dialog> modal: se mantiene la confirmación nativa.
        dialog.remove();
        confirmEl = null;
        resolve(window.confirm(`${title}\n\n${message}`));
        return;
      }

      // En acciones destructivas el foco arranca en Cancelar.
      const focusTarget = danger
        ? dialog.querySelector('[data-confirm-cancel]')
        : dialog.querySelector('[data-confirm-ok]');
      focusTarget.focus();
    });
  }

  return {
    show,
    error: (message, opts = {}) => show(message, { ...opts, type: 'error', timeout: opts.timeout ?? 8000 }),
    success: (message, opts = {}) => show(message, { ...opts, type: 'success' }),
    info: (message, opts = {}) => show(message, { ...opts, type: 'info' }),
    state,
    confirm: confirmAction
  };
})();

if (typeof window !== 'undefined') window.Notify = Notify;
