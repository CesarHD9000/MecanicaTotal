/* ==========================================================================
   script.js — Lógica de la plataforma (JavaScript Vanilla ES6, modular)
   Módulos: Navbar · Hero · Reveal · Cursos (Cronograma por Días)
   · Lightbox · Quiz + Medidor (Gauge) · Back-to-top · Formulario de contacto
   ========================================================================== */

/* --------------------------------------------------------------------------
   NAVBAR — sticky + menú hamburguesa + scroll suave + link activo
   -------------------------------------------------------------------------- */
const NavbarModule = (() => {
  let navbar, toggle, links;

  function onScroll() {
    if (!navbar) return;
    navbar.classList.toggle('is-scrolled', window.scrollY > 40);
  }

  function toggleMenu() {
    if (!toggle || !links) return;
    const isOpen = toggle.classList.toggle('is-open');
    links.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  }

  function closeMenu() {
    if (!toggle || !links) return;
    toggle.classList.remove('is-open');
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function init() {
    navbar = document.querySelector('.navbar');
    toggle = document.querySelector('.nav-toggle');
    links = document.querySelector('.nav-links');
    if (!navbar) return;

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (toggle) toggle.addEventListener('click', toggleMenu);
    if (links) links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

    const sections = document.querySelectorAll('main section[id]');
    const navA = links ? links.querySelectorAll('a[href^="#"]') : [];
    if ('IntersectionObserver' in window && sections.length) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            navA.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(s => obs.observe(s));
    }
  }

  return { init };
})();

/* --------------------------------------------------------------------------
   HERO — carrusel automático de ilustraciones
   -------------------------------------------------------------------------- */
const HeroModule = (() => {
  let slides, dots, index = 0, timer;

  function go(i) {
    if (!slides || !slides.length) return;
    slides[index].classList.remove('is-active');
    if (dots && dots[index]) dots[index].classList.remove('is-active');
    index = (i + slides.length) % slides.length;
    slides[index].classList.add('is-active');
    if (dots && dots[index]) dots[index].classList.add('is-active');
  }

  function next() { go(index + 1); }

  function restart() {
    clearInterval(timer);
    timer = setInterval(next, 4500);
  }

  function init() {
    slides = document.querySelectorAll('.hero-slide');
    dots = document.querySelectorAll('.hero-dots button');
    if (!slides.length) return;
    dots.forEach((d, i) => d.addEventListener('click', () => { go(i); restart(); }));
    restart();
  }

  return { init };
})();

/* --------------------------------------------------------------------------
   REVEAL — animación de aparición al hacer scroll
   -------------------------------------------------------------------------- */
const RevealModule = (() => {
  let obs;

  function init() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
      return;
    }
    obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    observe();
  }

  function observe(scope = document) {
    const items = scope.querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }
    if (obs) {
      items.forEach(el => obs.observe(el));
    } else {
      items.forEach(el => el.classList.add('is-visible'));
    }
  }

  return { init, observe };
})();

/* --------------------------------------------------------------------------
   CURSOS — Flujo progresivo: Catálogo → Intro → Etapas → Siguiente Día
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   ESTILOS DINÁMICOS SIN ATRIBUTOS style
   La CSP no permite `style="..."` escrito en el marcado (style-src sin
   'unsafe-inline'). Los pocos valores que dependen de datos —el ancho de la
   barra de progreso y el color del nivel— viajan en atributos `data-*` y se
   aplican por CSSOM, que la CSP sí permite.
   -------------------------------------------------------------------------- */
function applyDynamicStyles(root) {
  if (!root) return;
  root.querySelectorAll('[data-fill-pct]').forEach(el => {
    el.style.width = `${el.dataset.fillPct}%`;
  });
  root.querySelectorAll('[data-border-color]').forEach(el => {
    el.style.borderColor = el.dataset.borderColor;
  });
  root.querySelectorAll('[data-bg-color]').forEach(el => {
    el.style.backgroundColor = el.dataset.bgColor;
  });
}

