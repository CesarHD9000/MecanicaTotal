/**
 * ============================================================================
 * loginAnim.js — MeKa Total: Rediseño Visual y Animación del Login Admin
 * ============================================================================
 * 
 * Concepto Visual:
 * 1. Fondo: Cortina metálica de taller (roller shutter) a pantalla completa
 *    con lamas acanaladas, relieve metálico, luz cálida interior filtrada por
 *    las ranuras, rieles laterales con remaches y barra inferior con franjas
 *    de advertencia diagonales en naranja/rojo y manija central.
 * 2. Card de login: El BORDE exterior es un engranaje mecánico grande (SVG con
 *    24 dientes definidos y corona de acero). El formulario se aloja centrado
 *    en la zona blanca protegida sin cortes.
 * 3. Estados:
 *    - Reposo: Giro lento y sutil del engranaje + pulsación cálida en rendijas.
 *    - Foco en inputs: Resalte suave naranja torque + impulso sutil del engranaje.
 *    - Autenticando: Botón deshabilitado, aceleración del engranaje y temblor
 *      metálico de la cortina (como motor listo para subir).
 *    - Éxito: Destello de luz, freno del engranaje, elevación de la cortina con
 *      listones apilándose arriba y rebote elástico, inundación de luz cálida
 *      y zoom-out de la card hacia el usuario antes de ocultar el overlay.
 *    - Error: Sacudida brusca del engranaje ("trancazo" mecánico), borde rojo
 *      en inputs, mensaje de error y retorno suave a reposo.
 * 
 * Reglas de Calidad:
 * - Aceleración 60fps con transform y opacity exclusivamente.
 * - Respeto estricto a prefers-reduced-motion (fundido sobrio sin cortina/giro).
 * - Paleta 100% fiel a _tokens.css (azules acero/marino, naranja, rojo freno).
 * ============================================================================
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────────
     1. PARÁMETROS DE CONFIGURACIÓN Y CALIBRACIÓN
     (Ajusta aquí fácilmente velocidades, duraciones y colores sin tocar la lógica)
  ────────────────────────────────────────────────────────────────────────── */
  const CONFIG = {
    // Tiempos y velocidades
    gearIdleDuration: 36,               // Segundos por vuelta en reposo (menor = más rápido)
    gearLoadingSpeed: 6,                // Multiplicador de velocidad al autenticar
    gearTeethCount: 24,                 // Cantidad de dientes del engranaje exterior
    shutterSlatCount: 18,               // Número de listones de la cortina de taller
    shutterRiseDuration: 1.15,          // Duración de la subida de la cortina (segundos)
    shutterBounceEase: 'back.out(1.25)',// Easing realista con rebote al hacer tope arriba
    cardZoomDuration: 0.5,              // Duración del zoom de la card en éxito
    cardZoomScale: 1.35,                // Escala final de la card al desvanecerse

    // Paleta oficial de _tokens.css
    colors: {
      primary: '#1E3A5F',        // Azul acero
      primaryDark: '#0F2036',    // Azul profundo
      primaryMid: '#16314F',     // Azul intermedio
      deep: '#0B1622',           // Fondo oscuro taller
      secondary: '#D62828',      // Rojo freno
      accent: '#F77F00',         // Naranja torque
      accentDark: '#E07200',     // Naranja oscuro
      danger: '#C62828',         // Rojo alerta
      surface: '#FFFFFF',        // Blanco puro
      steelLight: '#3A6799',     // Brillo metálico claro
      steelEdge: '#5B87BA',      // Reflejo vivo en borde
      warmGlow: '#FFA726',       // Luz interior dorada/cálida de taller
    }
  };

  /* ──────────────────────────────────────────────────────────────────────────
     2. ACCESIBILIDAD — PREFERS REDUCED MOTION
  ────────────────────────────────────────────────────────────────────────── */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ──────────────────────────────────────────────────────────────────────────
     3. VARIABLES DE ESTADO Y CONTROL
  ────────────────────────────────────────────────────────────────────────── */
  let gearTween = null;
  let shutterTremorTween = null;
  let shutterGlowPulse = null;
  let isAuthenticating = false;
  let isSuccessDone = false;

  /* ──────────────────────────────────────────────────────────────────────────
     4. INICIALIZACIÓN
  ────────────────────────────────────────────────────────────────────────── */
  function boot() {
    const overlay   = document.getElementById('adminLoginOverlay');
    const loginForm = document.getElementById('adminLoginForm');
    const errorMsg  = document.getElementById('loginErrorMsg');
    const scene     = document.getElementById('loginScene');

    if (!overlay || !loginForm || !errorMsg || !scene) return;

    // Si GSAP no está cargado aún, reintentar brevemente
    if (typeof gsap === 'undefined') {
      let retries = 0;
      const timer = setInterval(() => {
        retries++;
        if (typeof gsap !== 'undefined') {
          clearInterval(timer);
          setupVisualsAndAnimations();
        } else if (retries > 30) {
          clearInterval(timer);
          setupFallbackStatic();
        }
      }, 50);
      return;
    }

    setupVisualsAndAnimations();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     5. CONSTRUCCIÓN DE GRÁFICOS SVG (CORTINA + ENGRANAJE)
  ────────────────────────────────────────────────────────────────────────── */
  function setupVisualsAndAnimations() {
    buildShutterSVG();
    buildGearSVG();
    bindInputFocus();
    setupPublicAPI();
    setupDefensiveObservers();

    if (!prefersReducedMotion) {
      startIdleAnimations();
    }
  }

  /**
   * Construye la cortina metálica de taller (Roller Shutter)
   */
  function buildShutterSVG() {
    const scene = document.getElementById('loginScene');
    if (!scene) return;
    scene.innerHTML = ''; // Limpiar previo si existiera

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', 'loginShutter');
    svg.setAttribute('viewBox', '0 0 1440 900');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    const W = 1440;
    const H = 900;
    const RAIL_W = 28;
    const SLAT_COUNT = CONFIG.shutterSlatCount;
    const BOTTOM_BAR_H = 46;
    const SLAT_AREA_H = H - BOTTOM_BAR_H;
    const SLAT_H = Math.ceil(SLAT_AREA_H / SLAT_COUNT);

    // ——— DEFS Y GRADIENTES METÁLICOS ———
    const defs = document.createElementNS(svgNS, 'defs');

    // Gradiente metálico del listón de chapa de taller
    defs.innerHTML = `
      <linearGradient id="shutterSlatMetal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${CONFIG.colors.steelLight}" />
        <stop offset="12%" stop-color="${CONFIG.colors.primary}" />
        <stop offset="42%" stop-color="${CONFIG.colors.primaryMid}" />
        <stop offset="68%" stop-color="${CONFIG.colors.primaryDark}" />
        <stop offset="85%" stop-color="${CONFIG.colors.primaryMid}" />
        <stop offset="100%" stop-color="${CONFIG.colors.deep}" />
      </linearGradient>

      <linearGradient id="shutterSlatShine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${CONFIG.colors.steelEdge}" stop-opacity="0.8" />
        <stop offset="100%" stop-color="${CONFIG.colors.steelLight}" stop-opacity="0" />
      </linearGradient>

      <linearGradient id="shutterRailGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${CONFIG.colors.deep}" />
        <stop offset="35%" stop-color="${CONFIG.colors.primaryMid}" />
        <stop offset="70%" stop-color="${CONFIG.colors.primaryDark}" />
        <stop offset="100%" stop-color="${CONFIG.colors.deep}" />
      </linearGradient>

      <!-- Patrón de franjas de advertencia de taller a 45 grados (naranja torque y rojo freno) -->
      <pattern id="warningStripesPattern" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect x="0" y="0" width="18" height="36" fill="${CONFIG.colors.accent}" />
        <rect x="18" y="0" width="18" height="36" fill="${CONFIG.colors.secondary}" />
      </pattern>

      <!-- Resplandor interior cálido del taller (visible por rendijas y en éxito) -->
      <radialGradient id="workshopGlowGrad" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="${CONFIG.colors.warmGlow}" stop-opacity="0.9" />
        <stop offset="35%" stop-color="${CONFIG.colors.accent}" stop-opacity="0.55" />
        <stop offset="75%" stop-color="${CONFIG.colors.primaryMid}" stop-opacity="0.15" />
        <stop offset="100%" stop-color="${CONFIG.colors.deep}" stop-opacity="0" />
      </radialGradient>
    `;
    svg.appendChild(defs);

    // ——— 1. LUZ CÁLIDA INTERIOR (DETRÁS DE LA CORTINA) ———
    const glowRect = document.createElementNS(svgNS, 'rect');
    glowRect.setAttribute('id', 'shutterGlow');
    glowRect.setAttribute('x', '0');
    glowRect.setAttribute('y', '0');
    glowRect.setAttribute('width', String(W));
    glowRect.setAttribute('height', String(H));
    glowRect.setAttribute('fill', 'url(#workshopGlowGrad)');
    glowRect.style.opacity = '0.12';
    svg.appendChild(glowRect);

    // ——— 2. GRUPO PRINCIPAL DE LISTONES Y BARRA INFERIOR ———
    const slatsContainer = document.createElementNS(svgNS, 'g');
    slatsContainer.setAttribute('id', 'shutterSlats');

    // Listones de chapa acanalada
    for (let i = 0; i < SLAT_COUNT; i++) {
      const y = i * SLAT_H;
      const slatGroup = document.createElementNS(svgNS, 'g');
      slatGroup.setAttribute('class', 'shutter-slat-item');
      slatGroup.setAttribute('data-index', String(i));

      // Cuerpo del listón
      const slat = document.createElementNS(svgNS, 'rect');
      slat.setAttribute('x', String(RAIL_W));
      slat.setAttribute('y', String(y));
      slat.setAttribute('width', String(W - RAIL_W * 2));
      slat.setAttribute('height', String(SLAT_H - 2));
      slat.setAttribute('fill', 'url(#shutterSlatMetal)');
      slatGroup.appendChild(slat);

      // Bisel de luz superior (relieve metálico)
      const shine = document.createElementNS(svgNS, 'rect');
      shine.setAttribute('x', String(RAIL_W));
      shine.setAttribute('y', String(y));
      shine.setAttribute('width', String(W - RAIL_W * 2));
      shine.setAttribute('height', '5');
      shine.setAttribute('fill', 'url(#shutterSlatShine)');
      slatGroup.appendChild(shine);

      // Rendija iluminada entre listones (luz cálida que se escapa)
      const slit = document.createElementNS(svgNS, 'rect');
      slit.setAttribute('x', String(RAIL_W));
      slit.setAttribute('y', String(y + SLAT_H - 2));
      slit.setAttribute('width', String(W - RAIL_W * 2));
      slit.setAttribute('height', '2');
      slit.setAttribute('fill', CONFIG.colors.accent);
      slit.setAttribute('fill-opacity', '0.28');
      slatGroup.appendChild(slit);

      slatsContainer.appendChild(slatGroup);
    }

    // Barra inferior reforzada con franjas de advertencia y manija
    const bottomBarY = H - BOTTOM_BAR_H;
    const bottomBarGroup = document.createElementNS(svgNS, 'g');
    bottomBarGroup.setAttribute('id', 'shutterBottomBar');

    // Base de la barra inferior
    const barBody = document.createElementNS(svgNS, 'rect');
    barBody.setAttribute('x', String(RAIL_W));
    barBody.setAttribute('y', String(bottomBarY));
    barBody.setAttribute('width', String(W - RAIL_W * 2));
    barBody.setAttribute('height', String(BOTTOM_BAR_H));
    barBody.setAttribute('fill', 'url(#warningStripesPattern)');
    barBody.setAttribute('stroke', CONFIG.colors.primaryDark);
    barBody.setAttribute('stroke-width', '2');
    bottomBarGroup.appendChild(barBody);

    // Borde superior de refuerzo en la barra
    const barRim = document.createElementNS(svgNS, 'rect');
    barRim.setAttribute('x', String(RAIL_W));
    barRim.setAttribute('y', String(bottomBarY));
    barRim.setAttribute('width', String(W - RAIL_W * 2));
    barRim.setAttribute('height', '6');
    barRim.setAttribute('fill', CONFIG.colors.steelLight);
    bottomBarGroup.appendChild(barRim);

    // Manija de agarre central de elevación (acero engomado)
    const handleW = 140;
    const handleH = 14;
    const handleX = (W - handleW) / 2;
    const handleY = bottomBarY + (BOTTOM_BAR_H - handleH) / 2;

    const handleShadow = document.createElementNS(svgNS, 'rect');
    handleShadow.setAttribute('x', String(handleX));
    handleShadow.setAttribute('y', String(handleY + 2));
    handleShadow.setAttribute('width', String(handleW));
    handleShadow.setAttribute('height', String(handleH));
    handleShadow.setAttribute('rx', '7');
    handleShadow.setAttribute('fill', 'rgba(0, 0, 0, 0.45)');
    bottomBarGroup.appendChild(handleShadow);

    const handle = document.createElementNS(svgNS, 'rect');
    handle.setAttribute('x', String(handleX));
    handle.setAttribute('y', String(handleY));
    handle.setAttribute('width', String(handleW));
    handle.setAttribute('height', String(handleH));
    handle.setAttribute('rx', '7');
    handle.setAttribute('fill', CONFIG.colors.deep);
    handle.setAttribute('stroke', CONFIG.colors.primaryMid);
    handle.setAttribute('stroke-width', '2');
    bottomBarGroup.appendChild(handle);

    slatsContainer.appendChild(bottomBarGroup);
    svg.appendChild(slatsContainer);

    // ——— 3. RIELES LATERALES METÁLICOS CON REMACHES ———
    const railsGroup = document.createElementNS(svgNS, 'g');
    railsGroup.setAttribute('id', 'shutterRails');

    const leftRail = document.createElementNS(svgNS, 'rect');
    leftRail.setAttribute('x', '0');
    leftRail.setAttribute('y', '0');
    leftRail.setAttribute('width', String(RAIL_W));
    leftRail.setAttribute('height', String(H));
    leftRail.setAttribute('fill', 'url(#shutterRailGrad)');
    railsGroup.appendChild(leftRail);

    const rightRail = document.createElementNS(svgNS, 'rect');
    rightRail.setAttribute('x', String(W - RAIL_W));
    rightRail.setAttribute('y', '0');
    rightRail.setAttribute('width', String(RAIL_W));
    rightRail.setAttribute('height', String(H));
    rightRail.setAttribute('fill', 'url(#shutterRailGrad)');
    railsGroup.appendChild(rightRail);

    // Remaches en los rieles laterales
    for (let rY = 60; rY < H; rY += 120) {
      const rivetL = document.createElementNS(svgNS, 'circle');
      rivetL.setAttribute('cx', String(RAIL_W / 2));
      rivetL.setAttribute('cy', String(rY));
      rivetL.setAttribute('r', '4');
      rivetL.setAttribute('fill', CONFIG.colors.steelLight);
      rivetL.setAttribute('stroke', CONFIG.colors.deep);
      rivetL.setAttribute('stroke-width', '1.5');
      railsGroup.appendChild(rivetL);

      const rivetR = document.createElementNS(svgNS, 'circle');
      rivetR.setAttribute('cx', String(W - RAIL_W / 2));
      rivetR.setAttribute('cy', String(rY));
      rivetR.setAttribute('r', '4');
      rivetR.setAttribute('fill', CONFIG.colors.steelLight);
      rivetR.setAttribute('stroke', CONFIG.colors.deep);
      rivetR.setAttribute('stroke-width', '1.5');
      railsGroup.appendChild(rivetR);
    }
    svg.appendChild(railsGroup);

    // ——— 4. CAPA DE DESTELLO EN ÉXITO ———
    const flash = document.createElementNS(svgNS, 'rect');
    flash.setAttribute('id', 'loginFlash');
    flash.setAttribute('x', '0');
    flash.setAttribute('y', '0');
    flash.setAttribute('width', String(W));
    flash.setAttribute('height', String(H));
    flash.setAttribute('fill', '#FFF9E6');
    flash.style.opacity = '0';
    flash.style.pointerEvents = 'none';
    svg.appendChild(flash);

    scene.appendChild(svg);
  }

  /**
   * Construye el Engranaje Mecánico SVG que bordea la Card de Login
   */
  function buildGearSVG() {
    const wrapper = document.querySelector('.login-gear-wrapper');
    if (!wrapper) return;

    // Eliminar previo si existe
    const existing = document.getElementById('loginGear');
    if (existing) existing.remove();

    const svgNS = 'http://www.w3.org/2000/svg';
    const SIZE = 600;
    const CX = SIZE / 2;
    const CY = SIZE / 2;

    const N_TEETH = CONFIG.gearTeethCount;
    const R_OUTER = 296;  // Punta de los dientes
    const R_PITCH = 256;  // Base del diente / paso
    const R_RIM   = 240;  // Anillo exterior de acero
    const R_INNER = 226;  // Anillo interior donde se engarza exactamente la card circular

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', 'loginGear');
    svg.setAttribute('class', 'login-gear-svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('xmlns', svgNS);

    const defs = document.createElementNS(svgNS, 'defs');
    defs.innerHTML = `
      <!-- Gradiente radial para la corona metálica del engranaje -->
      <radialGradient id="gearSteelGrad" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stop-color="${CONFIG.colors.steelLight}" />
        <stop offset="35%" stop-color="${CONFIG.colors.primaryMid}" />
        <stop offset="70%" stop-color="${CONFIG.colors.primaryDark}" />
        <stop offset="100%" stop-color="${CONFIG.colors.deep}" />
      </radialGradient>

      <!-- Bisel de brillo en los dientes -->
      <radialGradient id="gearHighlightGrad" cx="30%" cy="25%" r="60%">
        <stop offset="0%" stop-color="${CONFIG.colors.steelEdge}" stop-opacity="0.8" />
        <stop offset="60%" stop-color="${CONFIG.colors.primary}" stop-opacity="0.1" />
        <stop offset="100%" stop-color="${CONFIG.colors.deep}" stop-opacity="0" />
      </radialGradient>

      <!-- Sombra de profundidad de maquinaria pesada -->
      <filter id="gearDropShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="${CONFIG.colors.deep}" flood-opacity="0.65" />
      </filter>
    `;
    svg.appendChild(defs);

    // Grupo giratorio que contiene la corona y dientes del engranaje
    const rotGroup = document.createElementNS(svgNS, 'g');
    rotGroup.setAttribute('id', 'gearTeethRim');
    rotGroup.setAttribute('filter', 'url(#gearDropShadow)');

    // Cálculo matemático de los dientes (trapezoidales con chaflán)
    const angleStep = (Math.PI * 2) / N_TEETH;
    const toothHalfAngle = angleStep * 0.28;

    function polarToCartesian(r, angle) {
      return {
        x: CX + r * Math.cos(angle),
        y: CY + r * Math.sin(angle)
      };
    }

    let outerPathD = '';
    for (let i = 0; i < N_TEETH; i++) {
      const midAngle = i * angleStep - Math.PI / 2;
      const aValleyStart = midAngle - angleStep * 0.5;
      const aToothBaseL  = midAngle - toothHalfAngle;
      const aToothTipL   = midAngle - toothHalfAngle * 0.58;
      const aToothTipR   = midAngle + toothHalfAngle * 0.58;
      const aToothBaseR  = midAngle + toothHalfAngle;
      const aValleyEnd   = midAngle + angleStep * 0.5;

      const p0 = polarToCartesian(R_PITCH, aValleyStart);
      const p1 = polarToCartesian(R_PITCH, aToothBaseL);
      const p2 = polarToCartesian(R_OUTER, aToothTipL);
      const p3 = polarToCartesian(R_OUTER, aToothTipR);
      const p4 = polarToCartesian(R_PITCH, aToothBaseR);
      const p5 = polarToCartesian(R_PITCH, aValleyEnd);

      if (i === 0) {
        outerPathD += `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} `;
      } else {
        outerPathD += `L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} `;
      }
      outerPathD += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `;
      outerPathD += `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
      outerPathD += `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} `;
      outerPathD += `L ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} `;
      outerPathD += `L ${p5.x.toFixed(2)} ${p5.y.toFixed(2)} `;
    }
    outerPathD += 'Z';

    // Agujero central para encajar la card blanca (regla even-odd)
    const innerHoleD =
      `M ${(CX + R_INNER).toFixed(2)} ${CY.toFixed(2)} ` +
      `A ${R_INNER} ${R_INNER} 0 1 0 ${(CX - R_INNER).toFixed(2)} ${CY.toFixed(2)} ` +
      `A ${R_INNER} ${R_INNER} 0 1 0 ${(CX + R_INNER).toFixed(2)} ${CY.toFixed(2)} Z`;

    // 1. Cuerpo principal del engranaje dentado
    const gearPath = document.createElementNS(svgNS, 'path');
    gearPath.setAttribute('d', outerPathD + ' ' + innerHoleD);
    gearPath.setAttribute('fill', 'url(#gearSteelGrad)');
    gearPath.setAttribute('fill-rule', 'evenodd');
    gearPath.setAttribute('stroke', CONFIG.colors.primaryDark);
    gearPath.setAttribute('stroke-width', '2');
    rotGroup.appendChild(gearPath);

    // 2. Capa de bisel y brillo superior
    const rimShine = document.createElementNS(svgNS, 'path');
    rimShine.setAttribute('d', outerPathD + ' ' + innerHoleD);
    rimShine.setAttribute('fill', 'url(#gearHighlightGrad)');
    rimShine.setAttribute('fill-rule', 'evenodd');
    rimShine.style.opacity = '0.65';
    rotGroup.appendChild(rimShine);

    // 3. Anillo de rodadura mecanizado (circunferencia grabada)
    const racewayCircle = document.createElementNS(svgNS, 'circle');
    racewayCircle.setAttribute('cx', String(CX));
    racewayCircle.setAttribute('cy', String(CY));
    racewayCircle.setAttribute('r', String(R_RIM));
    racewayCircle.setAttribute('fill', 'none');
    racewayCircle.setAttribute('stroke', CONFIG.colors.accent);
    racewayCircle.setAttribute('stroke-width', '1.5');
    racewayCircle.setAttribute('stroke-dasharray', '8 4');
    racewayCircle.style.opacity = '0.55';
    rotGroup.appendChild(racewayCircle);

    // 4. Pernos mecánicos perimetrales (cada 3 dientes)
    for (let b = 0; b < 8; b++) {
      const boltAngle = (b * Math.PI) / 4;
      const boltPt = polarToCartesian((R_RIM + R_INNER) / 2, boltAngle);

      const bolt = document.createElementNS(svgNS, 'circle');
      bolt.setAttribute('cx', boltPt.x.toFixed(2));
      bolt.setAttribute('cy', boltPt.y.toFixed(2));
      bolt.setAttribute('r', '4');
      bolt.setAttribute('fill', CONFIG.colors.steelLight);
      bolt.setAttribute('stroke', CONFIG.colors.deep);
      bolt.setAttribute('stroke-width', '1.5');
      rotGroup.appendChild(bolt);
    }

    // 5. Marcas de torque y sincronización en naranja (3 muescas a 120°)
    for (let t = 0; t < 3; t++) {
      const dotAngle = (t * (Math.PI * 2)) / 3 - Math.PI / 2;
      const dotPt = polarToCartesian(R_OUTER - 10, dotAngle);

      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', dotPt.x.toFixed(2));
      dot.setAttribute('cy', dotPt.y.toFixed(2));
      dot.setAttribute('r', '4.5');
      dot.setAttribute('fill', CONFIG.colors.accent);
      dot.setAttribute('stroke', CONFIG.colors.accentDark);
      dot.setAttribute('stroke-width', '1');
      rotGroup.appendChild(dot);
    }

    svg.appendChild(rotGroup);

    // Insertar el SVG antes de la card para que quede como su marco perimetral
    wrapper.insertBefore(svg, wrapper.firstChild);
  }

  /* ──────────────────────────────────────────────────────────────────────────
     6. ANIMACIONES Y ESTADOS GSAP
  ────────────────────────────────────────────────────────────────────────── */

  /**
   * Estado 1: Reposo (Idle)
   */
  function startIdleAnimations() {
    // Giro lento y continuo del engranaje
    gearTween = gsap.to('#gearTeethRim', {
      rotation: 360,
      duration: CONFIG.gearIdleDuration,
      repeat: -1,
      ease: 'none',
      transformOrigin: '50% 50%',
    });

    // Leve pulsación de la luz cálida en las rendijas de la cortina
    shutterGlowPulse = gsap.to('#shutterGlow', {
      opacity: 0.22,
      duration: 3.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });
  }

  /**
   * Estado 2: Foco en Inputs
   */
  function bindInputFocus() {
    const inputs = document.querySelectorAll('#adminLoginForm .form-group input');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        if (!isAuthenticating && gearTween && !prefersReducedMotion) {
          gsap.to(gearTween, { timeScale: 1.8, duration: 0.5 });
        }
      });
      input.addEventListener('blur', () => {
        if (!isAuthenticating && gearTween && !prefersReducedMotion) {
          gsap.to(gearTween, { timeScale: 1.0, duration: 0.7 });
        }
      });
    });
  }

  /**
   * Estado 3: Autenticando (Promesa pendiente)
   */
  function playLoading() {
    isAuthenticating = true;
    const wrapper = document.querySelector('.login-gear-wrapper');
    if (wrapper) wrapper.classList.add('is-loading');

    if (prefersReducedMotion) return;

    // Engranaje acelera a alta velocidad
    if (gearTween) {
      gsap.to(gearTween, { timeScale: CONFIG.gearLoadingSpeed, duration: 0.4, ease: 'power2.in' });
    }

    // Cortina y chasis tiemblan al unísono (vibración de maquinaria pesada)
    gsap.killTweensOf('#shutterSlats');
    shutterTremorTween = gsap.to('#shutterSlats', {
      x: 2.2,
      y: 1.0,
      duration: 0.055,
      repeat: -1,
      yoyo: true,
      ease: 'none'
    });

    if (wrapper) {
      gsap.to(wrapper, {
        x: 1.2,
        y: 0.8,
        duration: 0.06,
        repeat: -1,
        yoyo: true,
        ease: 'none'
      });
    }
  }

  /**
   * Detiene el estado de carga
   */
  function stopLoading() {
    isAuthenticating = false;
    const wrapper = document.querySelector('.login-gear-wrapper');
    if (wrapper) {
      wrapper.classList.remove('is-loading');
      gsap.killTweensOf(wrapper);
      gsap.to(wrapper, { x: 0, y: 0, duration: 0.2, ease: 'power2.out' });
    }

    if (prefersReducedMotion) return;

    // Detener temblor de la cortina
    if (shutterTremorTween) {
      shutterTremorTween.kill();
      shutterTremorTween = null;
    }
    gsap.to('#shutterSlats', { x: 0, y: 0, duration: 0.2, ease: 'power2.out' });

    // Restablecer velocidad del engranaje a reposo
    if (gearTween) {
      gsap.to(gearTween, { timeScale: 1.0, duration: 0.6, ease: 'power2.out' });
    }
  }

  /**
   * Estado 4: Éxito (Autenticación concedida)
   * Retorna una Promise que se resuelve exactamente cuando termina la animación
   */
  function playSuccess() {
    return new Promise((resolve) => {
      isSuccessDone = true;
      stopLoading();

      const overlay = document.getElementById('adminLoginOverlay');

      // Modo accesible: fundido rápido sin sacudidas ni persiana
      if (prefersReducedMotion) {
        if (overlay) {
          gsap.to(overlay, {
            opacity: 0,
            duration: 0.35,
            onComplete: () => {
              overlay.classList.add('is-hidden');
              document.body.classList.remove('is-locked');
              resolve();
            }
          });
        } else {
          resolve();
        }
        return;
      }

      const slats = document.querySelectorAll('.shutter-slat-item');
      const bottomBar = document.getElementById('shutterBottomBar');
      const masterTL = gsap.timeline({
        onComplete: () => {
          if (overlay) {
            overlay.classList.add('is-hidden');
            document.body.classList.remove('is-locked');
          }
          resolve();
        }
      });

      // 1. Destello luminoso (Flash) + Frenado del engranaje
      masterTL
        .to('#loginFlash', { opacity: 0.85, duration: 0.08, ease: 'power1.in' }, 0)
        .to('#loginFlash', { opacity: 0, duration: 0.3, ease: 'power2.out' }, '0.08')
        .to(gearTween, { timeScale: 0.05, duration: 0.45, ease: 'power3.out' }, 0)

        // 2. Luz interior inunda la pantalla
        .to('#shutterGlow', {
          opacity: 0.95,
          duration: 0.7,
          ease: 'power2.inOut'
        }, '0.1')

        // 3. Card hace zoom hacia el usuario hasta desvanecerse (atravesar el portal)
        .to('.login-gear-wrapper', {
          scale: CONFIG.cardZoomScale,
          opacity: 0,
          duration: CONFIG.cardZoomDuration,
          ease: 'power2.in',
          transformOrigin: '50% 50%'
        }, '0.15')

        // 4. Cortina SUBE con los listones apilándose arriba
        .to(slats, {
          y: -950,
          duration: CONFIG.shutterRiseDuration,
          stagger: {
            amount: 0.35,
            from: 'start'
          },
          ease: 'power3.inOut'
        }, '0.2')

        // 5. Barra inferior sube con fuerza y hace tope con leve rebote realista
        .to(bottomBar, {
          y: -950,
          duration: CONFIG.shutterRiseDuration,
          ease: CONFIG.shutterBounceEase
        }, '0.35')

        // 6. Transición final del overlay
        .to(overlay, {
          opacity: 0,
          duration: 0.25,
          ease: 'power1.out'
        }, '-=0.25');
    });
  }

  /**
   * Estado 5: Error (Credenciales inválidas)
   */
  function playError() {
    stopLoading();

    const wrapper = document.querySelector('.login-gear-wrapper');
    if (wrapper) {
      wrapper.classList.add('is-error');
      setTimeout(() => wrapper.classList.remove('is-error'), 1200);
    }

    if (prefersReducedMotion) return;

    // Sacudida brusca del conjunto engranaje + card ("trancazo" mecánico)
    if (gearTween) {
      gearTween.pause();
    }

    if (wrapper) {
      gsap.fromTo(wrapper,
        { x: -7 },
        { x: 7, duration: 0.05, repeat: 7, yoyo: true, ease: 'power2.inOut', onComplete: () => {
          gsap.to(wrapper, { x: 0, duration: 0.15 });
        }}
      );
    }

    gsap.timeline()
      .fromTo('#gearTeethRim',
        { rotation: '+=0' },
        {
          rotation: '+=15',
          duration: 0.065,
          repeat: 7,
          yoyo: true,
          ease: 'power2.inOut',
          transformOrigin: '50% 50%',
          onComplete: () => {
            if (gearTween) {
              gearTween.play();
              gearTween.timeScale(1.0);
            }
          }
        }
      );

    // Resalte rojo de advertencia en los inputs
    gsap.fromTo('#adminLoginForm .form-group input',
      { borderColor: CONFIG.colors.danger, boxShadow: '0 0 0 3px rgba(198, 40, 40, 0.35)' },
      { borderColor: '', boxShadow: '', duration: 1.1, delay: 0.5, clearProps: 'borderColor,boxShadow' }
    );
  }

  /**
   * Restablece el login overlay a su estado inicial de reposo (ej. al cerrar sesión)
   */
  function resetLoginState() {
    isSuccessDone = false;
    isAuthenticating = false;

    const overlay = document.getElementById('adminLoginOverlay');
    const wrapper = document.querySelector('.login-gear-wrapper');

    if (typeof gsap !== 'undefined') {
      if (overlay) gsap.killTweensOf(overlay);
      if (wrapper) gsap.killTweensOf(wrapper);
      gsap.killTweensOf(['#loginFlash', '#shutterGlow', '#shutterSlats', '.shutter-slat-item', '#shutterBottomBar', '#loginShutter']);

      if (overlay) {
        gsap.set(overlay, { clearProps: 'all' });
        overlay.style.opacity = '';
        overlay.style.visibility = '';
      }
      if (wrapper) {
        gsap.set(wrapper, { clearProps: 'all' });
        wrapper.style.opacity = '';
        wrapper.style.transform = '';
      }
    }

    if (wrapper) {
      wrapper.classList.remove('is-loading', 'is-error');
    }

    const submitBtn = document.querySelector('#adminLoginForm button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
    }
    const errorMsg = document.getElementById('loginErrorMsg');
    if (errorMsg) {
      errorMsg.classList.remove('is-visible');
    }

    // Reconstruir la cortina completa para que todos los listones y la barra inferior vuelvan a su posición inicial
    buildShutterSVG();

    // Reiniciar engranaje y ciclo de reposo
    if (gearTween) {
      gearTween.kill();
      gearTween = null;
    }
    if (!prefersReducedMotion && typeof gsap !== 'undefined') {
      startIdleAnimations();
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     7. EXPOSICIÓN DE API PÚBLICA (window.LoginAnim)
  ────────────────────────────────────────────────────────────────────────── */
  function setupPublicAPI() {
    window.LoginAnim = {
      playLoading,
      stopLoading,
      playSuccess,
      playError,
      reset: resetLoginState,
      isReady: true,
      // Ajustes dinámicos opcionales
      setGearSpeed: (seconds) => {
        CONFIG.gearIdleDuration = seconds;
        if (gearTween) gearTween.duration(seconds);
      },
      getConfig: () => ({ ...CONFIG })
    };
  }

  /* ──────────────────────────────────────────────────────────────────────────
     8. OBSERVADORES DEFENSIVOS (MUTATION OBSERVERS)
     Garantizan compatibilidad automática si admin.js no invoca la API directa
  ────────────────────────────────────────────────────────────────────────── */
  function setupDefensiveObservers() {
    const overlay   = document.getElementById('adminLoginOverlay');
    const submitBtn = document.querySelector('#adminLoginForm button[type="submit"]');
    const errorMsg  = document.getElementById('loginErrorMsg');

    // 1. Detección automática de submit deshabilitado → Loading
    if (submitBtn) {
      let wasDisabled = false;
      const btnObs = new MutationObserver(() => {
        const isNowDisabled = submitBtn.disabled;
        if (isNowDisabled && !wasDisabled && !isSuccessDone) {
          playLoading();
        } else if (!isNowDisabled && wasDisabled && !isSuccessDone) {
          stopLoading();
        }
        wasDisabled = isNowDisabled;
      });
      btnObs.observe(submitBtn, { attributes: true, attributeFilter: ['disabled'] });
    }

    // 2. Detección automática de mensaje de error visible → Error
    if (errorMsg) {
      const errObs = new MutationObserver(() => {
        if (errorMsg.classList.contains('is-visible') && !isSuccessDone) {
          playError();
        }
      });
      errObs.observe(errorMsg, { attributes: true, attributeFilter: ['class'] });
    }

    // 3. Detección de cambios de visibilidad en el overlay (apertura / logout)
    if (overlay) {
      const overObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === 'class') {
            const isHidden = overlay.classList.contains('is-hidden');
            if (isHidden && !isSuccessDone) {
              // Intercepta cierre no coordinado con playSuccess
              overlay.classList.remove('is-hidden');
              playSuccess();
            } else if (!isHidden && isSuccessDone) {
              // El overlay se reabre tras haber tenido éxito previo (ej. al salir)
              resetLoginState();
            }
          }
        }
      });
      overObs.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /**
   * Fallback estático en caso de fallo crítico en GSAP CDN
   */
  function setupFallbackStatic() {
    buildShutterSVG();
    buildGearSVG();
    setupPublicAPI();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     BOOTSTRAP
  ────────────────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
