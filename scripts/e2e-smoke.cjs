/**
 * Smoke test end-to-end facoltativo (browser reale) del flusso principale di PERSONA.
 * Richiede Playwright con Chromium (`npm i -g playwright && npx playwright install chromium`)
 * e un backend avviato in produzione su un database VUOTO, ad esempio:
 *   npm run build
 *   PERSONA_DATA_DIR=/tmp/persona-e2e PERSONA_PORT=4399 npm start
 *   node scripts/e2e-smoke.cjs /tmp/persona-shots
 * Usa il provider "Mock": non serve LM Studio.
 */
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const BASE = process.env.PERSONA_E2E_URL ?? 'http://127.0.0.1:4399';
const SHOTS = process.argv[2] ?? 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  let failures = 0;
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('OK  ', name);
    } catch (e) {
      failures++;
      console.log('FAIL', name, e.message.split('\n')[0]);
      await page.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '_')}.png` });
    }
  };

  await step('characters empty', async () => {
    await page.goto(BASE + '/characters');
    await page.getByText('Nessun personaggio').waitFor({ timeout: 5000 });
  });
  await step('set mock default', async () => {
    await page.goto(BASE + '/settings');
    const card = page.locator('div.rounded-lg.border', { has: page.locator('input[value^="Mock"]') });
    await card.getByRole('button', { name: 'Usa come predefinito' }).click();
    await page.getByText('Salvato').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
  });
  await step('create character', async () => {
    await page.goto(BASE + '/characters/new');
    await page.getByLabel('Nome completo').fill('Irina Volkova');
    await page.getByLabel('Professione').fill('Astrofisica');
    await page.getByLabel('Luogo d\'origine').fill('Novosibirsk');
    await page.getByLabel('Biografia').fill('Cresciuta in Siberia, studia la dinamica delle stelle binarie.');
    await page.getByRole('tab', { name: 'Psicologia' }).click();
    const traitInput = page.getByLabel('Aggiungi: Tratti di personalità');
    await traitInput.fill('Curiosa e meticolosa');
    await traitInput.press('Enter');
    await page.getByRole('tab', { name: 'Lingue' }).click();
    await page.getByRole('button', { name: 'Aggiungi lingua' }).click();
    await page.getByRole('button', { name: 'Aggiungi lingua' }).click();
    await page.getByRole('tab', { name: 'Competenze' }).click();
    await page.getByRole('button', { name: 'Aggiungi competenza' }).click();
    await page.getByLabel('Dominio').fill('Cosmologia');
    await page.getByRole('button', { name: 'Crea' }).click();
    await page.waitForURL(/\/characters\/[0-9a-f-]{36}/, { timeout: 5000 });
    await page.getByText('identità v1').waitFor();
    await page.screenshot({ path: `${SHOTS}/editor.png`, fullPage: true });
  });
  await step('edit character creates revision', async () => {
    await page.getByRole('tab', { name: 'Identità' }).click();
    await page.getByLabel('Età').fill('52');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByText('versione identità 2').waitFor({ timeout: 5000 });
  });
  await step('dialogue streams and persists', async () => {
    await page.getByRole('button', { name: 'Dialoga' }).click();
    await page.getByRole('button', { name: 'Nuova conversazione' }).first().click();
    await page.waitForURL(/\/dialogue\/[^/]+\/[0-9a-f-]{36}/);
    const box = page.getByRole('textbox', { name: /Scrivi a Irina/ });
    await box.fill('Parlami della materia oscura');
    await box.press('Enter');
    await page.getByText('[Irina Volkova] Risposta simulata').waitFor({ timeout: 10000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/dialogue.png` });
    await page.reload();
    await page.getByText('[Irina Volkova] Risposta simulata').waitFor({ timeout: 5000 });
    await page.getByText('Parlami della materia oscura').first().waitFor();
  });
  await step('analysis mode', async () => {
    await page.getByRole('radio', { name: 'Analisi esterna' }).click();
    const box = page.getByRole('textbox', { name: /analisi esterna/i });
    await box.fill('È coerente?');
    await box.press('Enter');
    await page.getByText('[analisi esterna su Irina Volkova]').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/analysis.png` });
  });
  await step('full prompt preview', async () => {
    await page.getByRole('button', { name: 'Anteprima del prompt completo' }).click();
    await page.getByText('CANONICAL IDENTITY (permanent)').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/prompt.png` });
    await page.keyboard.press('Escape');
  });
  await step('process memory', async () => {
    await page.getByRole('button', { name: 'Elabora memoria' }).click();
    await page.getByText(/Memoria elaborata/).waitFor({ timeout: 10000 });
  });
  await step('memory page', async () => {
    await page.goto(BASE + '/memory');
    await page.getByLabel('Seleziona un personaggio').selectOption({ label: 'Irina Volkova' });
    await page.getByText('Mock: si è parlato').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/memory.png`, fullPage: true });
  });
  await step('scenario with participant and session', async () => {
    await page.goto(BASE + '/scenarios');
    await page.getByLabel('Titolo').fill('Nave Aurora');
    await page.getByRole('button', { name: 'Nuovo scenario' }).click();
    await page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/);
    await page.getByLabel('Ambientazione').fill('Nave interstellare in rotta verso Proxima');
    await page.getByLabel('Situazione attuale').fill('Guasto al sistema di navigazione');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('Salvato').first().waitFor();
    await page.getByRole('tab', { name: /Partecipanti/ }).click();
    await page.locator('select').first().selectOption({ label: 'Irina Volkova' });
    await page.getByLabel('Ruolo').first().fill('Specialista di navigazione astronomica');
    await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
    await page.getByRole('link', { name: 'Irina Volkova' }).waitFor();
    await page.getByRole('tab', { name: 'Sessioni' }).click();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crea' }).click();
    await page.waitForURL(/sessions\//);
    const box = page.getByRole('textbox', { name: /Scrivi a Irina/ });
    await box.fill('Il sensore stellare è guasto. Che facciamo?');
    await box.press('Enter');
    await page.getByText('[Irina Volkova] Risposta simulata').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/scenario-session.png` });
  });
  await step('english ui', async () => {
    await page.goto(BASE + '/settings');
    await page.getByLabel("Lingua dell'interfaccia").selectOption('en');
    await page.getByText('Interface language').waitFor();
    await page.goto(BASE + '/characters');
    await page.getByRole('heading', { name: 'Characters' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/characters-en.png` });
    await page.reload();
    await page.getByRole('heading', { name: 'Characters' }).waitFor();
  });
  await step('light theme', async () => {
    await page.goto(BASE + '/settings');
    await page.getByRole('radio', { name: 'Light' }).click();
    await page.goto(BASE + '/scenarios');
    await page.screenshot({ path: `${SHOTS}/scenarios-light.png` });
  });
  console.log('console errors:', errors.length ? errors : 'none');
  await browser.close();
  if (failures > 0 || errors.length > 0) process.exit(1);
})();