const CoursesModule = (() => {
  let treeNavEl, workspaceEl, lmsSidebarEl;
  let activeDayNum = 1;
  let activeStage = 'intro'; // 'intro' | 'theory' | 'gallery' | 'video' | 'quiz'

  const STAGE_SEQUENCE = ['theory', 'gallery', 'video', 'quiz'];
  const STAGE_META = {
    intro:   { label: 'Introducción',  icon: 'fa-solid fa-flag',            short: 'Intro' },
    theory:  { label: 'Teoría',        icon: 'fa-solid fa-book-open',       short: 'Teoría' },
    gallery: { label: 'Guía Visual',   icon: 'fa-solid fa-images',          short: 'Visual' },
    video:   { label: 'Video',         icon: 'fa-solid fa-film',            short: 'Video' },
    quiz:    { label: 'Quiz',          icon: 'fa-solid fa-circle-question', short: 'Quiz' }
  };

  // Progress tracking
  const PROGRESS_KEY = 'meka_progress_v1';
  const LEGACY_PROGRESS_KEY = 'mecanica_progress_v1';
  let courseProgress = {};

  function loadProgress() {
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      if (stored) { courseProgress = JSON.parse(stored) || {}; return; }

      /* Migración única desde la clave con el nombre anterior. Se copia al
         formato nuevo y se elimina para no dejar datos huérfanos. */
      const legacy = localStorage.getItem(LEGACY_PROGRESS_KEY);
      if (!legacy) { courseProgress = {}; return; }
      courseProgress = JSON.parse(legacy) || {};
      saveProgress();
      localStorage.removeItem(LEGACY_PROGRESS_KEY);
    } catch(e) { courseProgress = {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(courseProgress)); } catch(e) {}
  }
  function markStageComplete(dayId, stage) {
    if (!courseProgress[dayId]) courseProgress[dayId] = { completedStages: [] };
    if (!courseProgress[dayId].completedStages.includes(stage)) {
      courseProgress[dayId].completedStages.push(stage);
    }
    saveProgress();
  }
  function isStageComplete(dayId, stage) {
    return (courseProgress[dayId]?.completedStages || []).includes(stage);
  }
  function isStarted(dayId) {
    return (courseProgress[dayId]?.completedStages?.length || 0) > 0;
  }
  function getDayProgressPct(day) {
    const completed = (courseProgress[day.id]?.completedStages || []).length;
    return Math.round((completed / STAGE_SEQUENCE.length) * 100);
  }

  /* ------------------------------------------------------------------------
     PROGRESO POR SUBSECCIÓN
     Se guarda en el MISMO objeto de localStorage que las etapas (una sola
     fuente de verdad), no en la base de datos ni en el panel.
     ------------------------------------------------------------------------ */
  function getTopicProgress(day) {
    const total = theorySubsections(day).length;
    const record = courseProgress[day.id] || {};
    const stored = Array.isArray(record.completedTopics) ? record.completedTopics : [];
    const done = new Set(
      stored.filter(i => Number.isInteger(i) && i >= 0 && i < total)
    );

    /* Compatibilidad: quien completó Teoría con el sistema anterior ya leyó
       todas las subsecciones. Sin dato por tema, se interpreta completo para
       no devolver a pendiente un avance histórico. */
    if (total && done.size === 0 && isStageComplete(day.id, 'theory')) {
      for (let i = 0; i < total; i += 1) done.add(i);
    }

    return {
      done,
      total,
      pct: total ? Math.round((done.size / total) * 100) : 0
    };
  }

  function isTheoryComplete(day) {
    const { done, total } = getTopicProgress(day);
    return total > 0 && done.size >= total;
  }

  /* Marca un tema como leído. La etapa Teoría solo se completa cuando no queda
     ninguna subsección pendiente. Devuelve true si hubo cambio. */
  function markTopicComplete(day, index) {
    const { done, total } = getTopicProgress(day);
    if (!total || done.has(index)) return false;

    if (!courseProgress[day.id]) courseProgress[day.id] = { completedStages: [] };
    const next = new Set(done);
    next.add(index);
    courseProgress[day.id].completedTopics = [...next].sort((a, b) => a - b);

    if (next.size >= total) {
      const stages = courseProgress[day.id].completedStages || [];
      if (!stages.includes('theory')) stages.push('theory');
      courseProgress[day.id].completedStages = stages;
    }

    saveProgress();
    return true;
  }

  /* ------------------------------------------------------------------------
     TEMA DE TEORÍA SELECCIONADO
     Es estado de LECTURA, no de progreso: no toca `completedStages` ni el
     porcentaje del curso. Se guarda por día para poder retomar la lectura al
     cambiar de etapa y volver.
     ------------------------------------------------------------------------ */
  const theoryIndexByDay = {};

  function theorySubsections(day) {
    return (day && day.sections && day.sections.theory && day.sections.theory.subsections) || [];
  }

  function getTheoryIndex(day) {
    const total = theorySubsections(day).length;
    if (!total) return 0;
    const saved = theoryIndexByDay[day.id];
    return Number.isInteger(saved) && saved >= 0 && saved < total ? saved : 0;
  }

  function setTheoryIndex(day, index) {
    const total = theorySubsections(day).length;
    if (!total) return;
    theoryIndexByDay[day.id] = Math.max(0, Math.min(Number(index) || 0, total - 1));
  }

  /* En tablet y móvil el índice ocupa toda la columna: se pliega al elegir. */
  function collapseIndexOnMobile() {
    if (!lmsSidebarEl) return;
    if (!window.matchMedia('(max-width: 1024px)').matches) return;
    lmsSidebarEl.classList.add('is-collapsed');
    document.getElementById('lmsIndexToggle')?.setAttribute('aria-expanded', 'false');
  }

  let cachedDays = null;
  function getAllDays() { return cachedDays || []; }

  // === SIDEBAR RENDER ===
  function renderTreeNav() {
    if (!treeNavEl) return;
    const days = getAllDays();

    treeNavEl.innerHTML = `
      <div class="tree-level-group" data-level="cronograma">
        <div class="tree-level-header tree-level-header--clickable" id="btnToggleCronograma">
          <span class="tree-inline">
            <i class="fa-solid fa-layer-group tree-icon-accent"></i>
            <span>Mi Curso</span>
          </span>
          <span class="tree-inline">
            <span class="badge">${days.length} ${days.length === 1 ? 'Día' : 'Días'}</span>
            <i class="fa-solid fa-chevron-down tree-header-caret"></i>
          </span>
        </div>
        <div class="tree-module-list">
          ${days.map(d => {
            const isCurrent = String(d.dayNumber) === String(activeDayNum);
            const started = isStarted(d.id);
            const pct = getDayProgressPct(d);
            const allDone = pct === 100;

            // Stage status items
            const stages = ['intro', ...STAGE_SEQUENCE];

            /* Temas de teoría: solo los del día abierto. El resto de días los
               recibe al desplegarse, así el índice no crece sin control. */
            const topics = isCurrent ? theorySubsections(d) : [];
            const topicIndex = getTheoryIndex(d);
            const theoryActive = isCurrent && activeStage === 'theory';
            const topicProgress = getTopicProgress(d);
            const numDigits = String(Math.max(topics.length, 1)).length;

            const topicBlock = topics.length ? `
              <div class="tree-topic-list" role="group" aria-label="Temas de teoría del día ${escapeHtml(d.dayNumber)}" data-digits="${numDigits}">
                ${topics.map((sub, i) => {
                  const active = theoryActive && i === topicIndex;
                  const raw = (sub.subtitle || '').trim() || `Tema ${i + 1}`;
                  /* El número vive dentro del título almacenado ("11. Conclusión").
                     Se separa solo para pintarlo en una columna de ancho fijo:
                     así "9" y "11" no desplazan el texto. Solo se interpreta
                     como número de tema si encaja con su posición; un título que
                     empiece por otra cifra se deja intacto. */
                  const numbered = raw.match(/^(\d+)[.)]\s+(.*)$/);
                  const parsed = numbered ? Number(numbered[1]) : NaN;
                  const useOwnNumber = Number.isInteger(parsed) && parsed >= 1 && parsed <= topics.length;
                  const number = useOwnNumber ? numbered[1] : String(i + 1);
                  const label = useOwnNumber ? (numbered[2] || raw) : raw;
                  const complete = topicProgress.done.has(i);
                  const stateLabel = complete ? 'Completado' : active ? 'En curso' : 'Pendiente';
                  const stateIcon = complete
                    ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>'
                    : active
                      ? '<i class="fa-solid fa-circle-play" aria-hidden="true"></i>'
                      : '<i class="fa-regular fa-circle" aria-hidden="true"></i>';
                  const stateClass = complete ? ' is-complete' : active ? ' is-current' : '';

                  return `
                    <button type="button" class="tree-topic-item${active ? ' is-active' : ''}${stateClass}"
                      data-topic-index="${i}" data-day="${d.dayNumber}"
                      aria-current="${active ? 'true' : 'false'}"
                      title="${escapeHtml(raw)}">
                      <span class="tree-topic-state tree-topic-state--${complete ? 'done' : active ? 'current' : 'pending'}"
                            role="img" aria-label="${stateLabel}">${stateIcon}</span>
                      <span class="tree-topic-num">${escapeHtml(number)}</span>
                      <span class="tree-topic-label">${escapeHtml(label)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            ` : '';

            const stageItems = stages.map(stage => {
              const isDoneStage = stage === 'intro' ? isStarted(d.id) : isStageComplete(d.id, stage);
              const isActiveStage = isCurrent && activeStage === stage;
              let iconHtml, statusClass;
              if (isDoneStage) {
                iconHtml = `<i class="fa-solid fa-circle-check tree-state-icon tree-state-icon--done" aria-label="Completado"></i>`;
                statusClass = 'is-completed';
              } else if (isActiveStage) {
                iconHtml = `<i class="fa-solid fa-circle-play tree-state-icon tree-state-icon--current" aria-label="En curso"></i>`;
                statusClass = 'is-active-stage';
              } else {
                iconHtml = `<i class="fa-regular fa-circle tree-state-icon tree-state-icon--pending" aria-label="Pendiente"></i>`;
                statusClass = '';
              }
              const label = STAGE_META[stage].label;
              const theoryDone = topicProgress.total > 0 && topicProgress.done.size >= topicProgress.total;
              const stageMeta = stage === 'theory' && topicProgress.total
                ? `<span class="tree-stage-meta${theoryDone ? ' is-complete' : ''}">${
                    theoryDone ? 'Completada' : `${topicProgress.done.size}/${topicProgress.total}`
                  }</span>`
                : '';
              return `
                <button class="tree-stage-item ${statusClass}"
                  data-stage-target="${stage}" data-day="${d.dayNumber}">
                  ${iconHtml}
                  <span class="tree-stage-label">${label}</span>
                  ${stageMeta}
                </button>
                ${stage === 'theory' ? topicBlock : ''}
              `;
            }).join('');

            return `
              <div class="tree-day-group ${isCurrent ? 'is-expanded' : ''}" data-day-group="${d.dayNumber}">
                <button class="tree-module-item ${isCurrent ? 'is-active' : ''}" data-tree-day="${d.dayNumber}">
                  <span class="tree-inline">
                    <span class="m-icon-sm">${Utils.safeIcon(d.icon)}</span>
                    <span><strong>Día ${escapeHtml(d.dayNumber)}:</strong> ${escapeHtml(d.title)}</span>
                  </span>
                  <span class="tree-inline tree-inline--sm">
                    ${allDone ? `<i class="fa-solid fa-circle-check tree-state-icon--done-sm" aria-label="Día completado"></i>` : ''}
                    <i class="fa-solid fa-chevron-down tree-caret" aria-hidden="true"></i>
                  </span>
                </button>
                <div class="tree-stage-sublist">
                  ${stageItems}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="tree-final-quiz-card">
          <button class="tree-final-btn ${activeDayNum === 'FINAL' ? 'is-active' : ''}" id="btnTreeFinalQuiz">
            <i class="fa-solid fa-trophy tree-icon-accent--lg"></i>
            <div class="tree-final-quiz-copy">
              <strong>Evaluación Final</strong>
              <small>Diagnóstico de Nivel Global</small>
            </div>
          </button>
        </div>
      </div>
    `;

    // Toggle header
    const headerToggle = treeNavEl.querySelector('#btnToggleCronograma');
    if (headerToggle) {
      headerToggle.addEventListener('click', () => {
        const levelGroup = treeNavEl.querySelector('.tree-level-group');
        if (levelGroup) levelGroup.classList.toggle('is-collapsed');
      });
    }

    // Day toggle — click day title → show intro
    treeNavEl.querySelectorAll('[data-tree-day]').forEach(btn => {
      const dayNum = btn.getAttribute('data-tree-day');
      btn.addEventListener('click', () => {
        const group = btn.closest('.tree-day-group');
        const isExp = group.classList.contains('is-expanded');
        if (!isExp) {
          treeNavEl.querySelectorAll('.tree-day-group').forEach(g => g.classList.remove('is-expanded'));
          group.classList.add('is-expanded');
        }
        collapseIndexOnMobile();
        showCourseIntro(dayNum);
      });
    });

    // Stage item click
    treeNavEl.querySelectorAll('[data-stage-target]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const dayNum = btn.getAttribute('data-day');
        const stageKey = btn.getAttribute('data-stage-target');
        // Se pliega antes de pintar: si se hace después, el documento cambia
        // de alto y el desplazamiento al contenido queda desfasado.
        collapseIndexOnMobile();
        if (stageKey === 'intro') {
          showCourseIntro(dayNum);
        } else {
          showLessonStage(dayNum, stageKey);
        }
      });
    });

    // Tema de teoría: abre la etapa directamente en ese tema.
    treeNavEl.querySelectorAll('[data-topic-index]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const dayNum = btn.getAttribute('data-day');
        const day = getAllDays().find(d => String(d.dayNumber) === String(dayNum));
        if (!day) return;
        setTheoryIndex(day, Number(btn.getAttribute('data-topic-index')));
        collapseIndexOnMobile();
        showLessonStage(dayNum, 'theory');
      });
    });

    // Final quiz
    const finalBtn = treeNavEl.querySelector('#btnTreeFinalQuiz');
    if (finalBtn) finalBtn.addEventListener('click', () => {
      collapseIndexOnMobile();
      openFinalQuiz();
    });
  }

  // === COURSE INTRO SCREEN ===
  /* Todo texto proveniente de la base de datos pasa por Utils antes de entrar
     en una plantilla HTML. Se usan alias cortos para no ensuciar las vistas. */
  const escapeHtml = (value) => Utils.escapeHtml(value);
  const safeImageUrl = (value) => Utils.safeImageUrl(value);

  /* Convierte texto plano en párrafos. Cada salto de línea se considera un
     párrafo nuevo: así la justificación no estira líneas a medias. */
  function toParagraphs(text) {
    return String(text)
      .split(/\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p)}</p>`)
      .join('');
  }

  /* Desplaza la vista al inicio del módulo, compensando la navbar fija.
     Se llama al cambiar de etapa para que el contenido nuevo quede visible
     en lugar de aparecer por encima de la posición actual del usuario. */
  function scrollToWorkspace() {
    if (!workspaceEl) return;
    const navH = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
    ) || 76;

    const destino = () => Math.max(
      0,
      workspaceEl.getBoundingClientRect().top + window.scrollY - navH - 12
    );

    const top = destino();
    // En saltos muy largos (lecciones extensas) la animación tarda demasiado:
    // se salta directo. En distancias cortas se anima para no marear.
    // 'instant' es necesario porque el CSS global fija scroll-behavior:smooth.
    const distancia = Math.abs(window.scrollY - top);
    const behavior = distancia > window.innerHeight * 1.5 ? 'instant' : 'smooth';
    window.scrollTo({ top, behavior });

    // El reemplazo de contenido cambia la altura del documento y el navegador
    // puede reajustar el scroll (anclaje). Se reafirma la posición ya con el
    // layout definitivo.
    if (behavior === 'instant') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.scrollTo({ top: destino(), behavior: 'instant' });
      }));
    }
  }

  function showCourseIntro(dayNum, opts = {}) {
    const days = getAllDays();
    const day = days.find(d => String(d.dayNumber) === String(dayNum)) || days[0];
    if (!day || !workspaceEl) return;
    activeDayNum = day.dayNumber;
    activeStage = 'intro';

    // Update sidebar
    if (treeNavEl) {
      treeNavEl.querySelectorAll('.tree-day-group').forEach(group => {
        const gDay = group.getAttribute('data-day-group');
        const isMatch = String(gDay) === String(day.dayNumber);
        if (isMatch) group.classList.add('is-expanded');
        const item = group.querySelector('.tree-module-item');
        if (item) item.classList.toggle('is-active', isMatch);
      });
      const finalBtn = treeNavEl.querySelector('#btnTreeFinalQuiz');
      if (finalBtn) finalBtn.classList.remove('is-active');
    }

    const started = isStarted(day.id);
    const pct = getDayProgressPct(day);
    const completedCount = (courseProgress[day.id]?.completedStages || []).length;

    // Textos editoriales del módulo: se editan desde el panel de administración.
    const objective = (day.objective || '').trim();
    const introContent = (day.introContent || '').trim();

    // Portada del módulo: fotografía real si el día la define; si no, emblema
    // con el icono de su categoría (nunca una ilustración dibujada).
    const coverImage = safeImageUrl(day.coverImage);
    const heroVisual = coverImage
      ? `<img class="ci-cover-img" src="${escapeHtml(coverImage)}" alt="Portada del módulo: ${escapeHtml(day.title)}" decoding="async">`
      : moduleGlyph(day.icon);

    workspaceEl.innerHTML = `
      <div class="course-intro-screen">
        ${started ? `
        <div class="lms-progress-strip">
          <div class="lps-meta">
            <span class="lps-label">DÍA ${escapeHtml(day.dayNumber)} · ${escapeHtml(day.title).toUpperCase()}</span>
            <span class="lps-step">${completedCount} de ${STAGE_SEQUENCE.length} etapas completadas</span>
          </div>
          <div class="lps-bar-wrap">
            <div class="lps-bar-fill" data-fill-pct="${pct}"></div>
          </div>
          <span class="lps-pct">${pct}% completado</span>
        </div>
        ` : ''}

        <div class="ci-body">
          <div class="course-intro-header">
            <div class="ci-breadcrumb">
              <span class="ci-day-pill">DÍA ${escapeHtml(day.dayNumber)}</span>
              <span class="ci-breadcrumb-sep">/</span>
              <span class="ci-breadcrumb-title">${escapeHtml(day.title)}</span>
            </div>
            <div class="ci-level-badge">
              <i class="fa-solid fa-signal"></i> Nivel Básico
            </div>
          </div>

          <div class="course-intro-hero">
            <div class="ci-hero-content">
              <p class="eyebrow"><i class="fa-solid fa-calendar-day"></i> Mecánica Automotriz · Día ${escapeHtml(day.dayNumber)}</p>
              <h1 class="ci-title">${escapeHtml(day.title)}</h1>
              <p class="ci-desc">${escapeHtml(day.shortDesc || '')}</p>
              ${objective ? `
              <div class="ci-objective" role="note" aria-label="Objetivo del módulo">
                <span class="ci-obj-label"><i class="fa-solid fa-bullseye"></i> OBJETIVO DEL MÓDULO</span>
                <p>${escapeHtml(objective)}</p>
              </div>` : ''}
            </div>
            <div class="ci-icon-visual${coverImage ? ' ci-icon-visual--photo' : ''}" data-icon-key="${escapeHtml(day.icon || 'tools')}"${coverImage ? '' : ' aria-hidden="true"'}>
              ${heroVisual}
            </div>
          </div>

          <div class="ci-stats-bar" role="list" aria-label="Indicadores del módulo">
            <div class="ci-stat" role="listitem">
              <i class="fa-solid fa-list-check icon-accent" aria-hidden="true"></i>
              <span class="ci-stat-value">${STAGE_SEQUENCE.length}</span>
              <span class="ci-stat-label">Etapas</span>
            </div>
            <div class="ci-stat" role="listitem">
              <i class="fa-solid fa-clock icon-accent" aria-hidden="true"></i>
              <span class="ci-stat-value">~45 min</span>
              <span class="ci-stat-label">Estimado</span>
            </div>
            <div class="ci-stat" role="listitem">
              <i class="fa-solid fa-signal icon-accent" aria-hidden="true"></i>
              <span class="ci-stat-value">Básico</span>
              <span class="ci-stat-label">Nivel</span>
            </div>
            <div class="ci-stat" role="listitem">
              <i class="fa-solid fa-certificate icon-accent" aria-hidden="true"></i>
              <span class="ci-stat-value">Quiz</span>
              <span class="ci-stat-label">Evaluación</span>
            </div>
          </div>

          ${introContent ? `
          <div class="ci-intro-section">
            <h3 class="ci-section-title">Introducción</h3>
            <div class="ci-intro-text">${toParagraphs(introContent)}</div>
          </div>` : ''}

          <div class="ci-cta-area">
            ${started && pct < 100 ? `
              <div class="ci-cta-group">
                <button class="btn-cta-start" data-start-day="${day.dayNumber}" data-resume="true">
                  CONTINUAR <i class="fa-solid fa-arrow-right"></i>
                </button>
                <button class="btn-cta-restart" data-restart-day="${day.dayNumber}">
                  <i class="fa-solid fa-rotate-left"></i> Reiniciar
                </button>
              </div>
            ` : pct === 100 ? `
              <div class="ci-cta-group">
                <div class="ci-completed-badge"><i class="fa-solid fa-circle-check"></i> Módulo completado</div>
                <button class="btn-cta-restart" data-restart-day="${day.dayNumber}">
                  <i class="fa-solid fa-rotate-left"></i> Repasar de nuevo
                </button>
              </div>
            ` : `
              <button class="btn-cta-start" data-start-day="${day.dayNumber}">
                COMENZAR CURSO <i class="fa-solid fa-arrow-right"></i>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
    applyDynamicStyles(workspaceEl);

    // CTA listeners
    const startBtn = workspaceEl.querySelector('[data-start-day]');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const dn = startBtn.getAttribute('data-start-day');
        const isResume = startBtn.dataset.resume;
        if (isResume) {
          const firstIncomplete = STAGE_SEQUENCE.find(s => !isStageComplete(day.id, s)) || STAGE_SEQUENCE[0];
          showLessonStage(dn, firstIncomplete);
        } else {
          // Comenzar de cero: la lectura arranca en el primer tema.
          setTheoryIndex(day, 0);
          showLessonStage(dn, 'theory');
        }
      });
    }
    const restartBtn = workspaceEl.querySelector('[data-restart-day]');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        const dn = restartBtn.getAttribute('data-restart-day');
        courseProgress[day.id] = { completedStages: [] };
        delete theoryIndexByDay[day.id];
        saveProgress();
        renderTreeNav();
        showCourseIntro(dn);
      });
    }

    renderTreeNav();

    if (opts.scroll !== false) scrollToWorkspace();
  }

  // === TEORÍA: UN TEMA A LA VEZ ===
  /* La teoría se lee como un artículo: un tema por vista, con su ubicación y
     navegación anterior/siguiente. El contenido y su orden vienen intactos de
     la base de datos; aquí solo se elige cuál se muestra. */
  function renderTheoryStage(day) {
    const subs = theorySubsections(day);

    if (!subs.length) {
      return `
        <div class="theory-reader theory-reader--empty">
          <header class="theory-head">
            <p class="theory-kicker">
              <span>Día ${escapeHtml(day.dayNumber)}</span>
              <span aria-hidden="true">/</span>
              <span>Teoría</span>
            </p>
            <h2 class="theory-topic-title" tabindex="-1">Teoría</h2>
            <p class="theory-empty">Este módulo todavía no tiene contenido teórico.</p>
          </header>
          <footer class="theory-foot">
            <nav class="theory-pager" aria-label="Continuar al siguiente contenido">
              <button type="button" class="theory-pager-btn theory-pager-btn--next theory-pager-btn--stage" data-topic-next-stage>
                <span class="theory-pager-kicker">Sin contenido teórico</span>
                <span class="theory-pager-title">Continuar a Guía visual</span>
              </button>
            </nav>
          </footer>
        </div>
      `;
    }

    const index = getTheoryIndex(day);
    const total = subs.length;
    const current = subs[index];
    const prev = index > 0 ? subs[index - 1] : null;
    const next = index < total - 1 ? subs[index + 1] : null;
    const progress = getTopicProgress(day);
    const doneCount = progress.done.size;
    const isDone = progress.done.has(index);

    const nameOf = (sub, fallback) => escapeHtml(((sub && sub.subtitle) || '').trim() || fallback);
    const title = nameOf(current, `Tema ${index + 1}`);

    return `
      <article class="theory-reader" id="stage-theory-${escapeHtml(day.dayNumber)}" aria-labelledby="theory-topic-title">
        <header class="theory-head">
          <p class="theory-kicker">
            <span>Día ${escapeHtml(day.dayNumber)}</span>
            <span aria-hidden="true">/</span>
            <span>Teoría</span>
          </p>
          <h2 class="theory-topic-title" id="theory-topic-title" tabindex="-1">${title}</h2>
          <div class="theory-meta">
            <span class="theory-count">Tema ${index + 1} de ${total}</span>
            <span class="theory-module">${escapeHtml(day.title)}</span>
          </div>
        </header>

        <div class="theory-body">${RichText.render(current.content)}</div>

        <footer class="theory-foot">
          <div class="theory-complete">
            <div class="theory-complete-info">
              <p class="theory-complete-count">${doneCount} de ${total} temas completados</p>
              <div class="theory-bar" role="progressbar"
                   aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${doneCount}"
                   aria-label="Temas completados de la teoría">
                <span class="theory-bar-fill" data-fill-pct="${progress.pct}"></span>
              </div>
            </div>
            <button type="button" class="theory-complete-btn${isDone ? ' is-done' : ''}"
                    data-topic-complete aria-pressed="${isDone ? 'true' : 'false'}">
              <i class="fa-solid ${isDone ? 'fa-circle-check' : 'fa-check'}" aria-hidden="true"></i>
              ${isDone ? 'Tema completado' : 'Marcar tema como completado'}
            </button>
          </div>

          <nav class="theory-pager" aria-label="Navegación entre temas de teoría">
            ${prev ? `
              <button type="button" class="theory-pager-btn" data-topic-prev="${index - 1}">
                <span class="theory-pager-kicker"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Anterior</span>
                <span class="theory-pager-title">${nameOf(prev, `Tema ${index}`)}</span>
              </button>` : ''}
            ${next ? `
              <button type="button" class="theory-pager-btn theory-pager-btn--next" data-topic-next="${index + 1}">
                <span class="theory-pager-kicker">Siguiente <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
                <span class="theory-pager-title">${nameOf(next, `Tema ${index + 2}`)}</span>
              </button>` : `
              <button type="button" class="theory-pager-btn theory-pager-btn--next theory-pager-btn--stage" data-topic-next-stage>
                <span class="theory-pager-kicker">Fin de la teoría</span>
                <span class="theory-pager-title">Continuar a Guía visual</span>
              </button>`}
          </nav>
        </footer>
      </article>
    `;
  }

  function bindTheoryNavigation(day, dayNum, opts = {}) {
    const goTo = (index) => {
      setTheoryIndex(day, index);
      showLessonStage(dayNum, 'theory');
    };

    const prevBtn = workspaceEl.querySelector('[data-topic-prev]');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => goTo(Number(prevBtn.getAttribute('data-topic-prev'))));
    }

    const nextBtn = workspaceEl.querySelector('[data-topic-next]');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => goTo(Number(nextBtn.getAttribute('data-topic-next'))));
    }

    /* Finalización explícita del tema: leer no marca nada. Se guarda en el
       mismo progreso local y se repinta para actualizar índice, contador y
       etapa (que solo pasa a verde al llegar a 100%). */
    const completeBtn = workspaceEl.querySelector('[data-topic-complete]');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => {
        const index = getTheoryIndex(day);
        if (!markTopicComplete(day, index)) return;
        showLessonStage(dayNum, 'theory', { scroll: false, focusTitle: false });
        workspaceEl.querySelector('[data-topic-complete]')?.focus({ preventScroll: true });
      });
    }

    /* Último tema: solo se completa la etapa al continuar si la teoría no
       tiene subsecciones que marcar. Con temas, la etapa la cierra el 100%. */
    const stageBtn = workspaceEl.querySelector('[data-topic-next-stage]');
    if (stageBtn) {
      stageBtn.addEventListener('click', () => {
        if (!theorySubsections(day).length) markStageComplete(day.id, 'theory');
        renderTreeNav();
        showLessonStage(dayNum, 'gallery');
      });
    }

    // El título recibe el foco al cambiar de tema: se anuncia el contenido
    // nuevo sin obligar al lector de pantalla a recorrer el índice.
    if (opts.focusTitle !== false) {
      const heading = workspaceEl.querySelector('.theory-topic-title');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  // === SINGLE STAGE LESSON VIEW ===
  function showLessonStage(dayNum, stageKey, opts = {}) {
    const days = getAllDays();
    const day = days.find(d => String(d.dayNumber) === String(dayNum)) || days[0];
    if (!day || !workspaceEl) return;
    activeDayNum = day.dayNumber;
    activeStage = stageKey;

    const stageIndex = STAGE_SEQUENCE.indexOf(stageKey);
    const totalStages = STAGE_SEQUENCE.length;
    const completedCount = (courseProgress[day.id]?.completedStages || []).length;
    const pct = Math.round((completedCount / totalStages) * 100);
    const currentStageNum = stageIndex + 1;

    // Navigation logic
    const prevStage = stageIndex > 0 ? STAGE_SEQUENCE[stageIndex - 1] : null;
    const nextStage = stageIndex < totalStages - 1 ? STAGE_SEQUENCE[stageIndex + 1] : null;
    const currentDayIndex = days.findIndex(d => String(d.dayNumber) === String(day.dayNumber));
    const nextDay = currentDayIndex < days.length - 1 ? days[currentDayIndex + 1] : null;

    const sec = day.sections || {};
    const galleryArr = sec.gallery || [];
    const videoObj = sec.video || {};

    // Stage content HTML
    let stageContentHtml = '';
    if (stageKey === 'theory') {
      stageContentHtml = renderTheoryStage(day);
    } else if (stageKey === 'gallery') {
      stageContentHtml = `
        <div class="day-stage-card" id="stage-gallery-${day.dayNumber}">
          <div class="stage-header-tag stage--gallery">
            <i class="fa-solid fa-images"></i> ETAPA 2: GUÍA VISUAL DE COMPONENTES
          </div>
          <p class="video-intro-hint">Haz clic sobre cualquiera de las imágenes para ampliar la ilustración técnica a pantalla completa.</p>
          <div class="gallery-explain-grid">
            ${galleryArr.map((g, idx) => {
              const caption = escapeHtml(g.caption || 'Explicación técnica del componente.');
              const image = safeImageUrl(g.image);
              // Solo es ampliable si hay imagen: sin archivo, el visor se abriría vacío.
              return `
              <div class="gallery-explain-card${image ? '' : ' gallery-explain-card--empty'}"${image ? ` data-lightbox data-caption="${caption}"` : ''}>
                ${image ? `<span class="zoom-hint">${ICONS.zoom}</span>` : ''}
                <div class="gallery-img-container" data-icon-key="${escapeHtml(day.icon || 'tools')}">
                  ${image
                    ? `<img src="${escapeHtml(image)}" alt="${caption}" class="gallery-img-element" loading="lazy">`
                    : moduleGlyph(day.icon, 'sm')}
                </div>
                <div class="gallery-caption-bottom">
                  <span class="caption-badge">Muestra ${idx + 1}</span>
                  <p>${caption}</p>
                </div>
              </div>
            `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (stageKey === 'video') {
      stageContentHtml = `
        <div class="day-stage-card" id="stage-video-${day.dayNumber}">
          <div class="stage-header-tag stage--video">
            <i class="fa-solid fa-film"></i> ETAPA 3: VIDEO DEMOSTRATIVO DE LA LECCIÓN
          </div>
          <div class="video-stage-wrapper">
            ${getEmbedVideoHtml(videoObj)}
            <div class="video-title-footer">
              <i class="fa-solid fa-circle-play icon-accent"></i> ${escapeHtml(videoObj.title || 'Demostración Técnica de la Lección')}
            </div>
          </div>
        </div>
      `;
    } else if (stageKey === 'quiz') {
      stageContentHtml = `
        <div class="day-stage-card" id="stage-quiz-${day.dayNumber}">
          <div class="stage-header-tag stage--quiz">
            <i class="fa-solid fa-circle-question"></i> ETAPA 4: CUESTIONARIO DE EVALUACIÓN
          </div>
          <div class="quiz" data-quiz></div>
        </div>
      `;
    }

    // Stage breadcrumb/stepper
    const stepperHtml = STAGE_SEQUENCE.map((s, i) => {
      const isDone = isStageComplete(day.id, s);
      const isCurr = s === stageKey;
      const meta = STAGE_META[s];
      return `
        <div class="lps-step-node ${isDone ? 'is-done' : ''} ${isCurr ? 'is-current' : ''}">
          <div class="lps-step-dot">
            ${isDone ? `<i class="fa-solid fa-check step-check"></i>` : `<span>${i+1}</span>`}
          </div>
          <span class="lps-step-label">${meta.short}</span>
        </div>
        ${i < STAGE_SEQUENCE.length - 1 ? '<div class="lps-step-line"></div>' : ''}
      `;
    }).join('');

    /* En teoría el avance es tema a tema: el pie no ofrece saltar a la etapa
       siguiente, para no invitar a dejar el resto de temas sin leer. El pager
       del artículo continúa a la guía visual al terminar el último tema. */
    const footerNextHtml = stageKey === 'theory' ? '' : (
      nextStage ? `
            <button class="btn-lesson-next" data-lesson-next="${nextStage}">
              ${stageKey === 'quiz' ? '' : `${STAGE_META[nextStage].label}`} SIGUIENTE <i class="fa-solid fa-arrow-right"></i>
            </button>
          ` : nextDay ? `
            <button class="btn-lesson-next" data-nav-next-day="${nextDay.dayNumber}">
              SIGUIENTE LECCIÓN <i class="fa-solid fa-arrow-right"></i>
            </button>
          ` : `
            <button class="btn-lesson-next" data-nav-final-quiz>
              EVALUACIÓN FINAL <i class="fa-solid fa-trophy"></i>
            </button>
          `
    );

    workspaceEl.innerHTML = `
      <div class="lesson-stage-screen">
        <div class="lms-progress-strip">
          <div class="lps-meta">
            <span class="lps-label">DÍA ${escapeHtml(day.dayNumber)} · ${escapeHtml(day.title).toUpperCase()}</span>
            <span class="lps-step-count">Etapa ${currentStageNum} de ${totalStages}</span>
          </div>
          <div class="lps-bar-wrap">
            <div class="lps-bar-fill" data-fill-pct="${pct}"></div>
          </div>
          <div class="lps-stepper">
            ${stepperHtml}
          </div>
        </div>

        <div class="day-stages-container day-stages-container--flush-top${stageKey === 'theory' ? ' day-stages-container--reading' : ''}">
          ${stageContentHtml}
        </div>

        <div class="lesson-nav-footer${stageKey === 'theory' ? ' lesson-nav-footer--reading' : ''}">
          <button class="btn-lesson-nav" data-lesson-prev>
            ${prevStage ? `<i class="fa-solid fa-arrow-left"></i> ${STAGE_META[prevStage].label}` : `<i class="fa-solid fa-arrow-left"></i> Introducción`}
          </button>
          <div class="lesson-nav-center">
            <span class="lesson-nav-info">${STAGE_META[stageKey].label}</span>
          </div>
          ${footerNextHtml}
        </div>
      </div>
    `;
    applyDynamicStyles(workspaceEl);
    RichText.enhance(workspaceEl);

    // Mark intro as visited / complete
    if (!courseProgress[day.id]) courseProgress[day.id] = { completedStages: [] };

    // Bind quiz
    if (stageKey === 'quiz') {
      LightboxModule.bind(workspaceEl);
      QuizModule.render(workspaceEl.querySelector('[data-quiz]'), sec.quiz || [], day.title, day.quizId);
    } else {
      LightboxModule.bind(workspaceEl);
    }

    if (stageKey === 'theory') bindTheoryNavigation(day, dayNum, opts);

    // Navigation listeners
    const prevBtn = workspaceEl.querySelector('[data-lesson-prev]');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (prevStage) {
          showLessonStage(dayNum, prevStage);
        } else {
          showCourseIntro(dayNum);
        }
      });
    }

    const nextBtn = workspaceEl.querySelector('[data-lesson-next]');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        markStageComplete(day.id, stageKey);
        const targetStage = nextBtn.getAttribute('data-lesson-next');
        showLessonStage(dayNum, targetStage);
        renderTreeNav();
      });
    }

    const nextDayBtn = workspaceEl.querySelector('[data-nav-next-day]');
    if (nextDayBtn) {
      nextDayBtn.addEventListener('click', () => {
        markStageComplete(day.id, stageKey);
        renderTreeNav();
        showCourseIntro(nextDayBtn.getAttribute('data-nav-next-day'));
      });
    }

    const finalQuizBtn = workspaceEl.querySelector('[data-nav-final-quiz]');
    if (finalQuizBtn) {
      finalQuizBtn.addEventListener('click', () => {
        markStageComplete(day.id, stageKey);
        renderTreeNav();
        openFinalQuiz();
      });
    }

    renderTreeNav();

    if (opts.scroll !== false) scrollToWorkspace();
  }

  // === VIDEO EMBED HELPER ===
  /* Solo se incrustan URLs que pasan por la lista blanca de Utils (YouTube,
     Vimeo o archivos de video). Cualquier otro valor se descarta: así una URL
     maliciosa guardada en la BD no puede convertirse en un iframe arbitrario. */
  function getEmbedVideoHtml(videoObj) {
    const title = escapeHtml((videoObj && videoObj.title) || 'Video Demostrativo de la Lección');
    const rawSrc = videoObj && videoObj.src ? String(videoObj.src).trim() : '';

    const placeholder = (text) => `
      <div class="video-placeholder-box">
        <i class="fa-solid fa-circle-play video-placeholder-icon"></i>
        <h4>${title}</h4>
        <p>${text}</p>
      </div>
    `;

    if (!rawSrc) return placeholder('No se ha configurado un video para esta lección todavía.');

    const isUpload = videoObj.type === 'upload' || Utils.isVideoFile(rawSrc) || /^(data:video|blob:)/i.test(rawSrc);

    if (isUpload) {
      const media = Utils.safeMediaUrl(rawSrc);
      if (!media) return placeholder('El archivo de video no es válido.');
      return `<video src="${escapeHtml(media)}" controls preload="metadata" class="day-video-player"></video>`;
    }

    const embedUrl = Utils.formatVideoUrl(rawSrc);
    if (!embedUrl) {
      return placeholder('El enlace del video no es válido. Usa un enlace de YouTube, Vimeo o un archivo MP4/WebM.');
    }

    return `<iframe src="${escapeHtml(embedUrl)}" title="${title}" loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen class="day-video-iframe"></iframe>`;
  }

  // === FINAL QUIZ ===
  async function openFinalQuiz(opts = {}) {
    activeDayNum = 'FINAL';
    activeStage = 'final';
    if (treeNavEl) {
      treeNavEl.querySelectorAll('.tree-day-group').forEach(group => {
        group.classList.remove('is-expanded');
        const item = group.querySelector('.tree-module-item');
        if (item) item.classList.remove('is-active');
      });
      const finalBtn = treeNavEl.querySelector('#btnTreeFinalQuiz');
      if (finalBtn) finalBtn.classList.add('is-active');
    }

    let finalQuiz = null;
    if (typeof DbService !== 'undefined') {
      finalQuiz = await DbService.getFinalQuiz();
    }

    workspaceEl.innerHTML = `
      <div class="exam-intro-header">
        <div>
          <span class="eyebrow"><i class="fa-solid fa-trophy"></i> Evaluación Global del Curso</span>
          <h3>Examen Final de Diagnóstico Técnico</h3>
          <p>Responde a este examen integrador para evaluar tus conocimientos técnicos acumulados en todas las lecciones y obtener tu diagnóstico de nivel profesional.</p>
        </div>
      </div>
      <div class="day-stages-container">
        <div class="day-stage-card">
          <div class="stage-header-tag stage--quiz">
            <i class="fa-solid fa-award"></i> EXAMEN FINAL DE DIAGNÓSTICO DE NIVEL
          </div>
          <div class="quiz" data-final-quiz-container></div>
        </div>
      </div>
    `;
    QuizModule.renderFinal(workspaceEl.querySelector('[data-final-quiz-container]'), finalQuiz);

    if (opts.scroll !== false) scrollToWorkspace();
  }

  // === TOOLBAR SEARCH ===
  function initToolbar() {
    const searchInput = document.getElementById('courseSearch');
    if (!searchInput || !treeNavEl) return;
    searchInput.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      treeNavEl.querySelectorAll('.tree-day-group').forEach(group => {
        const text = group.textContent.toLowerCase();
        group.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    });
  }

  // === INIT ===
  /* Bloque de estado del catálogo: cubre el lateral y la zona central.
     Se usa cuando la base de datos no responde o no hay lecciones publicadas,
     para no dejar la página en blanco sin explicación. */
  function renderCatalogState(kind, err) {
    const isError = kind === 'error';

    const opts = isError
      ? {
          tone: 'error',
          icon: 'fa-plug-circle-xmark',
          title: 'No pudimos cargar el temario',
          text: 'Revisa tu conexión e inténtalo de nuevo.',
          actionLabel: 'Reintentar',
          onAction: loadFromDatabase
        }
      : {
          icon: 'fa-folder-open',
          title: 'Todavía no hay lecciones publicadas',
          text: 'El contenido aparecerá aquí en cuanto se publique.',
          actionLabel: 'Volver a comprobar',
          onAction: loadFromDatabase
        };

    if (treeNavEl) Notify.state(treeNavEl, opts);
    if (workspaceEl) Notify.state(workspaceEl, opts);

    if (isError) console.warn('[Cursos] No se pudo cargar el catálogo:', err && err.code);
  }

  /* Trae el catálogo de Supabase y pinta la interfaz. Es idempotente: la usan
     la carga inicial y el botón de reintentar. */
  async function loadFromDatabase() {
    if (typeof DbService === 'undefined') {
      renderCatalogState('error');
      return;
    }

    try {
      const remoteDays = await DbService.getAllDays();

      if (!remoteDays || !remoteDays.length) {
        cachedDays = [];
        renderCatalogState('empty');
        return;
      }

      cachedDays = remoteDays;
      loadProgress();
      const exists = remoteDays.some(d => String(d.dayNumber) === String(activeDayNum));
      activeDayNum = exists ? activeDayNum : remoteDays[0].dayNumber;

      renderTreeNav();
      initToolbar();
      if (activeDayNum === 'FINAL') await openFinalQuiz({ scroll: false });
      else showCourseIntro(activeDayNum, { scroll: false });
    } catch (err) {
      cachedDays = [];
      renderCatalogState('error', err);
    }
  }

  async function init() {
    treeNavEl = document.querySelector('[data-tree-nav]');
    workspaceEl = document.querySelector('[data-module-workspace]');
    if (!treeNavEl || !workspaceEl) return;

    /* Índice plegable en tablet y móvil: en una columna, el árbol completo
       empujaría la lección fuera de la primera pantalla. */
    lmsSidebarEl = document.querySelector('.lms-sidebar');
    const indexToggle = document.getElementById('lmsIndexToggle');
    if (indexToggle && lmsSidebarEl) {
      if (window.matchMedia('(max-width: 1024px)').matches) {
        lmsSidebarEl.classList.add('is-collapsed');
      }
      indexToggle.addEventListener('click', () => {
        const collapsed = lmsSidebarEl.classList.toggle('is-collapsed');
        indexToggle.setAttribute('aria-expanded', String(!collapsed));
      });
    }

    // Caché local (si ya había lecciones en memoria, se pinta al instante)
    const days = getAllDays();
    if (days.length) {
      loadProgress();
      activeDayNum = days[0].dayNumber;
      renderTreeNav();
      showCourseIntro(activeDayNum, { scroll: false });
      initToolbar();
    }

    await loadFromDatabase();

    window.addEventListener('storage', () => {
      renderTreeNav();
      const updatedDays = getAllDays();
      if (updatedDays.length) {
        const exists = updatedDays.some(d => String(d.dayNumber) === String(activeDayNum));
        if (activeDayNum !== 'FINAL' && !exists) showCourseIntro(updatedDays[0].dayNumber, { scroll: false });
        else if (activeDayNum !== 'FINAL') showCourseIntro(activeDayNum, { scroll: false });
        else openFinalQuiz({ scroll: false });
      }
    });
  }

  return { init, showCourseIntro, showLessonStage, openFinalQuiz };
})();

