import type { CharacterExportV1, ConversationDetail, Memory } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, createTestEnv, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { memory: { autoProcess: false } } });
});
afterEach(async () => {
  await env.close();
});

describe('import/export', () => {
  it('round-trips a character with memories, knowledge and conversations', async () => {
    const c = await createCharacter(env, { bigFive: { openness: 85, conscientiousness: 70, extraversion: null, agreeableness: 40, neuroticism: null } });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'core', content: 'Ha perso il padre a 12 anni', importance: 5 } });
    await env.app.inject({
      method: 'POST',
      url: `/api/characters/${c.id}/knowledge`,
      payload: { title: 'Appunti sulle pulsar', kind: 'markdown', content: '# Pulsar\n\nLe pulsar millisecondo sono orologi naturali.', epistemicStatus: 'fact' },
    });
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id, title: 'Sessione 1' } })).json();
    await send(env, conv.id, { content: 'Che cos’è una pulsar?' });

    const exp = await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export` });
    expect(exp.headers['content-disposition']).toContain('persona-Irina_Volkova.json');
    const data = exp.json() as CharacterExportV1;
    expect(data.format).toBe('persona.character');
    expect(data.version).toBe(1);
    expect(data.character.bigFive?.openness).toBe(85);
    expect(data.memories).toHaveLength(1);
    expect(data.knowledge).toHaveLength(1);
    expect(data.conversations[0].messages).toHaveLength(2);

    const imp = await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: data });
    expect(imp.statusCode).toBe(201);
    const result = imp.json();
    expect(result.character.id).not.toBe(c.id);
    expect(result.character.name).toBe('Irina Volkova');
    expect(result.character.languages.map((l: { code: string }) => l.code)).toEqual(['ru', 'en', 'it']);
    expect(result.imported).toEqual({ memories: 1, knowledge: 1, conversations: 1, messages: 2 });

    const mems = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${result.character.id}` })).json() as Memory[];
    expect(mems[0].content).toBe('Ha perso il padre a 12 anni');
    const convs = (await env.app.inject({ method: 'GET', url: `/api/conversations?characterId=${result.character.id}` })).json();
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${convs[0].id}` })).json() as ConversationDetail;
    expect(detail.messages[1].characterId).toBe(result.character.id);
    const hits = (await env.app.inject({ method: 'GET', url: `/api/characters/${result.character.id}/knowledge/search?q=orologi` })).json();
    expect(hits).toHaveLength(1);
    // L'originale esiste ancora, invariato.
    expect((await env.app.inject({ method: 'GET', url: '/api/characters' })).json()).toHaveLength(2);
  });

  it('skips contextual memories whose scenario does not exist', async () => {
    const c = await createCharacter(env);
    const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora' } })).json();
    await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: c.id, role: 'Navigatrice' } });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'contextual', scenarioId: s.id, content: 'Evento di bordo' } });
    const data = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export?contextual=1` })).json() as CharacterExportV1;
    expect(data.memories).toHaveLength(1);
    expect(data.scenarios).toEqual([{ id: s.id, title: 'Aurora' }]);
    await env.app.inject({ method: 'DELETE', url: `/api/scenarios/${s.id}` });
    const result = (await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: data })).json();
    expect(result.skipped.contextualMemories).toBe(1);
    expect(result.imported.memories).toBe(0);
  });

  it('rejects invalid import files', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: { format: 'other' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_import');
  });
});

describe('backup and restore', () => {
  it('creates a backup and restores it', async () => {
    const a = await createCharacter(env, { name: 'Prima' });
    const backup = (await env.app.inject({ method: 'POST', url: '/api/backups' })).json();
    expect(backup.fileName).toMatch(/^persona-.*\.db$/);
    await createCharacter(env, { name: 'Seconda' });
    expect((await env.app.inject({ method: 'GET', url: '/api/characters' })).json()).toHaveLength(2);

    const download = await env.app.inject({ method: 'GET', url: `/api/backups/${backup.fileName}` });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');

    const restored = await env.app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/octet-stream' },
      payload: download.rawPayload,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().safetyBackup).toMatch(/^persona-pre-restore-/);
    const list = (await env.app.inject({ method: 'GET', url: '/api/characters' })).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([a.id]);

    // La copia di sicurezza contiene lo stato precedente e può essere ripristinata.
    const back = await env.app.inject({ method: 'POST', url: `/api/backups/${restored.json().safetyBackup}/restore` });
    expect(back.statusCode).toBe(200);
    expect((await env.app.inject({ method: 'GET', url: '/api/characters' })).json()).toHaveLength(2);
    const backups = (await env.app.inject({ method: 'GET', url: '/api/backups' })).json();
    expect(backups.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects files that are not PERSONA databases', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('not a database at all'.repeat(50)),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_backup');
    expect((await env.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('rejects path traversal in backup names', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/backups/..%2Fpersona.db' });
    expect(res.statusCode).toBe(400);
  });
});
