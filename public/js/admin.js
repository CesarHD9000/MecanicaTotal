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
    DUPLICATE_DAY: 'Ya existe una lección con ese número de día.',
    DB_ERROR: 'La base de datos rechazó la operación.'
  };

  function describeError(err) {
    if (!err) return ERROR_MESSAGES.DB_ERROR;
    if (err.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code];
    return ERROR_MESSAGES.DB_ERROR;
  }

  // Los iconos SVG de la navbar los pinta js/boot.js.

  document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('adminDaysTableBody');
    const searchInput = document.getElementById('adminSearch');

    let cachedDays = [];

    // ------------------------------------------------------------------------
    // DASHBOARD
    // ------------------------------------------------------------------------
    async function renderDashboard(days) {
      try {
        // El editor ya trae las lecciones recién guardadas: se reutilizan en
        // lugar de repetir la consulta (que además incluye galería y videos).
        cachedDays = Array.isArray(days) ? days : await DbService.getAllDays();
      } catch (err) {
        // Un fallo de red no es lo mismo que una base de datos vacía: se dice
        // cuál de los dos es y se ofrece reintentar.
        console.error('[Admin] No se pudo cargar el panel:', err && err.code);
        cachedDays = [];
        renderTableState({
          tone: 'error',
          icon: 'fa-plug-circle-xmark',
          title: 'No se pudo cargar el contenido',
          text: describeError(err) + ' Revisa tu conexión e inténtalo de nuevo.',
          actionLabel: 'Reintentar',
          onAction: renderDashboard
        });
        Notify.error('No se pudo cargar el panel: ' + describeError(err));
        return;
      }

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
      document.getElementById('statFinalQuizCount').textContent = finalQuiz && finalQuiz.questions ? finalQuiz.questions.length : 0;

      renderTable();
      renderDashStatus();
      renderDashPreview();

      // Contador de mensajes nuevos en el botón de la bandeja (silencioso si
      // la RLS todavía no permite leer).
      refreshInboxBadge();
    }

    /* Muestra un bloque de estado dentro de la tabla, ocupando la fila entera. */
    function renderTableState(opts) {
      tableBody.innerHTML = '<tr><td colspan="6" class="table-state-cell"></td></tr>';
      Notify.state(tableBody.querySelector('.table-state-cell'), opts);
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
            <td>
              <div class="table-day-title">${escapeHtml(d.title)}</div>
              <small class="table-day-desc">${escapeHtml(d.shortDesc || '')}</small>
            </td>
            <td data-label="Teoría"><span class="badge">${subCount} subsecciones</span></td>
            <td data-label="Galería"><span class="badge">${galCount} imágenes</span></td>
            <td data-label="Quiz"><span class="badge">${quizCount} preguntas</span></td>
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
        // Se distingue "no hay lecciones todavía" de "el filtro no encuentra nada":
        // el mensaje y la acción posible son distintos.
        if (!days.length) {
          renderTableState({
            icon: 'fa-folder-open',
            title: 'Aún no hay lecciones',
            text: 'Crea la primera para que aparezca en el catálogo público.',
            actionLabel: 'Crear la primera lección',
            onAction: () => navigateTo('#lecciones/nuevo')
          });
          return;
        }
        renderTableState({
          icon: 'fa-magnifying-glass',
          title: 'Sin coincidencias',
          text: 'Ninguna lección coincide con la búsqueda.',
          actionLabel: 'Limpiar búsqueda',
          onAction: () => { searchInput.value = ''; renderTable(); }
        });
        return;
      }

      tableBody.innerHTML = html;

      tableBody.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(`#lecciones/dia-${btn.dataset.day}`));
      });

      tableBody.querySelectorAll('[data-action="quiz"]').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(`#lecciones/dia-${btn.dataset.day}/quiz`));
      });

      tableBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const day = btn.dataset.day;
          if (!confirm(`¿Estás seguro de que deseas eliminar el Día ${day}?\nEsta acción no se puede deshacer.`)) return;
          try {
            await DbService.deleteDay(day);
            await renderDashboard();
            Notify.success(`Día ${day} eliminado.`);
          } catch (err) {
            Notify.error('No se pudo eliminar el día. ' + describeError(err));
          }
        });
      });
    }

    searchInput.addEventListener('input', renderTable);

    // ------------------------------------------------------------------------
    // BANDEJA DE CONTACTO
    // ------------------------------------------------------------------------
    const inboxModal = document.getElementById('inboxModal');
    const inboxList = document.getElementById('inboxList');
    const inboxDetail = document.getElementById('inboxDetail');
    const inboxBody = inboxModal ? inboxModal.querySelector('.inbox-body') : null;
    const inboxSearch = document.getElementById('inboxSearch');
    const inboxUnreadBadge = document.getElementById('inboxUnreadBadge');

    let inboxMessages = [];
    let inboxFilter = 'all';
    let inboxQuery = '';
    let inboxSelectedId = null;

    /* 'nuevo' | 'respondido'. Si la migración de la columna aún no se ejecutó,
       el campo llega undefined y se trata como nuevo. */
    const inboxStatusOf = (msg) => (msg.status === 'respondido' ? 'respondido' : 'nuevo');

    const inboxDate = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
    };

    /* Fecha corta para la lista: hoy / ayer / 27 oct. Así el nombre no se
       trunca por culpa de una fecha larga. */
    const inboxShortDate = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const hoy = new Date();
      const dias = Math.floor((hoy.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
      if (dias === 0) return new Intl.DateTimeFormat('es-CL', { timeStyle: 'short' }).format(d);
      if (dias === 1) return 'Ayer';
      return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' }).format(d);
    };

    function inboxMatches(msg) {
      if (inboxFilter !== 'all' && inboxStatusOf(msg) !== inboxFilter) return false;
      if (!inboxQuery) return true;
      const hay = `${msg.name || ''} ${msg.email || ''} ${msg.message || ''}`.toLowerCase();
      return hay.includes(inboxQuery);
    }

    function renderInboxBadge() {
      if (!inboxUnreadBadge) return;
      const nuevas = inboxMessages.filter(m => inboxStatusOf(m) === 'nuevo').length;
      inboxUnreadBadge.textContent = String(nuevas);
      inboxUnreadBadge.hidden = nuevas === 0;
    }

    function renderInboxCounts() {
      const counts = { all: inboxMessages.length, nuevo: 0, respondido: 0 };
      inboxMessages.forEach(m => { counts[inboxStatusOf(m)] += 1; });
      inboxModal.querySelectorAll('[data-inbox-count]').forEach(el => {
        el.textContent = String(counts[el.dataset.inboxCount] ?? 0);
      });
    }

    function renderInboxList() {
      const visibles = inboxMessages.filter(inboxMatches);

      if (!visibles.length) {
        Notify.state(inboxList, inboxMessages.length
          ? {
              icon: 'fa-magnifying-glass',
              title: 'Sin coincidencias',
              text: 'Ningún mensaje coincide con el filtro o la búsqueda.',
              actionLabel: 'Ver todas',
              onAction: () => {
                inboxFilter = 'all';
                inboxQuery = '';
                if (inboxSearch) inboxSearch.value = '';
                syncInboxFilterButtons();
                renderInboxList();
              }
            }
          : {
              icon: 'fa-inbox',
              title: 'Todavía no hay mensajes',
              text: 'Los que lleguen desde el formulario de contacto aparecerán aquí.'
            });
        return;
      }

      inboxList.innerHTML = visibles.map(msg => {
        const estado = inboxStatusOf(msg);
        const nombre = msg.name || 'Sin nombre';
        const inicial = nombre.trim().charAt(0).toUpperCase() || '?';
        const seleccionado = String(msg.id) === String(inboxSelectedId);
        return `
          <button type="button" class="inbox-item${estado === 'nuevo' ? ' is-nuevo' : ''}${seleccionado ? ' is-selected' : ''}"
                  data-inbox-id="${escapeHtml(String(msg.id))}" role="listitem"
                  aria-current="${seleccionado ? 'true' : 'false'}">
            <span class="inbox-avatar" aria-hidden="true">${escapeHtml(inicial)}</span>
            <span class="inbox-item-main">
              <span class="inbox-item-top">
                <span class="inbox-item-name">${escapeHtml(nombre)}</span>
                <span class="inbox-item-date">${escapeHtml(inboxShortDate(msg.created_at))}</span>
              </span>
              <span class="inbox-item-snippet">${escapeHtml(msg.message || '')}</span>
            </span>
          </button>
        `;
      }).join('');

      inboxList.querySelectorAll('[data-inbox-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          inboxSelectedId = btn.dataset.inboxId;
          if (inboxBody) inboxBody.classList.add('is-detail-open');
          renderInboxList();
          renderInboxDetail();
        });
      });
    }

    function renderInboxDetail() {
      if (!inboxDetail) return;
      const msg = inboxMessages.find(m => String(m.id) === String(inboxSelectedId));

      if (!msg) {
        inboxDetail.innerHTML = '<div class="inbox-detail-empty"></div>';
        Notify.state(inboxDetail.querySelector('.inbox-detail-empty'), {
          icon: 'fa-envelope-open-text',
          title: 'Selecciona un mensaje',
          text: 'Elige uno de la lista para leerlo y responderlo.'
        });
        return;
      }

      const estado = inboxStatusOf(msg);
      const nombre = msg.name || 'Sin nombre';

      inboxDetail.innerHTML = `
        <button type="button" class="inbox-back" data-inbox-back>
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Volver
        </button>

        <div class="inbox-detail-head">
          <div>
            <p class="inbox-detail-name">${escapeHtml(nombre)}</p>
            <a class="inbox-detail-mail" href="mailto:${escapeHtml(msg.email || '')}">
              <i class="fa-solid fa-envelope" aria-hidden="true"></i> ${escapeHtml(msg.email || '—')}
            </a>
          </div>
          <div class="inbox-detail-status">
            <span class="inbox-chip inbox-chip--${estado}">
              <i class="fa-solid ${estado === 'respondido' ? 'fa-circle-check' : 'fa-circle'}" aria-hidden="true"></i>
              ${estado === 'respondido' ? 'Respondido' : 'Nuevo'}
            </span>
            <p class="inbox-detail-date">${escapeHtml(inboxDate(msg.created_at))}</p>
          </div>
        </div>

        <div class="inbox-message">${escapeHtml(msg.message || '')}</div>

        <div class="inbox-reply">
          <label class="inbox-reply-label" for="inboxReplyText">Tu respuesta</label>
          <textarea id="inboxReplyText" spellcheck="true">${escapeHtml(`Hola ${nombre},\n\nGracias por escribir a MeKa Total.\n\n`)}</textarea>
          <p class="inbox-reply-hint">
            El botón abre tu programa de correo con el mensaje ya escrito y el texto original citado.
            El envío real necesita un proveedor de correo configurado; desde aquí queda registrado como respondido.
          </p>
        </div>

        <div class="inbox-actions">
          <button type="button" class="btn btn--primary btn--sm" data-inbox-reply>
            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Abrir en tu correo
          </button>
          <button type="button" class="btn btn--outline btn--sm" data-inbox-toggle>
            ${estado === 'respondido' ? 'Marcar como nueva' : 'Marcar como respondida'}
          </button>
          <button type="button" class="btn btn--ghost btn--sm btn--danger-ghost" data-inbox-delete>
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Eliminar
          </button>
        </div>
      `;

      inboxDetail.querySelector('[data-inbox-back]')?.addEventListener('click', () => {
        if (inboxBody) inboxBody.classList.remove('is-detail-open');
        inboxSelectedId = null;
        renderInboxList();
        renderInboxDetail();
      });

      inboxDetail.querySelector('[data-inbox-reply]')?.addEventListener('click', () => {
        const texto = inboxDetail.querySelector('#inboxReplyText').value.trim();
        const cuerpo = `${texto}\n\n---\nTu mensaje original:\n${msg.message || ''}`;
        const asunto = 'Re: Tu consulta en MeKa Total';
        window.location.href =
          `mailto:${encodeURIComponent(msg.email || '')}` +
          `?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
      });

      inboxDetail.querySelector('[data-inbox-toggle]')?.addEventListener('click', async (e) => {
        const nuevo = estado === 'respondido' ? 'nuevo' : 'respondido';
        e.currentTarget.disabled = true;
        try {
          await DbService.setContactMessageStatus(msg.id, nuevo);
          msg.status = nuevo;
          msg.replied_at = nuevo === 'respondido' ? new Date().toISOString() : null;
          Notify.success(nuevo === 'respondido' ? 'Marcado como respondido.' : 'Marcado como nuevo.');
          renderInboxCounts();
          renderInboxBadge();
          renderInboxList();
          renderInboxDetail();
        } catch (err) {
          Notify.error(describeError(err));
          e.currentTarget.disabled = false;
        }
      });

      inboxDetail.querySelector('[data-inbox-delete]')?.addEventListener('click', async (e) => {
        if (!confirm(`¿Eliminar el mensaje de ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
        e.currentTarget.disabled = true;
        try {
          await DbService.deleteContactMessage(msg.id);
          inboxMessages = inboxMessages.filter(m => String(m.id) !== String(msg.id));
          inboxSelectedId = null;
          if (inboxBody) inboxBody.classList.remove('is-detail-open');
          Notify.success('Mensaje eliminado.');
          renderInboxCounts();
          renderInboxBadge();
          renderInboxList();
          renderInboxDetail();
        } catch (err) {
          Notify.error(describeError(err));
          e.currentTarget.disabled = false;
        }
      });
    }

    function syncInboxFilterButtons() {
      inboxModal.querySelectorAll('[data-inbox-filter]').forEach(btn => {
        const activo = btn.dataset.inboxFilter === inboxFilter;
        btn.classList.toggle('is-active', activo);
        btn.setAttribute('aria-pressed', String(activo));
      });
    }

    async function loadInbox() {
      try {
        inboxMessages = await DbService.listContactMessages();
      } catch (err) {
        inboxMessages = [];
        renderInboxBadge();
        Notify.state(inboxList, {
          tone: 'error',
          icon: 'fa-plug-circle-xmark',
          title: 'No se pudieron cargar los mensajes',
          text: describeError(err) + ' Si es la primera vez, revisa que la migración de la bandeja esté ejecutada.',
          actionLabel: 'Reintentar',
          onAction: loadInbox
        });
        return;
      }

      // Se conserva la selección si el mensaje sigue existiendo.
      if (inboxSelectedId && !inboxMessages.some(m => String(m.id) === String(inboxSelectedId))) {
        inboxSelectedId = null;
      }
      renderInboxCounts();
      renderInboxBadge();
      renderInboxList();
      renderInboxDetail();
    }

    async function openInbox() {
      if (!inboxModal) return;
      inboxModal.classList.add('is-open');
      if (inboxBody) inboxBody.classList.remove('is-detail-open');
      syncInboxFilterButtons();
      await loadInbox();
    }

    function closeInbox() {
      if (inboxModal) inboxModal.classList.remove('is-open');
    }

    /* El contador del botón se actualiza al entrar al panel, sin abrir la bandeja.
       Si la RLS aún no permite leer, se ignora en silencio. */
    async function refreshInboxBadge() {
      try {
        inboxMessages = await DbService.listContactMessages();
        renderInboxBadge();
        renderDashInbox(false);
      } catch (err) {
        if (inboxUnreadBadge) inboxUnreadBadge.hidden = true;
        renderDashInbox(true);
      }
    }

    if (inboxModal) {
      document.getElementById('btnOpenInbox')?.addEventListener('click', openInbox);
      document.getElementById('closeInboxModal')?.addEventListener('click', closeInbox);

      inboxModal.querySelectorAll('[data-inbox-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          inboxFilter = btn.dataset.inboxFilter;
          syncInboxFilterButtons();
          renderInboxList();
        });
      });

      inboxSearch?.addEventListener('input', (e) => {
        inboxQuery = e.target.value.trim().toLowerCase();
        renderInboxList();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && inboxModal.classList.contains('is-open')) closeInbox();
      });
    }

    // ------------------------------------------------------------------------
    // ESTRUCTURA DEL DASHBOARD — navegación lateral y tarjetas de resumen
    // ------------------------------------------------------------------------
    const sidebarEl = document.getElementById('adminSidebar');
    const sidebarBackdrop = document.getElementById('adminSidebarBackdrop');
    const menuToggle = document.getElementById('adminMenuToggle');
    const topbarTitle = document.getElementById('adminTopbarTitle');

    function closeSidebar() {
      if (!sidebarEl) return;
      sidebarEl.classList.remove('is-open');
      if (sidebarBackdrop) sidebarBackdrop.hidden = true;
      if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    }

    if (menuToggle && sidebarEl) {
      menuToggle.addEventListener('click', () => {
        const abierto = sidebarEl.classList.toggle('is-open');
        if (sidebarBackdrop) sidebarBackdrop.hidden = !abierto;
        menuToggle.setAttribute('aria-expanded', String(abierto));
      });
    }
    sidebarBackdrop?.addEventListener('click', closeSidebar);

    /* ------------------------------------------------------------------------
       RUTAS DEL PANEL
       Una sola página, rutas con hash:
         #dashboard · #lecciones · #lecciones/nuevo
         #lecciones/dia-3/teoria · #quiz-final
       Al recargar se reconstruye desde el hash, así que el editor sobrevive a F5.
       ---------------------------------------------------------------------- */
    const VIEW_TITLES = {
      dashboard: 'Dashboard',
      lecciones: 'Lecciones',
      editor: 'Editar lección',
      'quiz-final': 'Quiz final'
    };
    const adminViews = [...document.querySelectorAll('.admin-view')];
    let authOk = false;
    let currentRouteKey = null;
    let appliedHash = '#dashboard';

    function parseRoute() {
      const raw = (location.hash || '').replace(/^#/, '');
      if (!raw || raw === 'dashboard') return { view: 'dashboard' };
      if (raw === 'lecciones') return { view: 'lecciones' };
      if (raw === 'quiz-final') return { view: 'quiz-final' };

      const match = raw.match(/^lecciones\/(nuevo|dia-(\d+))(?:\/([a-z-]+))?$/);
      if (match) {
        return {
          view: 'editor',
          day: match[1] === 'nuevo' ? null : parseInt(match[2], 10),
          section: match[3] || 'general'
        };
      }
      return { view: 'dashboard' };
    }

    const routeKeyOf = (r) => [
      r.view,
      r.day === null || r.day === undefined ? '' : r.day,
      r.section || ''
    ].join('|');

    function setActiveNav(view) {
      const target = view === 'editor' ? 'lecciones' : view;
      document.querySelectorAll('[data-admin-nav]').forEach(el => {
        el.classList.toggle('is-active', el.dataset.adminNav === target);
      });
    }

    /* Vista sin editor: dashboard o gestor. No toca el hash. */
    function showStaticView(id) {
      const target = document.getElementById(id) || adminViews[0];
      if (!target) return;
      adminViews.forEach(v => { v.hidden = v !== target; });
      document.body.classList.remove('editing');
      setActiveNav(target.id);
      if (topbarTitle) topbarTitle.textContent = VIEW_TITLES[target.id] || target.id;
    }

    function navigateTo(hash) {
      if (location.hash === hash) {
        applyRoute();
        return;
      }
      location.hash = hash;   // dispara hashchange → applyRoute
    }

    function applyRoute() {
      const route = parseRoute();
      const key = routeKeyOf(route);

      if (key === currentRouteKey) return;
      if (!authOk) { showStaticView('dashboard'); return; }

      // Guarda de cambios sin guardar antes de abandonar un editor.
      const estabaEditando = Boolean(currentRouteKey) &&
        (currentRouteKey.startsWith('editor|') || currentRouteKey.startsWith('quiz-final|'));

      if (estabaEditando && window.LessonEditor && LessonEditor.isDirty()) {
        const salir = window.confirm(
          'Tienes cambios sin guardar en este contenido.\n¿Salir y descartarlos?'
        );
        if (!salir) {
          history.replaceState(null, '', appliedHash);
          return;
        }
      }

      window.LessonEditor?.unmount();
      currentRouteKey = key;

      const targetId = route.view;
      const target = document.getElementById(targetId);
      if (!target) return;

      adminViews.forEach(v => { v.hidden = v !== target; });
      document.body.classList.toggle('editing', targetId === 'editor' || targetId === 'quiz-final');
      setActiveNav(targetId);

      if (topbarTitle) {
        topbarTitle.textContent = targetId === 'editor'
          ? (route.day ? `Día ${route.day}` : 'Nuevo día')
          : (VIEW_TITLES[targetId] || targetId);
      }

      if (targetId === 'editor') {
        const abierto = window.LessonEditor?.mountLesson(route.day, route.section);
        if (!abierto) {
          // El día del hash no existe: se vuelve al gestor sin dejar la URL rota.
          history.replaceState(null, '', '#lecciones');
          currentRouteKey = null;
          applyRoute();
          return;
        }
      } else if (targetId === 'quiz-final') {
        window.LessonEditor?.mountFinalQuiz();
      }

      appliedHash = location.hash || '#dashboard';
      if (!location.hash) history.replaceState(null, '', appliedHash);
      window.scrollTo({ top: 0 });
    }

    // Un clic en un enlace con hash y el botón atrás pasan por el mismo filtro.
    window.addEventListener('hashchange', applyRoute);
    window.addEventListener('popstate', applyRoute);

    document.querySelectorAll('[data-admin-nav]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('#' + link.dataset.adminNav);
        closeSidebar();
      });
    });

    // Botones y enlaces que llevan a otra vista.
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('#' + btn.dataset.goto);
        closeSidebar();
      });
    });

    // Alta de lección desde cualquiera de los atajos.
    ['btnNewDay', 'btnNewDayNav', 'btnNewDayLessons'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        closeSidebar();
        navigateTo('#lecciones/nuevo');
      });
    });

    // El atajo de la bandeja dentro de la tarjeta del dashboard.
    document.querySelectorAll('[data-open-inbox]').forEach(btn => {
      btn.addEventListener('click', openInbox);
    });

    // Quiz final: la tarjeta de métricas también abre la vista.
    const finalQuizCard = document.getElementById('cardFinalQuiz');
    if (finalQuizCard) {
      finalQuizCard.addEventListener('click', () => navigateTo('#quiz-final'));
      finalQuizCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateTo('#quiz-final');
        }
      });
    }

    /* Puente para el editor: solo lo que necesita del panel. */
    window.AdminApp = {
      getDays: () => cachedDays,
      refresh: (days) => renderDashboard(days),
      navigate: navigateTo,
      syncEditorRoute: (day, section) => {
        const hash = day ? `#lecciones/dia-${day}/${section}` : `#lecciones/nuevo/${section}`;
        history.replaceState(null, '', hash);
        appliedHash = hash;
        currentRouteKey = routeKeyOf({ view: 'editor', day: day ? Number(day) : null, section });
        if (topbarTitle && day) topbarTitle.textContent = `Día ${day}`;
      },
      errorMessage: describeError
    };

    // Vista inicial estática; la ruta real se aplica cuando hay sesión.
    showStaticView('dashboard');

    /* Últimas consultas en el dashboard. Si la RLS todavía no permite leer,
       la tarjeta lo dice en vez de quedarse vacía. */
    function renderDashInbox(failed) {
      const cont = document.getElementById('dashInboxList');
      if (!cont) return;

      if (failed) {
        Notify.state(cont, {
          tone: 'error',
          icon: 'fa-plug-circle-xmark',
          title: 'No se pudieron cargar',
          text: 'Revisa tu conexión e inténtalo de nuevo.'
        });
        return;
      }

      // Primero las que están sin responder: es lo que hay que atender.
      const nuevas = inboxMessages.filter(m => inboxStatusOf(m) === 'nuevo');
      const lista = (nuevas.length ? nuevas : inboxMessages).slice(0, 3);

      if (!lista.length) {
        Notify.state(cont, {
          icon: 'fa-inbox',
          title: 'Sin consultas todavía',
          text: 'Los mensajes del formulario de contacto aparecerán aquí.'
        });
        return;
      }

      cont.innerHTML = lista.map(msg => {
        const nombre = msg.name || 'Sin nombre';
        const inicial = nombre.trim().charAt(0).toUpperCase() || '?';
        return `
          <button type="button" class="dash-msg" data-dash-msg="${escapeHtml(String(msg.id))}">
            <span class="dash-msg-avatar" aria-hidden="true">${escapeHtml(inicial)}</span>
            <span class="dash-msg-main">
              <span class="dash-msg-top">
                <span class="dash-msg-name">${escapeHtml(nombre)}</span>
                <span class="dash-msg-time">${escapeHtml(inboxShortDate(msg.created_at))}</span>
              </span>
              <span class="dash-msg-text">${escapeHtml(msg.message || '')}</span>
            </span>
          </button>
        `;
      }).join('');

      cont.querySelectorAll('[data-dash-msg]').forEach(btn => {
        btn.addEventListener('click', async () => {
          inboxSelectedId = btn.dataset.dashMsg;
          await openInbox();
          if (inboxSelectedId && inboxBody) inboxBody.classList.add('is-detail-open');
        });
      });
    }

    /* Estado del contenido: cuántos días tienen cada pieza y qué falta.
       Es lo más útil de cara a publicar, más que un contador suelto. */
    function renderDashStatus() {
      const cont = document.getElementById('dashStatusBody');
      if (!cont) return;

      const total = cachedDays.length;
      if (!total) {
        Notify.state(cont, {
          icon: 'fa-folder-open',
          title: 'Sin lecciones',
          text: 'Crea la primera lección para ver el estado del contenido.'
        });
        return;
      }

      const tieneTeoria = (d) => ((d.sections?.theory?.subsections) || []).length > 0;
      const tieneGaleria = (d) => ((d.sections?.gallery) || []).length > 0;
      const tieneVideo = (d) => Boolean(d.sections?.video?.src);
      const tieneQuiz = (d) => ((d.sections?.quiz) || []).length > 0;

      const filas = [
        { label: 'Con teoría', n: cachedDays.filter(tieneTeoria).length },
        { label: 'Con galería de imágenes', n: cachedDays.filter(tieneGaleria).length },
        { label: 'Con video', n: cachedDays.filter(tieneVideo).length },
        { label: 'Con cuestionario', n: cachedDays.filter(tieneQuiz).length }
      ];

      const completos = cachedDays.filter(d =>
        tieneTeoria(d) && tieneGaleria(d) && tieneVideo(d) && tieneQuiz(d)
      ).length;
      const pct = Math.round((completos / total) * 100);

      cont.innerHTML = `
        <div class="dash-progress">
          <div class="dash-progress-top">
            <span class="dash-progress-label">Lecciones completas</span>
            <span class="dash-progress-value">${completos} de ${total}</span>
          </div>
          <div class="dash-progress-bar">
            <div class="dash-progress-fill" data-status-fill="${pct}"></div>
          </div>
        </div>
        <div class="dash-checks">
          ${filas.map(f => {
            const ok = f.n === total;
            return `
              <div class="dash-check ${ok ? 'dash-check--ok' : 'dash-check--missing'}">
                <i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-exclamation'}" aria-hidden="true"></i>
                <span>${escapeHtml(f.label)}</span>
                <span class="dash-check-count">${f.n}/${total}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Ancho de la barra por CSSOM (la CSP no permite style="" en el marcado).
      const fill = cont.querySelector('[data-status-fill]');
      if (fill) fill.style.width = `${pct}%`;
    }

    /* Previsualización: tarjetas de lectura con la portada, el resumen y qué
       piezas de contenido tiene cada día. Al pulsar se abre el editor. */
    let previewErrorBound = false;

    function renderDashPreview() {
      const grid = document.getElementById('dashPreviewGrid');
      if (!grid) return;

      // Si una portada no carga, se sustituye por el emblema del día.
      if (!previewErrorBound) {
        grid.addEventListener('error', (e) => {
          const img = e.target;
          if (!img || img.tagName !== 'IMG') return;
          const glyph = document.createElement('span');
          glyph.className = 'preview-glyph';
          glyph.innerHTML = icon(img.dataset.icon || 'tools');
          img.replaceWith(glyph);
        }, true);
        previewErrorBound = true;
      }

      if (!cachedDays.length) {
        Notify.state(grid, {
          icon: 'fa-folder-open',
          title: 'Todavía no hay lecciones',
          text: 'Crea la primera para ver aquí cómo quedará el curso.',
          actionLabel: 'Crear la primera lección',
          onAction: () => navigateTo('#lecciones/nuevo')
        });
        return;
      }

      grid.innerHTML = cachedDays.map(d => {
        const sec = d.sections || {};
        const sub = (sec.theory && sec.theory.subsections ? sec.theory.subsections.length : 0);
        const gal = (sec.gallery || []).length;
        const vid = Boolean(sec.video && sec.video.src);
        const quiz = (sec.quiz || []).length;

        const chip = (ok, texto) => `
          <span class="preview-chip${ok ? '' : ' preview-chip--missing'}">
            <i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}" aria-hidden="true"></i>${texto}
          </span>`;

        const chips = [
          chip(sub > 0, sub > 0 ? `${sub} teoría` : 'Sin teoría'),
          chip(gal > 0, gal > 0 ? `${gal} imágenes` : 'Sin galería'),
          chip(vid, vid ? 'Video' : 'Sin video'),
          chip(quiz > 0, quiz > 0 ? `${quiz} preguntas` : 'Sin quiz')
        ].join('');

        const cover = Utils.safeImageUrl(d.coverImage || '');
        const miniatura = cover
          ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" data-icon="${escapeHtml(d.icon || 'tools')}">`
          : `<span class="preview-glyph">${icon(d.icon || 'tools')}</span>`;

        return `
          <button type="button" class="preview-card" data-preview-edit="${escapeHtml(String(d.dayNumber))}">
            <span class="preview-thumb">
              ${miniatura}
              <span class="preview-day">Día ${escapeHtml(String(d.dayNumber))}</span>
            </span>
            <span class="preview-body">
              <span class="preview-title">${escapeHtml(d.title)}</span>
              <span class="preview-desc">${escapeHtml(d.shortDesc || '')}</span>
              <span class="preview-chips">${chips}</span>
            </span>
            <span class="preview-cta">
              Editar contenido
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </span>
          </button>
        `;
      }).join('');

      grid.querySelectorAll('[data-preview-edit]').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(`#lecciones/dia-${btn.dataset.previewEdit}`));
      });
    }

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
        authOk = true;
        loginOverlay.classList.add('is-hidden');
        document.body.classList.remove('is-locked');
        await renderDashboard();
        // La ruta del hash se aplica aquí: el editor no debe montarse antes de
        // saber que hay sesión de administrador.
        currentRouteKey = null;
        applyRoute();
      } else {
        authOk = false;
        currentRouteKey = null;
        if (session && !session.isAdmin) {
          await DbService.logout();
        }
        window.LessonEditor?.unmount();
        window.LoginAnim?.reset?.();
        loginOverlay.classList.remove('is-hidden');
        document.body.classList.add('is-locked');
        loginError.classList.remove('is-visible');
        cachedDays = [];
        renderTable();
        showStaticView('dashboard');
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

      /* Freno a la fuerza bruta en el cliente.
         Es una barrera de defensa en profundidad, no la protección real: vive
         en memoria y se borra al recargar. El límite efectivo lo aplica
         Supabase Auth en el servidor (5 intentos por email cada 5 minutos).
         Aun así frena el caso más común, que es alguien probando a mano. */
      const MAX_INTENTOS = 5;
      const BLOQUEO_MS = 30000;
      let intentosFallidos = 0;
      let bloqueadoHasta = 0;

      function segundosDeBloqueo() {
        return Math.max(0, Math.ceil((bloqueadoHasta - Date.now()) / 1000));
      }

      function mostrarError(mensaje) {
        loginError.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(mensaje)}`;
        loginError.classList.add('is-visible');
      }

      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const espera = segundosDeBloqueo();
        if (espera > 0) {
          mostrarError(`Demasiados intentos fallidos. Espera ${espera} segundo${espera === 1 ? '' : 's'}.`);
          return;
        }

        const email = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;

        loginError.classList.remove('is-visible');

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const textoOriginal = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';
        window.LoginAnim?.playLoading?.();

        const { user: authUser, error } = await DbService.login(email, pass);

        submitBtn.disabled = false;
        submitBtn.innerHTML = textoOriginal;

        if (authUser) {
          intentosFallidos = 0;
          bloqueadoHasta = 0;
          loginError.classList.remove('is-visible');
          loginForm.reset();
          if (window.LoginAnim?.playSuccess) {
            await window.LoginAnim.playSuccess();
          }
          await checkAuth();
        } else {
          window.LoginAnim?.playError?.();
          intentosFallidos += 1;
          if (intentosFallidos >= MAX_INTENTOS) {
            bloqueadoHasta = Date.now() + BLOQUEO_MS;
            intentosFallidos = 0;
            mostrarError(`Demasiados intentos fallidos. Espera ${BLOQUEO_MS / 1000} segundos.`);
          } else {
            const mensaje = MENSAJES_ERROR[error && error.code] || MENSAJES_ERROR.INVALID_CREDENTIALS;
            const restantes = MAX_INTENTOS - intentosFallidos;
            mostrarError(`${mensaje} ${restantes === 1 ? 'Queda 1 intento.' : `Quedan ${restantes} intentos.`}`);
          }
          document.getElementById('loginPass').value = '';
          document.getElementById('loginPass').focus();
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await DbService.logout();
        window.LoginAnim?.reset?.();
        await checkAuth();
      });
    }

    checkAuth();
  });
})();