/* --------------------------------------------------------------------------
   QUIZ — Cuestionario interactivo por lección con corrección en tiempo real
   -------------------------------------------------------------------------- */
const QuizModule = (() => {
  const escapeHtml = (value) => Utils.escapeHtml(value);

  /* Orden de presentación de las alternativas.
     Se barajan solo las que tienen texto; las vacías se quedan al final para no
     dejar huecos en medio. El índice guardado no cambia: esto decide únicamente
     en qué posición se pinta cada alternativa, y el `data-opt` conserva el
     índice original para que la corrección siga siendo la misma. */
  function shuffleOrder(q) {
    const options = q.options || [];
    const filled = [];
    const empty = [];
    options.forEach((opt, i) => (String(opt == null ? '' : opt).trim() ? filled : empty).push(i));

    for (let i = filled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filled[i], filled[j]] = [filled[j], filled[i]];
    }
    return filled.concat(empty);
  }

  /* Plantilla de una pregunta. Todo el texto (enunciado y opciones) se escapa.
     Ya no se revela la opción correcta: cada alternativa lleva su `id` y la
     corrección se hace en el servidor (RPC grade_quiz, mitigación M-01). */
  function questionHtml(q, qi, total, order) {
    const options = q.options || [];
    const optionIds = q.optionIds || [];
    const sequence = order && order.length === options.length
      ? order
      : options.map((_, i) => i);

    return `
      <div class="quiz-question ${qi === 0 ? 'is-active' : ''}" data-q="${qi}" data-q-id="${escapeHtml(q.id || '')}">
        <p class="q-text">${qi + 1}. ${escapeHtml(q.q)}</p>
        <div class="quiz-options">
          ${sequence.map((original, display) => `
            <button class="quiz-option" data-opt-id="${escapeHtml(optionIds[original] != null ? optionIds[original] : '')}" type="button">
              <span class="opt-letter">${String.fromCharCode(65 + display)}</span>
              <span>${escapeHtml(options[original])}</span>
            </button>
          `).join('')}
        </div>
        <div class="quiz-nav">
          <button class="btn btn--outline btn--sm" data-prev type="button" ${qi === 0 ? 'disabled' : ''}>Anterior</button>
          <button class="btn btn--primary btn--sm" data-next type="button" disabled>${qi === total - 1 ? 'Ver resultado' : 'Siguiente'}</button>
        </div>
      </div>
    `;
  }

  /* Corrige en el servidor (RPC grade_quiz, SECURITY DEFINER) y devuelve
     { correct, total } sin exponer la opción correcta de cada pregunta. */
  async function gradeQuiz(quizId, answers) {
    if (typeof DbService !== 'undefined' && typeof DbService.gradeQuiz === 'function') {
      try {
        return await DbService.gradeQuiz(quizId, answers);
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function resultsHtml(score, correctCount, total) {
    return `
      <div class="score-ring" data-ring>
        <div class="score-ring-track" aria-hidden="true"></div>
        <div class="score-ring-inner">
          <p class="score-value" data-score>0<span>%</span></p>
          <span class="score-label">Puntaje</span>
        </div>
      </div>
      <div class="quiz-verdict quiz-verdict--${score.passed ? 'pass' : 'fail'}">
        <i class="${score.verdictIcon}"></i> ${score.verdict}
      </div>
      <p class="quiz-breakdown"><strong>${correctCount} correctas</strong> · <em>${total - correctCount} incorrectas</em> de ${total} preguntas</p>
      <p class="quiz-msg">${score.msg}</p>
      <p class="quiz-threshold">Aprueba con <b>${ScoreScale.PASS}%</b> o más</p>
      <button class="btn btn--primary btn--sm btn-retry--inline" data-retry>Reintentar Cuestionario</button>
    `;
  }

  function render(container, quizArray = [], title = 'Lección', quizId = null) {
    if (!container) return;
    const total = quizArray.length;
    if (!total) {
      container.innerHTML = `<p class="quiz-empty-msg">No hay preguntas configuradas para esta lección.</p>`;
      return;
    }

    let current = 0;
    const selected = new Array(total).fill(null);   // option id elegido por pregunta

    container.innerHTML = `
      <div class="quiz-head">
        <h4>Evaluación — ${escapeHtml(title)}</h4>
        <span class="quiz-progress" data-progress>Pregunta 1 / ${total}</span>
      </div>
      <div data-questions></div>
      <div class="quiz-results" data-results></div>
    `;

    const qWrap = container.querySelector('[data-questions]');
    // Un orden por pregunta y por intento: el alumno no puede memorizar la
    // posición de la correcta, y el reintento vuelve a barajar.
    const orders = quizArray.map(shuffleOrder);
    qWrap.innerHTML = quizArray.map((q, qi) => questionHtml(q, qi, total, orders[qi])).join('');

    function showQuestion(i) {
      qWrap.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('is-active'));
      qWrap.querySelector(`[data-q="${i}"]`).classList.add('is-active');
      container.querySelector('[data-progress]').textContent = `Pregunta ${i + 1} / ${total}`;
      current = i;
    }

    qWrap.querySelectorAll('.quiz-question').forEach((qEl, qi) => {
      const options = qEl.querySelectorAll('.quiz-option');
      const nextBtn = qEl.querySelector('[data-next]');
      const prevBtn = qEl.querySelector('[data-prev]');

      // Sin feedback instantáneo: se guarda la opción elegida y se corrige al
      // final en el servidor, sin revelar la correcta (mitigación M-01).
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          selected[qi] = opt.dataset.optId || null;
          options.forEach(o => o.classList.toggle('is-selected', o === opt));
          nextBtn.disabled = false;
        });
      });

      prevBtn.addEventListener('click', () => showQuestion(qi - 1));
      nextBtn.addEventListener('click', () => {
        if (qi === total - 1) {
          showResults();
        } else {
          showQuestion(qi + 1);
        }
      });
    });

    async function showResults() {
      qWrap.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('is-active'));

      const results = container.querySelector('[data-results]');
      results.classList.add('is-active');
      results.innerHTML = `<p class="quiz-empty-msg">Comprobando respuestas…</p>`;

      const answers = quizArray.map((q, i) => ({
        question_id: q.id,
        option_id: selected[i] || null
      }));

      const outcome = await gradeQuiz(quizId, answers);

      if (!outcome || typeof outcome.correct !== 'number' || typeof outcome.total !== 'number') {
        results.innerHTML = `
          <p class="quiz-empty-msg">No se pudieron comprobar las respuestas. Inténtalo de nuevo.</p>
          <button class="btn btn--primary btn--sm btn-retry--inline" data-retry>Reintentar Cuestionario</button>
        `;
        results.querySelector('[data-retry]').addEventListener('click', () => render(container, quizArray, title, quizId));
        return;
      }

      const correctCount = outcome.correct;
      const totalCount = outcome.total || total;
      const pct = Math.round((correctCount / totalCount) * 100);
      const score = ScoreScale.classify(pct);

      results.classList.remove('quiz-results--pass', 'quiz-results--excellent', 'quiz-results--fail');
      results.classList.add(`quiz-results--${score.key}`);
      results.innerHTML = resultsHtml(score, correctCount, totalCount);

      ScoreRingModule.draw(results.querySelector('[data-ring]'), pct);
      results.querySelector('[data-retry]').addEventListener('click', () => render(container, quizArray, title, quizId));
    }
  }

  function renderFinal(container, quiz = null) {
    if (!container) return;
    const quizId = quiz && quiz.id ? quiz.id : null;
    const quizArray = (quiz && quiz.questions) || [];
    const total = quizArray.length;
    if (!total) {
      container.innerHTML = `<p class="quiz-empty-msg">El Cuestionario Final aún no tiene preguntas configuradas por el administrador.</p>`;
      return;
    }

    let current = 0;
    const selected = new Array(total).fill(null);

    container.innerHTML = `
      <div class="quiz-head">
        <h4>Cuestionario Final de Nivel</h4>
        <span class="quiz-progress" data-progress>Pregunta 1 / ${total}</span>
      </div>
      <div data-questions></div>
      <div class="quiz-results" data-results></div>
    `;

    const qWrap = container.querySelector('[data-questions]');
    // Mismo criterio que el quiz de lección: orden aleatorio por pregunta.
    const orders = quizArray.map(shuffleOrder);
    qWrap.innerHTML = quizArray.map((q, qi) => questionHtml(q, qi, total, orders[qi])).join('');

    function showQuestion(i) {
      qWrap.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('is-active'));
      qWrap.querySelector(`[data-q="${i}"]`).classList.add('is-active');
      container.querySelector('[data-progress]').textContent = `Pregunta ${i + 1} / ${total}`;
      current = i;
    }

    qWrap.querySelectorAll('.quiz-question').forEach((qEl, qi) => {
      const options = qEl.querySelectorAll('.quiz-option');
      const nextBtn = qEl.querySelector('[data-next]');
      const prevBtn = qEl.querySelector('[data-prev]');

      options.forEach(opt => {
        opt.addEventListener('click', () => {
          selected[qi] = opt.dataset.optId || null;
          options.forEach(o => o.classList.toggle('is-selected', o === opt));
          nextBtn.disabled = false;
        });
      });

      prevBtn.addEventListener('click', () => showQuestion(qi - 1));
      nextBtn.addEventListener('click', () => {
        if (qi === total - 1) {
          showResults();
        } else {
          showQuestion(qi + 1);
        }
      });
    });

    async function showResults() {
      qWrap.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('is-active'));

      const results = container.querySelector('[data-results]');
      results.classList.add('is-active');
      results.innerHTML = `<p class="quiz-empty-msg">Comprobando respuestas…</p>`;

      const answers = quizArray.map((q, i) => ({
        question_id: q.id,
        option_id: selected[i] || null
      }));

      const outcome = await gradeQuiz(quizId, answers);

      if (!outcome || typeof outcome.correct !== 'number' || typeof outcome.total !== 'number') {
        results.innerHTML = `
          <p class="quiz-empty-msg">No se pudieron comprobar las respuestas. Inténtalo de nuevo.</p>
          <button class="btn btn--primary btn--sm btn-retry" data-retry>Reintentar Examen Final</button>
        `;
        results.querySelector('[data-retry]').addEventListener('click', () => renderFinal(container, quiz));
        return;
      }

      const correctCount = outcome.correct;
      const totalCount = outcome.total || total;
      const pct = Math.round((correctCount / totalCount) * 100);
      const score = ScoreScale.classify(pct);

      // El examen final conserva su diagnóstico de nivel (4 rangos).
      let levelBadge, levelTitle, levelDesc, levelColor;
      if (pct >= 90) {
        levelBadge = 'NIVEL EXPERTO';
        levelTitle = 'Especialista Mecánico Principal';
        levelColor = 'var(--c-success)';
        levelDesc = 'Has demostrado un dominio absoluto de la teoría, procedimientos de elevación segura, instrumentos de medición y diagnóstico de fallas.';
      } else if (pct >= 70) {
        levelBadge = 'NIVEL TÉCNICO AVANZADO';
        levelTitle = 'Mecánico / Operador Calificado';
        levelColor = 'var(--c-primary)';
        levelDesc = 'Posees una base sólida de conocimientos técnicos y seguridad en el taller.';
      } else if (pct >= 50) {
        levelBadge = 'NIVEL TÉCNICO INTERMEDIO';
        levelTitle = 'Técnico en Formación';
        levelColor = 'var(--c-accent)';
        levelDesc = 'Has superado el examen base. Repasa las lecciones sobre instrumentos de torque y precisión para afianzar tu nivel.';
      } else {
        levelBadge = 'NIVEL APRENDIZ';
        levelTitle = 'Requiere Repaso Técnico';
        levelColor = 'var(--c-danger)';
        levelDesc = 'Revisa nuevamente el contenido de las lecciones diarias y realiza las evaluaciones por etapa antes de reintentar.';
      }

      results.classList.remove('quiz-results--pass', 'quiz-results--excellent', 'quiz-results--fail');
      results.classList.add(`quiz-results--${score.key}`);
      results.innerHTML = `
        <div class="score-ring" data-ring>
          <div class="score-ring-track" aria-hidden="true"></div>
          <div class="score-ring-inner">
            <p class="score-value" data-score>0<span>%</span></p>
            <span class="score-label">Puntaje</span>
          </div>
        </div>
        <div class="quiz-verdict quiz-verdict--${score.passed ? 'pass' : 'fail'}">
          <i class="${score.verdictIcon}"></i> ${score.verdict}
        </div>
        <p class="quiz-breakdown"><strong>${correctCount} correctas</strong> · <em>${totalCount - correctCount} incorrectas</em> de ${totalCount} preguntas evaluadas</p>
        <p class="quiz-msg">${score.msg}</p>
        <p class="quiz-threshold">Nivel con <b>${ScoreScale.PASS}%</b> o más</p>

        <div class="level-cert-box" data-border-color="${levelColor}">
          <span class="level-cert-badge" data-bg-color="${levelColor}">${levelBadge}</span>
          <h4>${levelTitle}</h4>
          <p>${levelDesc}</p>
        </div>

        <button class="btn btn--primary btn--sm btn-retry" data-retry><i class="fa-solid fa-rotate-left"></i> Reintentar Examen Final</button>
      `;
      applyDynamicStyles(results);

      ScoreRingModule.draw(results.querySelector('[data-ring]'), pct);
      results.querySelector('[data-retry]').addEventListener('click', () => renderFinal(container, quiz));
    }
  }

  return { render, renderFinal };
})();

