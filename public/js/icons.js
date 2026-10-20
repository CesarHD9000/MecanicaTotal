/* ==========================================================================
   icons.js — Adaptador de Iconografía y Generador de Esquemas Técnicos
   Proporciona iconos vectoriales de alta definición (Font Awesome 6) y
   generación de Ilustraciones / Diagramas Esquemáticos Reales con
   puntos de control numerados [01], [02], [03], [04] para lecciones LMS.
   ========================================================================== */

const ICONS = {
  logo: `<i class="fa-solid fa-gears" style="color:var(--c-accent);"></i>`,

  // Categorías de Módulos Automotrices
  engine: `<i class="fa-solid fa-gears"></i>`,
  tools: `<i class="fa-solid fa-screwdriver-wrench"></i>`,
  fluids: `<i class="fa-solid fa-oil-can"></i>`,
  tire: `<i class="fa-solid fa-circle-dot"></i>`,
  brake: `<i class="fa-solid fa-compact-disc"></i>`,
  spark: `<i class="fa-solid fa-bolt-lightning" style="color:var(--c-accent);"></i>`,
  electrical: `<i class="fa-solid fa-car-battery"></i>`,
  radiator: `<i class="fa-solid fa-fan"></i>`,
  obd: `<i class="fa-solid fa-microchip"></i>`,
  timing: `<i class="fa-solid fa-rotate"></i>`,
  injection: `<i class="fa-solid fa-gas-pump"></i>`,
  transmission: `<i class="fa-solid fa-gear"></i>`,

  // Navegación e Interfaz
  arrow: `<i class="fa-solid fa-arrow-right"></i>`,
  chevron: `<i class="fa-solid fa-chevron-down"></i>`,
  close: `<i class="fa-solid fa-xmark"></i>`,
  zoom: `<i class="fa-solid fa-magnifying-glass-plus"></i>`,
  up: `<i class="fa-solid fa-arrow-up"></i>`,
  mail: `<i class="fa-solid fa-envelope"></i>`,
  phone: `<i class="fa-solid fa-phone"></i>`,
  pin: `<i class="fa-solid fa-location-dot"></i>`,

  // Sección Nosotros y Misiones
  target: `<i class="fa-solid fa-bullseye"></i>`,
  compass: `<i class="fa-solid fa-compass"></i>`,
  eye: `<i class="fa-solid fa-eye"></i>`,
  flag: `<i class="fa-solid fa-flag"></i>`,
};

const SOCIAL_ICONS = {
  facebook: `<i class="fa-brands fa-facebook-f"></i>`,
  instagram: `<i class="fa-brands fa-instagram"></i>`,
  youtube: `<i class="fa-brands fa-youtube"></i>`,
  tiktok: `<i class="fa-brands fa-tiktok"></i>`,
};

/* --------------------------------------------------------------------------
   GENERADOR DE ESQUEMAS TECNICOS ILUSTRADOS (BLUEPRINTS REALES)
   Genera planos técnicos detallados en formato SVG con retícula industrial y
   pines numerados guiados [01], [02], [03] directamente sobre los componentes.
   -------------------------------------------------------------------------- */
