// Detecta clases usadas en cada HTML que no están definidas en el CSS que carga.
// Sirve para atrapar el caso típico de este proyecto: una clase compartida que
// se define en la hoja de otra página y no se carga donde se usa
// (pasó con .btn--block y con .search-box).
import { readFile, readdir } from 'node:fs/promises';

const PAGES = {
  'index.html':      ['base/_tokens.css','base/_reset.css','base/_layout.css','base/_responsive.css','pages/index.css'],
  'cursos.html':     ['base/_tokens.css','base/_reset.css','base/_layout.css','base/_responsive.css','base/_richtext.css','pages/cursos.css'],
  'admin.html':      ['base/_tokens.css','base/_reset.css','base/_layout.css','base/_responsive.css','base/_richtext.css','pages/admin.css'],
  'privacidad.html': ['base/_tokens.css','base/_reset.css','base/_layout.css','base/_responsive.css','pages/legal.css'],
  'terminos.html':   ['base/_tokens.css','base/_reset.css','base/_layout.css','base/_responsive.css','pages/legal.css'],
};

// Envoltorios semánticos sin estilos propios: existen como gancho de estructura
// o para el JavaScript, no necesitan reglas CSS.
const STRUCTURAL = new Set([
  'about-copy', 'contact-form', 'tree-nav',
  'dynamic-inputs-container', 'quiz-builder-body',
]);

// Clases que genera el JS (no están en el HTML estático) o utilidades del navegador
const IGNORE = /^(fa-|fa$|is-|js-)/;

const cssCache = new Map();
async function classesIn(file) {
  if (cssCache.has(file)) return cssCache.get(file);
  const src = (await readFile('public/css/' + file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const set = new Set();
  for (const m of src.matchAll(/\.([a-zA-Z][\w-]*)/g)) set.add(m[1]);
  cssCache.set(file, set);
  return set;
}

// Clases que el JS inyecta en el DOM
const jsSrc = (await Promise.all((await readdir('public/js')).filter(f => f.endsWith('.js'))
  .map(f => readFile('public/js/' + f, 'utf8')))).join('\n');
const jsClasses = new Set();
for (const m of jsSrc.matchAll(/class="([^"$]*)"/g)) m[1].split(/\s+/).forEach(c => c && jsClasses.add(c));
for (const m of jsSrc.matchAll(/classList\.(?:add|toggle|remove)\('([\w-]+)'/g)) jsClasses.add(m[1]);

for (const [page, files] of Object.entries(PAGES)) {
  const html = await readFile('public/' + page, 'utf8');
  const used = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
  const defined = new Set();
  for (const f of files) for (const c of await classesIn(f)) defined.add(c);

  const orphans = [...used].filter(c =>
    !defined.has(c) && !jsClasses.has(c) && !STRUCTURAL.has(c) && !IGNORE.test(c));
  if (orphans.length) console.log(`${page.padEnd(18)} → sin estilo: ${orphans.join(', ')}`);
  else console.log(`${page.padEnd(18)} → ok`);
}