/* --------------------------------------------------------------------------
   ESCALA DE EVALUACIÓN — umbrales y veredictos compartidos
   Una sola fuente de verdad para el quiz de lección y el examen final.
   -------------------------------------------------------------------------- */
const ScoreScale = (() => {
  const PASS = 70;              // umbral de aprobación general
  const EXCELLENT = 90;         // reconocimiento destacado

  // Devuelve la clasificación completa a partir de un porcentaje.
  function classify(pct) {
    if (pct >= EXCELLENT) {
      return {
        key: 'excellent',
        passed: true,
        verdict: 'Aprobado',
        verdictIcon: 'fa-solid fa-award',
        msg: '¡Excelente! Dominio completo del tema.',
        color: 'var(--c-success)'
      };
    }
    if (pct >= PASS) {
      return {
        key: 'pass',
        passed: true,
        verdict: 'Aprobado',
        verdictIcon: 'fa-solid fa-circle-check',
        msg: 'Buen resultado. Repasa los detalles para afinar.',
        color: 'var(--c-success)'
      };
    }
    return {
      key: 'fail',
      passed: false,
      verdict: 'Reprobado',
      verdictIcon: 'fa-solid fa-circle-xmark',
      msg: 'Vuelve a revisar la teoría, el video y la galería.',
      color: 'var(--c-danger)'
    };
  }

  return { PASS, EXCELLENT, classify };
})();