function getTechnicalBlueprintSVG(type) {
  switch (type) {
    case 'engine':
      return `
        <!-- Bloque Motor Blueprint -->
        <rect x="110" y="80" width="180" height="120" rx="8" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <rect x="130" y="50" width="140" height="30" rx="4" fill="none" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="150" cy="140" r="22" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <circle cx="210" cy="140" r="22" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <path d="M70 110h40v60H70z" fill="none" stroke="#38BDF8" stroke-width="2"/>
        <path d="M130 50L100 20M270 50l30-30" stroke="#38BDF8" stroke-width="2" stroke-dasharray="3 3"/>
        <circle cx="85" cy="80" r="16" fill="none" stroke="#F77F00" stroke-width="2"/>
      `;

    case 'tools':
      return `
        <!-- Herramientas y Gato Blueprint -->
        <path d="M80 160l60-60a16 16 0 1122 22l-60 60z" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <rect x="200" y="140" width="120" height="50" rx="6" fill="none" stroke="#38BDF8" stroke-width="2"/>
        <path d="M220 140v-40h80v40" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <circle cx="220" cy="190" r="12" fill="none" stroke="#F77F00" stroke-width="2"/>
        <circle cx="300" cy="190" r="12" fill="none" stroke="#F77F00" stroke-width="2"/>
        <rect x="110" y="40" width="60" height="30" rx="4" fill="none" stroke="#38BDF8" stroke-width="2"/>
      `;

    case 'fluids':
      return `
        <!-- Depósito de Fluidos y Varilla Blueprint -->
        <rect x="140" y="60" width="130" height="140" rx="14" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <path d="M140 100h130" stroke="#F8F9FA" stroke-width="1.5" stroke-dasharray="4 4"/>
        <path d="M140 160h130" stroke="#F77F00" stroke-width="2"/>
        <path d="M80 30l40 90" stroke="#38BDF8" stroke-width="3"/>
        <circle cx="80" cy="30" r="10" fill="none" stroke="#F77F00" stroke-width="2.5"/>
        <rect x="180" y="30" width="50" height="30" rx="4" fill="none" stroke="#38BDF8" stroke-width="2"/>
      `;

    case 'tire':
      return `
        <!-- Neumático y Perfil Tread Blueprint -->
        <circle cx="200" cy="120" r="85" fill="none" stroke="#38BDF8" stroke-width="3"/>
        <circle cx="200" cy="120" r="45" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <circle cx="200" cy="120" r="18" fill="none" stroke="#38BDF8" stroke-width="2"/>
        <!-- Tuercas patrón estrella -->
        <circle cx="200" cy="95" r="5" fill="#F77F00"/>
        <circle cx="224" cy="112" r="5" fill="#F77F00"/>
        <circle cx="215" cy="139" r="5" fill="#F77F00"/>
        <circle cx="185" cy="139" r="5" fill="#F77F00"/>
        <circle cx="176" cy="112" r="5" fill="#F77F00"/>
        <path d="M285 120h40M285 100h40M285 140h40" stroke="#F8F9FA" stroke-width="2"/>
      `;

    case 'brake':
      return `
        <!-- Disco de Freno y Caliper Blueprint -->
        <circle cx="180" cy="120" r="80" fill="none" stroke="#38BDF8" stroke-width="3"/>
        <circle cx="180" cy="120" r="30" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <rect x="220" y="60" width="60" height="70" rx="8" fill="none" stroke="#F77F00" stroke-width="2.5"/>
        <rect x="230" y="75" width="20" height="40" rx="3" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <path d="M180 50v-15M180 190v15M110 120H95M250 120h15" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="3 3"/>
      `;

    case 'spark':
      return `
        <!-- Bujía de Encendido Blueprint -->
        <rect x="180" y="30" width="40" height="40" rx="4" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <rect x="185" y="70" width="30" height="60" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <path d="M185 130l-10 40h50l-10-40" fill="none" stroke="#38BDF8" stroke-width="2"/>
        <path d="M200 170v25" stroke="#F77F00" stroke-width="3"/>
        <path d="M190 200h20" stroke="#F77F00" stroke-width="2"/>
      `;

    case 'electrical':
      return `
        <!-- Batería y Fusibles Blueprint -->
        <rect x="100" y="60" width="160" height="120" rx="8" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <rect x="120" y="35" width="25" height="25" rx="3" fill="none" stroke="#D62828" stroke-width="2.5"/>
        <text x="128" y="52" fill="#D62828" font-size="16" font-weight="bold">+</text>
        <rect x="215" y="35" width="25" height="25" rx="3" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <text x="224" y="51" fill="#38BDF8" font-size="16" font-weight="bold">-</text>
        <rect x="280" y="75" width="50" height="90" rx="6" fill="none" stroke="#F77F00" stroke-width="2"/>
      `;

    case 'radiator':
      return `
        <!-- Radiador y Ventilador Blueprint -->
        <rect x="100" y="50" width="150" height="140" rx="6" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <path d="M120 50v140M140 50v140M160 50v140M180 50v140M200 50v140M220 50v140" stroke="#38BDF8" stroke-width="1" stroke-dasharray="4 2"/>
        <circle cx="290" cy="120" r="35" fill="none" stroke="#F77F00" stroke-width="2.5"/>
        <path d="M290 85v70M255 120h70" stroke="#F77F00" stroke-width="2"/>
      `;

    case 'obd':
      return `
        <!-- Escáner OBD-II Blueprint -->
        <rect x="80" y="70" width="110" height="60" rx="6" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <path d="M95 90h80M95 110h80" stroke="#38BDF8" stroke-width="2" stroke-dasharray="4 4"/>
        <rect x="230" y="40" width="110" height="150" rx="10" fill="none" stroke="#F8F9FA" stroke-width="2.5"/>
        <rect x="245" y="60" width="80" height="50" rx="4" fill="none" stroke="#F77F00" stroke-width="2"/>
        <path d="M190 100c20 0 20 50 40 50" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
      `;

    case 'timing':
      return `
        <!-- Correa de Distribución Blueprint -->
        <circle cx="130" cy="120" r="35" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <circle cx="270" cy="80" r="45" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <circle cx="270" cy="170" r="30" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <path d="M130 85L270 35M130 155l140 45" stroke="#F77F00" stroke-width="3"/>
      `;

    case 'injection':
      return `
        <!-- Inyector de Combustible Blueprint -->
        <rect x="175" y="30" width="50" height="100" rx="6" fill="none" stroke="#38BDF8" stroke-width="2.5"/>
        <path d="M175 130l15 50h20l15-50" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <path d="M190 180l-20 35M200 180v40M210 180l20 35" stroke="#F77F00" stroke-width="2" stroke-dasharray="3 3"/>
        <rect x="225" y="50" width="30" height="25" rx="3" fill="none" stroke="#F77F00" stroke-width="2"/>
      `;

    case 'transmission':
    default:
      return `
        <!-- Embrague y Transmisión Blueprint -->
        <circle cx="180" cy="120" r="75" fill="none" stroke="#38BDF8" stroke-width="3"/>
        <circle cx="180" cy="120" r="50" fill="none" stroke="#F8F9FA" stroke-width="2"/>
        <circle cx="180" cy="120" r="22" fill="none" stroke="#F77F00" stroke-width="2.5"/>
        <path d="M180 45v150M105 120h150" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="4 4"/>
      `;
  }
}

