/**
 * Smoke test dell'app desktop: avvia Electron con un database temporaneo, verifica che
 * interfaccia, API e database funzionino, salva uno screenshot e termina.
 * Su Linux senza display: `xvfb-run npm run smoke`.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron'); // percorso dell'eseguibile
const dataDir = mkdtempSync(join(tmpdir(), 'persona-desktop-'));
const shots = process.argv[2] ?? join(dataDir, 'shots');
const args = ['.'];
if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu');
const res = spawnSync(electron, args, {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PERSONA_DATA_DIR: dataDir, PERSONA_DESKTOP_SMOKE: shots },
  encoding: 'utf8',
  timeout: 90_000,
});
const line = `${res.stdout}`.split('\n').find((l) => l.startsWith('PERSONA_SMOKE '));
console.log(line ?? `${res.stdout}\n${res.stderr}`);
rmSync(dataDir, { recursive: true, force: true });
process.exit(line && JSON.parse(line.slice(14)).ok ? 0 : 1);