/* --------------------------------------------------------------------------
   ANILLO DE PUNTAJE
   Sustituye al antiguo tacómetro con aguja. Un solo arco se llena de 0 a 100
   y el número vive en el centro: se entiende de un vistazo, sin escalas ni
   agujas que tapen la cifra. Se dibuja con conic-gradient + mask, sin SVG.
   -------------------------------------------------------------------------- */
const ScoreRingModule = (() => {
  const DURATION = 900;

  function draw(ringEl, pct) {
    if (!ringEl) return;
    const clamped = Math.max(0, Math.min(100, pct));
    const valueEl = ringEl.querySelector('[data-score]');
    const numberNode = valueEl ? valueEl.firstChild : null;

    // El color del arco sale de la escala compartida (verde / rojo).
    ringEl.style.setProperty('--ring-color', ScoreScale.classify(clamped).color);

    const paint = (value) => {
      ringEl.style.setProperty('--pct', value);
      if (numberNode) numberNode.nodeValue = String(value);
    };

    // Con movimiento reducido se muestra el resultado final sin animación.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paint(clamped);
      return;
    }

    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / DURATION);
      paint(Math.round((1 - Math.pow(1 - t, 3)) * clamped)); // easeOutCubic
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return { draw };
})();

/* --------------------------------------------------------------------------
   LIGHTBOX — amplía ilustraciones en JavaScript puro
   -------------------------------------------------------------------------- */