/* --------------------------------------------------------------------------
   FUNCIÓN BUILDDIAGRAM
   Soporta imágenes personalizadas (URL / Base64 subidas en el Admin) o cae
   de vuelta al plano vectorial Blueprint con callout pins numerados.
   -------------------------------------------------------------------------- */
function buildDiagram(type, labels = [], accent = '#F77F00', imageUrl = '') {
  const legendHtml = labels.map(l => `
    <div class="diagram-label-item">
      <span class="label-badge" style="background:${accent};">${l.n}</span>
      <span class="label-text">${l.text}</span>
    </div>
  `).join('');

  // Si el módulo incluye una imagen subida por el usuario/admin
  if (imageUrl && imageUrl.trim()) {
    return `
      <div class="technical-diagram-card">
        <div class="diagram-visual-area diagram-visual-area--img">
          <img src="${imageUrl}" class="diagram-custom-img" alt="Esquema ilustrativo del módulo" />
        </div>
        ${labels.length ? `<div class="diagram-labels-legend">${legendHtml}</div>` : ''}
      </div>
    `;
  }

  // Si no hay imagen personalizada, renderizar el plano vectorial Blueprint
  const pinPositions = [
    { x: 130, y: 80 },
    { x: 230, y: 70 },
    { x: 210, y: 150 },
    { x: 290, y: 140 }
  ];

  const svgDrawing = getTechnicalBlueprintSVG(type);

  const pinsHtml = labels.map((l, idx) => {
    const pos = pinPositions[idx] || { x: 80 + idx * 70, y: 120 };
    return `
      <g class="diagram-pin-group" transform="translate(${pos.x}, ${pos.y})">
        <circle r="13" fill="${accent}" stroke="#FFFFFF" stroke-width="2"/>
        <text x="0" y="4" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle">${l.n}</text>
      </g>
    `;
  }).join('');

  return `
    <div class="technical-diagram-card">
      <div class="diagram-visual-area">
        <svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" class="blueprint-svg">
          <!-- Retícula Blueprint -->
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="400" height="240" fill="#0F2036"/>
          <rect width="400" height="240" fill="url(#grid)"/>

          <!-- Plano Vectorial -->
          <g class="blueprint-drawing">
            ${svgDrawing}
          </g>

          <!-- Pines Numerados -->
          <g class="blueprint-pins">
            ${pinsHtml}
          </g>

          <!-- Marca de agua -->
          <text x="12" y="228" font-family="JetBrains Mono, monospace" font-size="9" fill="rgba(255,255,255,0.4)" letter-spacing="1">ESQUEMA TÉCNICO VECT-2026</text>
        </svg>
      </div>
      ${labels.length ? `<div class="diagram-labels-legend">${legendHtml}</div>` : ''}
    </div>
  `;
}
