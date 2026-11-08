import type { ParticipantInput, Scenario, ScenarioDetail, ScenarioInput, ScenarioSummary } from '@persona/shared';
import {
  eventInputSchema,
  participantInputSchema,
  participantUpdateSchema,
  relationshipInputSchema,
  scenarioInputSchema,
} from '@persona/shared';
import { and, asc, eq, or } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { characters, scenarioEvents, scenarioParticipants, scenarioRelationships, scenarios } from '../db/schema.js';
import { AppError, newId, notFound, nowIso, validate } from '../lib/util.js';
import { getCharacterRow } from './characters.js';

type ScenarioRow = typeof scenarios.$inferSelect;

function toScenario(r: ScenarioRow): Scenario {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    setting: r.setting,
    timeline: r.timeline,
    environment: r.environment,
    initialSituation: r.initialSituation,
    currentSituation: r.currentSituation,
    knowledge: r.knowledge,
    language: r.language,
    status: r.status as Scenario['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function getScenarioRow(ctx: AppContext, id: string): ScenarioRow {
  const row = ctx.dbm.db.select().from(scenarios).where(eq(scenarios.id, id)).get();
  if (!row) throw notFound('Scenario', id);
  return row;
}

export function getScenario(ctx: AppContext, id: string): ScenarioDetail {
  const row = getScenarioRow(ctx, id);
  const db = ctx.dbm.db;
  const participants = db
    .select({ p: scenarioParticipants, name: characters.name })
    .from(scenarioParticipants)
    .innerJoin(characters, eq(characters.id, scenarioParticipants.characterId))
    .where(eq(scenarioParticipants.scenarioId, id))
    .orderBy(asc(scenarioParticipants.sortOrder), asc(scenarioParticipants.createdAt))
    .all()
    .map(({ p, name }) => ({
      id: p.id,
      scenarioId: p.scenarioId,
      characterId: p.characterId,
      characterName: name,
      role: p.role,
      roleDescription: p.roleDescription,
      knowledge: p.knowledge,
      objectives: p.objectives,
      sortOrder: p.sortOrder,
    }));
  const relationships = db
    .select()
    .from(scenarioRelationships)
    .where(eq(scenarioRelationships.scenarioId, id))
    .orderBy(asc(scenarioRelationships.createdAt))
    .all()
    .map((r) => ({
      id: r.id,
      scenarioId: r.scenarioId,
      fromCharacterId: r.fromCharacterId,
      toCharacterId: r.toCharacterId,
      description: r.description,
    }));
  const events = db
    .select()
    .from(scenarioEvents)
    .where(eq(scenarioEvents.scenarioId, id))
    .orderBy(asc(scenarioEvents.sortOrder), asc(scenarioEvents.createdAt))
    .all()
    .map((e) => ({
      id: e.id,
      scenarioId: e.scenarioId,
      title: e.title,
      content: e.content,
      fictionalTime: e.fictionalTime,
      sortOrder: e.sortOrder,
      createdAt: e.createdAt,
    }));
  return { ...toScenario(row), participants, relationships, events };
}

export function listScenarios(ctx: AppContext): ScenarioSummary[] {
  const rows = ctx.dbm.db.select().from(scenarios).orderBy(asc(scenarios.status), asc(scenarios.title)).all();
  const counts = ctx.dbm.sqlite
    .prepare(
      `SELECT s.id,
              (SELECT count(*) FROM conversations c WHERE c.scenario_id = s.id) AS conversationCount,
              (SELECT group_concat(ch.name, '|') FROM scenario_participants p JOIN characters ch ON ch.id = p.character_id WHERE p.scenario_id = s.id) AS names
         FROM scenarios s`,
    )
    .all() as { id: string; conversationCount: number; names: string | null }[];
  const byId = new Map(counts.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = byId.get(r.id);
    const names = c?.names ? c.names.split('|') : [];
    return { ...toScenario(r), participantCount: names.length, participantNames: names, conversationCount: c?.conversationCount ?? 0 };
  });
}

export function createScenario(ctx: AppContext, input: ScenarioInput): ScenarioDetail {
  const data = validate(scenarioInputSchema, input);
  const id = newId();
  const ts = nowIso();
  ctx.dbm.db
    .insert(scenarios)
    .values({ id, ...data, currentSituation: data.currentSituation ?? data.initialSituation, createdAt: ts, updatedAt: ts })
    .run();
  return getScenario(ctx, id);
}

export function updateScenario(ctx: AppContext, id: string, input: ScenarioInput): ScenarioDetail {
  getScenarioRow(ctx, id);
  const data = validate(scenarioInputSchema, input);
  ctx.dbm.db.update(scenarios).set({ ...data, updatedAt: nowIso() }).where(eq(scenarios.id, id)).run();
  return getScenario(ctx, id);
}

/** Elimina lo scenario con le sue sessioni e memorie contestuali. Le identità restano intatte. */
export function deleteScenario(ctx: AppContext, id: string): void {
  getScenarioRow(ctx, id);
  ctx.dbm.db.delete(scenarios).where(eq(scenarios.id, id)).run();
}

function touch(ctx: AppContext, scenarioId: string) {
  ctx.dbm.db.update(scenarios).set({ updatedAt: nowIso() }).where(eq(scenarios.id, scenarioId)).run();
}