const LightboxModule = (() => {
  let box, media, caption;

  function open(html, cap) {
    if (!box || !media || !caption) return;
    media.innerHTML = html;
    caption.textContent = cap || '';
    box.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!box) return;
    box.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function bind(scope) {
    scope.querySelectorAll('[data-lightbox]').forEach(fig => {
      fig.addEventListener('click', () => {
        const imgEl = fig.querySelector('img');
        const svgEl = fig.querySelector('svg');
        if (imgEl) {
          open(imgEl.outerHTML, fig.dataset.caption);
        } else if (svgEl) {
          open(svgEl.outerHTML, fig.dataset.caption);
        }
      });
    });
  }

  function init() {
    box = document.querySelector('[data-lightbox-root]');
    if (!box) return;
    media = box.querySelector('[data-lightbox-media]');
    caption = box.querySelector('[data-lightbox-caption]');
    const closeBtn = box.querySelector('[data-lightbox-close]');
    if (closeBtn) closeBtn.addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    bind(document);
  }

  return { init, bind };
})();

/* --------------------------------------------------------------------------
   BACK TO TOP
   -------------------------------------------------------------------------- */
const BackToTopModule = (() => {
  function init() {
    const btn = document.querySelector('[data-back-to-top]');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      // Se oculta cerca del final: ahí ya no sirve y tapaba el botón de envío
      // del formulario de contacto.
      const nearBottom = y + window.innerHeight > document.documentElement.scrollHeight - 260;
      btn.classList.toggle('is-visible', y > 600 && !nearBottom);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  return { init };
})();

/* --------------------------------------------------------------------------
   CONTACTO — envío real a `public.contact_messages` (RLS: INSERT público)
   Defensas básicas anti-spam sin backend propio:
     · campo trampa (honeypot) invisible para personas
     · tiempo mínimo de cumplimentación
     · límites de longitud alineados con los CHECK de la tabla
   -------------------------------------------------------------------------- */
const ContactModule = (() => {
  const MIN_FILL_MS = 3000;

  function init() {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;

    const note = form.querySelector('[data-form-note]');
    const submitBtn = form.querySelector('button[type="submit"]');
    let startedAt = Date.now();

    const setNote = (text, state) => {
      if (!note) return;
      note.textContent = text;
      note.dataset.state = state || '';
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const message = String(data.get('message') || '').trim();
      const honeypot = String(data.get('website') || '').trim();

      // Un bot rellena el campo trampa; una persona nunca lo ve.
      if (honeypot) {
        form.reset();
        setNote('Gracias por tu mensaje.', 'ok');
        return;
      }

      if (Date.now() - startedAt < MIN_FILL_MS) {
        setNote('Espera un momento antes de enviar el formulario.', 'error');
        return;
      }

      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || message.length < 10) {
        setNote('Revisa los datos: nombre, un correo válido y un mensaje de al menos 10 caracteres.', 'error');
        return;
      }

      if (typeof DbService === 'undefined' || !window.isSupabaseConfigured || !window.isSupabaseConfigured()) {
        setNote('El canal de contacto no está disponible en este momento. Escríbenos a mekatotalcorreo@gmail.com.', 'error');
        return;
      }

      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
      }
      setNote('', '');

      try {
        await DbService.sendContactMessage({ name, email, message });
        form.reset();
        startedAt = Date.now();
        setNote('¡Gracias! Recibimos tu mensaje y te responderemos a la brevedad.', 'ok');
      } catch (err) {
        console.warn('[Contacto] No se pudo enviar el mensaje.');
        setNote(
          err && err.code === 'VALIDATION'
            ? err.message
            : 'No pudimos enviar tu mensaje. Inténtalo de nuevo o escríbenos a mekatotalcorreo@gmail.com.',
          'error'
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  return { init };
})();

/* --------------------------------------------------------------------------
   RESPALDO DE IMÁGENES
   Si una portada o una miniatura de galería no carga (URL caducada, hotlink
   bloqueado, archivo borrado), se sustituye por el emblema del módulo en vez
   de dejar el icono de imagen rota. Se escucha en fase de captura porque el
   evento `error` de un <img> no burbujea.
   -------------------------------------------------------------------------- */
const ImageFallbackModule = (() => {
  function init() {
    document.addEventListener('error', (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;

      const box = img.closest('.gallery-img-container, .ci-icon-visual');
      if (!box || box.dataset.fallbackApplied) return;
      box.dataset.fallbackApplied = '1';

      const iconKey = box.dataset.iconKey || 'tools';
      const isCover = box.classList.contains('ci-icon-visual');

      if (isCover) {
        box.classList.remove('ci-icon-visual--photo');
        box.innerHTML = moduleGlyph(iconKey);
      } else {
        const tpl = document.createElement('template');
        tpl.innerHTML = moduleGlyph(iconKey, 'sm');
        box.replaceChildren(tpl.content);
        // La tarjeta ya no es ampliable: no hay nada que mostrar en el visor.
        const card = box.closest('.gallery-explain-card');
        if (card) {
          card.removeAttribute('data-lightbox');
          card.classList.add('gallery-explain-card--empty');
          card.querySelector('.zoom-hint')?.remove();
        }
      }
    }, true);
  }
  return { init };
})();

/* --------------------------------------------------------------------------
   INICIALIZACIÓN PRINCIPAL
   -------------------------------------------------------------------------- */
function initApp() {
  NavbarModule.init();
  HeroModule.init();
  CoursesModule.init();
  RevealModule.init();
  LightboxModule.init();
  BackToTopModule.init();
  ContactModule.init();
  ImageFallbackModule.init();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
