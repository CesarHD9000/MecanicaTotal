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
const CoursesModule = (() => {
  let treeNavEl, workspaceEl;
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
  const PROGRESS_KEY = 'mecanica_progress_v1';
  let courseProgress = {};

  function loadProgress() {
    try { courseProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch(e) { courseProgress = {}; }
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
            <span class="badge">${days.length} Días</span>
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
              return `
                <button class="tree-stage-item ${statusClass}"
                  data-stage-target="${stage}" data-day="${d.dayNumber}">
                  ${iconHtml}
                  <span>${label}</span>
                </button>
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
        showCourseIntro(dayNum);
      });
    });

    // Stage item click
    treeNavEl.querySelectorAll('[data-stage-target]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const dayNum = btn.getAttribute('data-day');
        const stageKey = btn.getAttribute('data-stage-target');
        if (stageKey === 'intro') {
          showCourseIntro(dayNum);
        } else {
          showLessonStage(dayNum, stageKey);
        }
      });
    });

    // Final quiz
    const finalBtn = treeNavEl.querySelector('#btnTreeFinalQuiz');
    if (finalBtn) finalBtn.addEventListener('click', () => openFinalQuiz());
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

    // Portada del módulo: fotografía real si el día la define; si no, esquema vectorial.
    const coverImage = safeImageUrl(day.coverImage);
    const heroVisual = coverImage
      ? `<img class="ci-cover-img" src="${escapeHtml(coverImage)}" alt="Portada del módulo: ${escapeHtml(day.title)}" decoding="async">`
      : buildDiagram(day.icon, [], '#F77F00');

    workspaceEl.innerHTML = `
      <div class="course-intro-screen">
        ${started ? `
        <div class="lms-progress-strip">
          <div class="lps-meta">
            <span class="lps-label">DÍA ${escapeHtml(day.dayNumber)} · ${escapeHtml(day.title).toUpperCase()}</span>
            <span class="lps-step">${completedCount} de ${STAGE_SEQUENCE.length} etapas completadas</span>
          </div>
          <div class="lps-bar-wrap">
            <div class="lps-bar-fill" style="width: ${pct}%;"></div>
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
            <div class="ci-icon-visual${coverImage ? ' ci-icon-visual--photo' : ''}"${coverImage ? '' : ' aria-hidden="true"'}>
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
          showLessonStage(dn, 'theory');
        }
      });
    }
    const restartBtn = workspaceEl.querySelector('[data-restart-day]');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        const dn = restartBtn.getAttribute('data-restart-day');
        courseProgress[day.id] = { completedStages: [] };
        saveProgress();
        renderTreeNav();
        showCourseIntro(dn);
      });
    }

    renderTreeNav();

    if (opts.scroll !== false) scrollToWorkspace();
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
    const theoryObj = sec.theory || {};
    const galleryArr = sec.gallery || [];
    const videoObj = sec.video || {};

    // Stage content HTML
    let stageContentHtml = '';
    if (stageKey === 'theory') {
      stageContentHtml = `
        <div class="day-stage-card" id="stage-theory-${day.dayNumber}">
          <div class="stage-header-tag stage--theory">
            <i class="fa-solid fa-book-open"></i> ETAPA 1: TEORÍA Y FUNDAMENTOS
          </div>
          <h4 class="stage-main-title">${escapeHtml(theoryObj.mainTitle || 'Manual y Explicación Teórica')}</h4>
          <div class="subsections-tree">
            ${(theoryObj.subsections || []).map(sub => `
              <div class="subsection-item">
                <h5 class="subsection-title"><i class="fa-solid fa-folder-open"></i> ${escapeHtml(sub.subtitle)}</h5>
                <div class="subsection-body">${RichText.render(sub.content)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
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
              return `
              <div class="gallery-explain-card" data-lightbox data-caption="${caption}">
                <span class="zoom-hint">${ICONS.zoom}</span>
                <div class="gallery-img-container">
                  ${image
                    ? `<img src="${escapeHtml(image)}" alt="${caption}" class="gallery-img-element" loading="lazy">`
                    : `<div class="gallery-placeholder-blueprint">${buildDiagram(day.icon, [], '#F77F00')}</div>`}
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

    workspaceEl.innerHTML = `
      <div class="lesson-stage-screen">
        <div class="lms-progress-strip">
          <div class="lps-meta">
            <span class="lps-label">DÍA ${escapeHtml(day.dayNumber)} · ${escapeHtml(day.title).toUpperCase()}</span>
            <span class="lps-step-count">Etapa ${currentStageNum} de ${totalStages}</span>
          </div>
          <div class="lps-bar-wrap">
            <div class="lps-bar-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="lps-stepper">
            ${stepperHtml}
          </div>
        </div>

        <div class="day-stages-container day-stages-container--flush-top">
          ${stageContentHtml}
        </div>

        <div class="lesson-nav-footer">
          <button class="btn-lesson-nav" data-lesson-prev>
            ${prevStage ? `<i class="fa-solid fa-arrow-left"></i> ${STAGE_META[prevStage].label}` : `<i class="fa-solid fa-arrow-left"></i> Introducción`}
          </button>
          <div class="lesson-nav-center">
            <span class="lesson-nav-info">${STAGE_META[stageKey].label}</span>
          </div>
          ${nextStage ? `
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
          `}
        </div>
      </div>
    `;

    // Mark intro as visited / complete
    if (!courseProgress[day.id]) courseProgress[day.id] = { completedStages: [] };

    // Bind quiz
    if (stageKey === 'quiz') {
      LightboxModule.bind(workspaceEl);
      QuizModule.render(workspaceEl.querySelector('[data-quiz]'), sec.quiz || [], day.title);
    } else {
      LightboxModule.bind(workspaceEl);
    }

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

    let finalQuestions = [];
    if (typeof DbService !== 'undefined') {
      finalQuestions = await DbService.getFinalQuiz();
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
    QuizModule.renderFinal(workspaceEl.querySelector('[data-final-quiz-container]'), finalQuestions);

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
  async function init() {
    treeNavEl = document.querySelector('[data-tree-nav]');
    workspaceEl = document.querySelector('[data-module-workspace]');
    if (!treeNavEl || !workspaceEl) return;
    const days = getAllDays();
    if (days.length) {
      loadProgress();
      activeDayNum = days[0].dayNumber;
      renderTreeNav();
      showCourseIntro(activeDayNum, { scroll: false });
      initToolbar();
    }

    // Sincronización en segundo plano con base de datos Supabase
    if (typeof DbService !== 'undefined') {
      try {
        const remoteDays = await DbService.getAllDays();
        if (remoteDays && remoteDays.length) {
          cachedDays = remoteDays;
          renderTreeNav();
          if (activeDayNum === 'FINAL') {
            await openFinalQuiz({ scroll: false });
          } else {
            showCourseIntro(activeDayNum, { scroll: false });
          }
        }
      } catch (e) {
        console.warn('Cargando con almacenamiento local:', e);
      }
    }

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

  /* Plantilla de una pregunta. Todo el texto (enunciado y opciones) se escapa:
     un admin puede escribir cualquier carácter y nunca se interpreta como HTML. */
  function questionHtml(q, qi, total) {
    return `
      <div class="quiz-question ${qi === 0 ? 'is-active' : ''}" data-q="${qi}">
        <p class="q-text">${qi + 1}. ${escapeHtml(q.q)}</p>
        <div class="quiz-options">
          ${(q.options || []).map((opt, oi) => `
            <button class="quiz-option" data-opt="${oi}" type="button">
              <span class="opt-letter">${String.fromCharCode(65 + oi)}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
        <p class="quiz-feedback" data-feedback></p>
        <div class="quiz-nav">
          <button class="btn btn--outline btn--sm" data-prev type="button" ${qi === 0 ? 'disabled' : ''}>Anterior</button>
          <button class="btn btn--primary btn--sm" data-next type="button" disabled>${qi === total - 1 ? 'Ver resultado' : 'Siguiente'}</button>
        </div>
      </div>
    `;
  }

  function render(container, quizArray = [], title = 'Lección') {
    if (!container) return;
    const total = quizArray.length;
    if (!total) {
      container.innerHTML = `<p class="quiz-empty-msg">No hay preguntas configuradas para esta lección.</p>`;
      return;
    }

    let current = 0;
    let answered = new Array(total).fill(null);

    container.innerHTML = `
      <div class="quiz-head">
        <h4>Evaluación — ${escapeHtml(title)}</h4>
        <span class="quiz-progress" data-progress>Pregunta 1 / ${total}</span>
      </div>
      <div data-questions></div>
      <div class="quiz-results" data-results></div>
    `;

    const qWrap = container.querySelector('[data-questions]');
    qWrap.innerHTML = quizArray.map((q, qi) => questionHtml(q, qi, total)).join('');

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
      const feedback = qEl.querySelector('[data-feedback]');
      const correctIdx = quizArray[qi].correct;

      options.forEach((opt, oi) => {
        opt.addEventListener('click', () => {
          if (answered[qi] !== null) return;
          answered[qi] = oi;
          options.forEach(o => o.disabled = true);
          opt.classList.add(oi === correctIdx ? 'is-correct' : 'is-incorrect');
          if (oi !== correctIdx) options[correctIdx].classList.add('is-correct');
          feedback.textContent = oi === correctIdx ? '¡Correcto!' : 'Incorrecto. Revisa las subsecciones de teoría y la galería visual.';
          feedback.className = 'quiz-feedback ' + (oi === correctIdx ? 'correct' : 'incorrect');
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

    function showResults() {
      const correctCount = answered.reduce((acc, a, i) => acc + (a === quizArray[i].correct ? 1 : 0), 0);
      const pct = Math.round((correctCount / total) * 100);
      const score = ScoreScale.classify(pct);
      qWrap.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('is-active'));

      const results = container.querySelector('[data-results]');
      results.classList.remove('quiz-results--pass', 'quiz-results--excellent', 'quiz-results--fail');
      results.classList.add('is-active', `quiz-results--${score.key}`);
      results.innerHTML = `
        <div class="gauge-wrap" data-gauge></div>
        <p class="gauge-score" data-score>0<span>%</span></p>
        <div class="quiz-verdict quiz-verdict--${score.passed ? 'pass' : 'fail'}">
          <i class="${score.verdictIcon}"></i> ${score.verdict}
        </div>
        <p class="quiz-breakdown"><strong>${correctCount} correctas</strong> · <em>${total - correctCount} incorrectas</em> de ${total} preguntas</p>
        <p class="quiz-msg">${score.msg}</p>
        <p class="quiz-threshold">Aprueba con <b>${ScoreScale.PASS}%</b> o más</p>
        <button class="btn btn--primary btn--sm btn-retry--inline" data-retry>Reintentar Cuestionario</button>
      `;

      GaugeModule.draw(results.querySelector('[data-gauge]'), pct, results.querySelector('[data-score]'));
      results.querySelector('[data-retry]').addEventListener('click', () => render(container, quizArray, title));
    }
  }

  function renderFinal(container, quizArray = []) {
    if (!container) return;
    const total = quizArray.length;
    if (!total) {
      container.innerHTML = `<p class="quiz-empty-msg">El Cuestionario Final aún no tiene preguntas configuradas por el administrador.</p>`;
      return;
    }

    let current = 0;
    let answered = new Array(total).fill(null);

    container.innerHTML = `
      <div class="quiz-head">
        <h4>Cuestionario de Certificación Final</h4>
        <span class="quiz-progress" data-progress>Pregunta 1 / ${total}</span>
      </div>
      <div data-questions></div>
      <div class="quiz-results" data-results></div>
    `;

    const qWrap = container.querySelector('[data-questions]');
    qWrap.innerHTML = quizArray.map((q, qi) => questionHtml(q, qi, total)).join('');

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
      const feedback = qEl.querySelector('[data-feedback]');
      const correctIdx = quizArray[qi].correct;

      options.forEach((opt, oi) => {
        opt.addEventListener('click', () => {
          if (answered[qi] !== null) return;
          answered[qi] = oi;
          options.forEach(o => o.disabled = true);
          opt.classList.add(oi === correctIdx ? 'is-correct' : 'is-incorrect');
          if (oi !== correctIdx) options[correctIdx].classList.add('is-correct');
          feedback.textContent = oi === correctIdx ? '¡Respuesta Correcta!' : 'Respuesta Incorrecta.';
          feedback.className = 'quiz-feedback ' + (oi === correctIdx ? 'correct' : 'incorrect');
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

    function showResults() {
      const correctCount = answered.reduce((acc, a, i) => acc + (a === quizArray[i].correct ? 1 : 0), 0);
      const pct = Math.round((correctCount / total) * 100);
      const score = ScoreScale.classify(pct);
      qWrap.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('is-active'));

      // El examen final conserva su certificado de nivel profesional (4 rangos),
      // pero comparte el mismo medidor, veredicto y paleta del quiz de lección.
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

      const results = container.querySelector('[data-results]');
      results.classList.remove('quiz-results--pass', 'quiz-results--excellent', 'quiz-results--fail');
      results.classList.add('is-active', `quiz-results--${score.key}`);
      results.innerHTML = `
        <div class="gauge-wrap" data-gauge></div>
        <p class="gauge-score" data-score>0<span>%</span></p>
        <div class="quiz-verdict quiz-verdict--${score.passed ? 'pass' : 'fail'}">
          <i class="${score.verdictIcon}"></i> ${score.verdict}
        </div>
        <p class="quiz-breakdown"><strong>${correctCount} correctas</strong> · <em>${total - correctCount} incorrectas</em> de ${total} preguntas evaluadas</p>
        <p class="quiz-msg">${score.msg}</p>
        <p class="quiz-threshold">Certificación con <b>${ScoreScale.PASS}%</b> o más</p>

        <div class="level-cert-box" style="border-color:${levelColor};">
          <span class="level-cert-badge" style="background:${levelColor};">${levelBadge}</span>
          <h4>${levelTitle}</h4>
          <p>${levelDesc}</p>
        </div>

        <button class="btn btn--primary btn--sm btn-retry" data-retry><i class="fa-solid fa-rotate-left"></i> Reintentar Examen Final</button>
      `;

      GaugeModule.draw(results.querySelector('[data-gauge]'), pct, results.querySelector('[data-score]'));
      results.querySelector('[data-retry]').addEventListener('click', () => renderFinal(container, quizArray));
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
        color: '#2E7D32'
      };
    }
    if (pct >= PASS) {
      return {
        key: 'pass',
        passed: true,
        verdict: 'Aprobado',
        verdictIcon: 'fa-solid fa-circle-check',
        msg: 'Buen resultado. Repasa los detalles para afinar.',
        color: '#2E7D32'
      };
    }
    return {
      key: 'fail',
      passed: false,
      verdict: 'Reprobado',
      verdictIcon: 'fa-solid fa-circle-xmark',
      msg: 'Vuelve a revisar la teoría, el video y la galería.',
      color: '#C62828'
    };
  }

  return { PASS, EXCELLENT, classify };
})();

/* --------------------------------------------------------------------------
   MEDIDOR (GAUGE) — aguja tipo tacómetro para el resultado
   -------------------------------------------------------------------------- */
const GaugeModule = (() => {
  // Dibuja el medidor y anima la aguja + el número desde 0 hasta pct.
  function draw(el, pct, scoreEl) {
    if (!el) return;
    const clamped = Math.max(0, Math.min(100, pct));
    const angle = -90 + (clamped / 100) * 180;
    const color = ScoreScale.classify(clamped).color;

    el.innerHTML = `
      <svg class="gauge-svg" viewBox="0 0 200 118" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Resultado: ${clamped} por ciento">
        <path class="gauge-track" d="M20 100 A80 80 0 0 1 66 24" fill="none" stroke="#D62828" stroke-width="13" stroke-linecap="round"/>
        <path class="gauge-track" d="M66 24 A80 80 0 0 1 134 24" fill="none" stroke="#F77F00" stroke-width="13" stroke-linecap="round"/>
        <path class="gauge-track" d="M134 24 A80 80 0 0 1 180 100" fill="none" stroke="#2E7D32" stroke-width="13" stroke-linecap="round"/>
        <path d="M20 100 A80 80 0 0 1 66 24" fill="none" stroke="#D62828" stroke-width="13" stroke-linecap="round"
              stroke-dasharray="100" pathLength="100" data-arc="0"/>
        <path d="M66 24 A80 80 0 0 1 134 24" fill="none" stroke="#F77F00" stroke-width="13" stroke-linecap="round"
              stroke-dasharray="100" pathLength="100" data-arc="1"/>
        <path d="M134 24 A80 80 0 0 1 180 100" fill="none" stroke="#2E7D32" stroke-width="13" stroke-linecap="round"
              stroke-dasharray="100" pathLength="100" data-arc="2"/>
        <circle cx="100" cy="100" r="7" fill="#1E3A5F"/>
        <line class="gauge-needle" data-needle x1="100" y1="100" x2="100" y2="30"
              stroke="#1E3A5F" stroke-width="4" stroke-linecap="round"
              transform="rotate(-90 100 100)"/>
      </svg>
    `;

    const needle = el.querySelector('[data-needle]');
    const animate = () => {
      if (needle) {
        needle.setAttribute('transform', `rotate(${angle} 100 100)`);
        needle.setAttribute('stroke', color);
      }
      // Los arcos de color se llenan de 0 a 100% según el puntaje.
      el.querySelectorAll('[data-arc]').forEach((arc, i) => {
        const segStart = i * 100 / 3;
        const fill = Math.max(0, Math.min(100, ((clamped - segStart) / (100 / 3)) * 100));
        arc.setAttribute('stroke-dasharray', `${fill} 100`);
      });
    };

    if ('requestAnimationFrame' in window) {
      requestAnimationFrame(() => requestAnimationFrame(animate));
    } else {
      animate();
    }

    // El número sube de 0 hasta el porcentaje final.
    if (scoreEl) countUp(scoreEl, clamped);
  }

  // Animación del contador numérico (0 → target).
  function countUp(el, target) {
    const duration = 900;
    const start = performance.now();
    const numberNode = el.firstChild;             // nodo de texto antes del <span>%
    const setNumber = (v) => { if (numberNode) numberNode.nodeValue = String(v); };
    if (!numberNode) return;
    setNumber(0);
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);       // easeOutCubic
      setNumber(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(step);
      else setNumber(target);
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
      btn.classList.toggle('is-visible', window.scrollY > 600);
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
        setNote('El canal de contacto no está disponible en este momento. Escríbenos a contacto@mecanicatotal.cl.', 'error');
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
            : 'No pudimos enviar tu mensaje. Inténtalo de nuevo o escríbenos a contacto@mecanicatotal.cl.',
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
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