export function addParticipant(ctx: AppContext, scenarioId: string, input: ParticipantInput): ScenarioDetail {
  getScenarioRow(ctx, scenarioId);
  const data = validate(participantInputSchema, input);
  getCharacterRow(ctx, data.characterId);
  const exists = ctx.dbm.db
    .select({ id: scenarioParticipants.id })
    .from(scenarioParticipants)
    .where(and(eq(scenarioParticipants.scenarioId, scenarioId), eq(scenarioParticipants.characterId, data.characterId)))
    .get();
  if (exists) throw new AppError('conflict', 'Il personaggio partecipa già allo scenario', 409);
  const count = ctx.dbm.db.select({ id: scenarioParticipants.id }).from(scenarioParticipants).where(eq(scenarioParticipants.scenarioId, scenarioId)).all().length;
  ctx.dbm.db
    .insert(scenarioParticipants)
    .values({ id: newId(), scenarioId, ...data, sortOrder: count, createdAt: nowIso() })
    .run();
  touch(ctx, scenarioId);
  return getScenario(ctx, scenarioId);
}

export function updateParticipant(ctx: AppContext, participantId: string, input: unknown): ScenarioDetail {
  const row = ctx.dbm.db.select().from(scenarioParticipants).where(eq(scenarioParticipants.id, participantId)).get();
  if (!row) throw notFound('Partecipante', participantId);
  const data = validate(participantUpdateSchema, input);
  ctx.dbm.db.update(scenarioParticipants).set(data).where(eq(scenarioParticipants.id, participantId)).run();
  touch(ctx, row.scenarioId);
  return getScenario(ctx, row.scenarioId);
}

export function removeParticipant(ctx: AppContext, participantId: string): ScenarioDetail {
  const row = ctx.dbm.db.select().from(scenarioParticipants).where(eq(scenarioParticipants.id, participantId)).get();
  if (!row) throw notFound('Partecipante', participantId);
  ctx.dbm.db
    .delete(scenarioRelationships)
    .where(
      and(
        eq(scenarioRelationships.scenarioId, row.scenarioId),
        or(eq(scenarioRelationships.fromCharacterId, row.characterId), eq(scenarioRelationships.toCharacterId, row.characterId)),
      ),
    )
    .run();
  ctx.dbm.db.delete(scenarioParticipants).where(eq(scenarioParticipants.id, participantId)).run();
  touch(ctx, row.scenarioId);
  return getScenario(ctx, row.scenarioId);
}

export function getParticipant(ctx: AppContext, scenarioId: string, characterId: string) {
  return ctx.dbm.db
    .select()
    .from(scenarioParticipants)
    .where(and(eq(scenarioParticipants.scenarioId, scenarioId), eq(scenarioParticipants.characterId, characterId)))
    .get();
}

export function addRelationship(ctx: AppContext, scenarioId: string, input: unknown): ScenarioDetail {
  getScenarioRow(ctx, scenarioId);
  const data = validate(relationshipInputSchema, input);
  if (data.fromCharacterId === data.toCharacterId) throw new AppError('validation', 'Relazione con sé stessi non valida');
  for (const cid of [data.fromCharacterId, data.toCharacterId]) {
    if (!getParticipant(ctx, scenarioId, cid)) throw new AppError('validation', 'Entrambi i personaggi devono partecipare allo scenario');
  }
  ctx.dbm.db.insert(scenarioRelationships).values({ id: newId(), scenarioId, ...data, createdAt: nowIso() }).run();
  touch(ctx, scenarioId);
  return getScenario(ctx, scenarioId);
}

export function deleteRelationship(ctx: AppContext, id: string): ScenarioDetail {
  const row = ctx.dbm.db.select().from(scenarioRelationships).where(eq(scenarioRelationships.id, id)).get();
  if (!row) throw notFound('Relazione', id);
  ctx.dbm.db.delete(scenarioRelationships).where(eq(scenarioRelationships.id, id)).run();
  return getScenario(ctx, row.scenarioId);
}

export function addEvent(ctx: AppContext, scenarioId: string, input: unknown): ScenarioDetail {
  getScenarioRow(ctx, scenarioId);
  const data = validate(eventInputSchema, input);
  const count = ctx.dbm.db.select({ id: scenarioEvents.id }).from(scenarioEvents).where(eq(scenarioEvents.scenarioId, scenarioId)).all().length;
  ctx.dbm.db.insert(scenarioEvents).values({ id: newId(), scenarioId, ...data, sortOrder: count, createdAt: nowIso() }).run();
  touch(ctx, scenarioId);
  return getScenario(ctx, scenarioId);
}

export function updateEvent(ctx: AppContext, id: string, input: unknown): ScenarioDetail {
  const row = ctx.dbm.db.select().from(scenarioEvents).where(eq(scenarioEvents.id, id)).get();
  if (!row) throw notFound('Evento', id);
  const data = validate(eventInputSchema, input);
  ctx.dbm.db.update(scenarioEvents).set(data).where(eq(scenarioEvents.id, id)).run();
  return getScenario(ctx, row.scenarioId);
}

export function deleteEvent(ctx: AppContext, id: string): ScenarioDetail {
  const row = ctx.dbm.db.select().from(scenarioEvents).where(eq(scenarioEvents.id, id)).get();
  if (!row) throw notFound('Evento', id);
  ctx.dbm.db.delete(scenarioEvents).where(eq(scenarioEvents.id, id)).run();
  return getScenario(ctx, row.scenarioId);
}
