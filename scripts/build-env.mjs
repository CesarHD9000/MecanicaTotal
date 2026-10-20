#!/usr/bin/env node
/* ==========================================================================
   scripts/build-env.mjs — Genera js/env.js a partir de variables de entorno
   --------------------------------------------------------------------------
   Las credenciales de Supabase no se versionan. En local se crean a mano
   copiando js/env.example.js; en Vercel/Netlify se inyectan en el build.

   Uso local:
     cp .env.example .env      (rellena los valores)
     node scripts/build-env.mjs

   En Vercel: define SUPABASE_URL y SUPABASE_ANON_KEY en
   Settings → Environment Variables. El buildCommand ya está en vercel.json.
   ========================================================================== */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'public', 'js', 'env.js');

/* Lee .env sin dependencias externas (solo para desarrollo local). */
function loadDotEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function readRole(jwt) {
  try {
    const payload = String(jwt).split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).role || null;
  } catch (err) {
    return null;
  }
}

function fail(message) {
  console.error('\n✖ build-env: ' + message + '\n');
  process.exit(1);
}

loadDotEnv();

const url = (process.env.SUPABASE_URL || '').trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

if (!url || !anonKey) {
  if (existsSync(TARGET)) {
    console.warn('⚠ build-env: sin variables de entorno; se conserva js/env.js existente.');
    process.exit(0);
  }
  fail(
    'faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.\n' +
    '  · En local: crea un .env (ver .env.example) y ejecuta `npm run build`\n' +
    '  · En Vercel: Settings → Environment Variables'
  );
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  fail(`SUPABASE_URL no tiene el formato esperado (https://<ref>.supabase.co): ${url}`);
}

const role = readRole(anonKey);
if (role === 'service_role') {
  fail(
    'SUPABASE_ANON_KEY contiene una clave "service_role".\n' +
    '  Esa clave omite RLS y da acceso total a la base de datos: nunca debe\n' +
    '  llegar al navegador. Usa la clave "anon".'
  );
}
if (role !== 'anon') {
  fail('SUPABASE_ANON_KEY no parece una clave anon válida de Supabase.');
}

const contents = `/* ==========================================================================
   env.js — GENERADO AUTOMÁTICAMENTE por scripts/build-env.mjs
   No editar a mano ni versionar: está en .gitignore.
   ========================================================================== */

window.__ENV_SUPABASE_URL = '${url}';
window.__ENV_SUPABASE_ANON_KEY = '${anonKey}';
`;

writeFileSync(TARGET, contents, 'utf8');
console.log('✔ public/js/env.js generado para ' + url);
