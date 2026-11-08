/**
 * Portabilità dei dati: esportazione/importazione JSON documentata dei personaggi
 * (docs/export-format.md) e backup/ripristino del database SQLite.
 */
import type { BackupInfo, Character, CharacterExportV1, ExportedConversation, ExportedMemory } from '@persona/shared';
import {
  CHARACTER_EXPORT_FORMAT,
  CHARACTER_EXPORT_VERSION,
  characterProfileSchema,
  EPISTEMIC_STATUSES,
  expertiseInputSchema,
  languageInputSchema,
  MEMORY_CATEGORIES,
  MEMORY_ORIGINS,
  MEMORY_STATUSES,
  traitInputSchema,
} from '@persona/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import {
  conversationParticipants,
  conversationSummaries,
  conversations,
  knowledgeSources,
  memories,
  memorySources,
  messages,
  scenarios,
} from '../db/schema.js';
import { AppError, newId, nowIso, validate } from '../lib/util.js';
import { createCharacter, getCharacter, snapshotOf } from './characters.js';
import { createKnowledgeSource } from './knowledge.js';
import { scheduleIndexing } from './embeddings.js';
import { listMemories } from './memory.js';

export interface ExportOptions {
  conversations: boolean;
  contextual: boolean;
  knowledge: boolean;
}

export function exportCharacter(ctx: AppContext, id: string, opts: ExportOptions): CharacterExportV1 {
  const c = getCharacter(ctx, id);
  const mems = listMemories(ctx, { characterId: id, limit: 1000 }).filter((m) => opts.contextual || m.category !== 'contextual');
  const exportedMemories: ExportedMemory[] = mems.map((m) => ({
    id: m.id,
    category: m.category,
    scenarioId: m.scenarioId,
    content: m.content,
    importance: m.importance,
    epistemicStatus: m.epistemicStatus,
    language: m.language,
    status: m.status,
    origin: m.origin,
    pinned: m.pinned,
    promotedFromId: m.promotedFromId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    sources: m.sources.map((s) => ({
      conversationId: s.conversationId,
      messageId: s.messageId,
      scenarioId: s.scenarioId,
      fromSeq: s.fromSeq,
      toSeq: s.toSeq,
      note: s.note,
    })),
  }));

  const knowledge = opts.knowledge
    ? ctx.dbm.db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.characterId, id))
        .orderBy(asc(knowledgeSources.createdAt))
        .all()
        .map((k) => ({
          id: k.id,
          title: k.title,
          kind: k.kind as 'text' | 'markdown' | 'note',
          content: k.content,
          sourceRef: k.sourceRef,
          epistemicStatus: k.epistemicStatus as (typeof EPISTEMIC_STATUSES)[number],
          language: k.language,
          enabled: k.enabled,
          createdAt: k.createdAt,
        }))
    : [];

  const convs: ExportedConversation[] = [];
  if (opts.conversations) {
    const convIds = ctx.dbm.db
      .select({ id: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.characterId, id))
      .all()
      .map((r) => r.id);
    const rows = convIds.length
      ? ctx.dbm.db.select().from(conversations).where(inArray(conversations.id, convIds)).orderBy(asc(conversations.createdAt)).all()
      : [];
    for (const conv of rows) {
      if (!opts.contextual && conv.kind !== 'lab') continue;
      const msgs = ctx.dbm.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(asc(messages.seq), asc(messages.createdAt))
        .all();
      const sums = ctx.dbm.db.select().from(conversationSummaries).where(eq(conversationSummaries.conversationId, conv.id)).all();
      convs.push({
        id: conv.id,
        kind: conv.kind as ExportedConversation['kind'],
        scenarioId: conv.scenarioId,
        title: conv.title,
        language: conv.language,
        defaultMode: conv.defaultMode as ExportedConversation['defaultMode'],
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: msgs.map((m) => ({
          id: m.id,
          seq: m.seq,
          role: m.role as ExportedConversation['messages'][number]['role'],
          isSelf: m.characterId === id,
          speakerName: m.speakerName,
          content: m.content,
          mode: m.mode as ExportedConversation['messages'][number]['mode'],
          language: m.language,
          status: m.status as ExportedConversation['messages'][number]['status'],
          model: m.model,
          createdAt: m.createdAt,
        })),
        summaries: sums.map((s) => ({ fromSeq: s.fromSeq, toSeq: s.toSeq, content: s.content, createdAt: s.createdAt })),
      });
    }
  }

  const scenarioIds = new Set<string>([
    ...exportedMemories.map((m) => m.scenarioId).filter((x): x is string => !!x),
    ...convs.map((c) => c.scenarioId).filter((x): x is string => !!x),
  ]);
  const scenarioRefs = scenarioIds.size
    ? ctx.dbm.db
        .select({ id: scenarios.id, title: scenarios.title })
        .from(scenarios)
        .where(inArray(scenarios.id, [...scenarioIds]))
        .all()
    : [];

  return {
    format: CHARACTER_EXPORT_FORMAT,
    version: CHARACTER_EXPORT_VERSION,
    exportedAt: nowIso(),
    app: { name: 'PERSONA', version: ctx.config.version },
    character: {
      ...snapshotOf(c),
      id: c.id,
      identityVersion: c.identityVersion,
      parentId: c.parentId,
      variantNote: c.variantNote,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    },
    memories: exportedMemories,
    knowledge,
    conversations: convs,
    scenarios: scenarioRefs,
  };
}

/* ------------------------------------------------------------------ */
/* Importazione                                                        */
/* ------------------------------------------------------------------ */

const importSchema = z.object({
  format: z.literal(CHARACTER_EXPORT_FORMAT),
  version: z.literal(CHARACTER_EXPORT_VERSION),
  character: characterProfileSchema.extend({
    id: z.string().optional(),
    variantNote: z.string().nullish(),
    traits: z.array(traitInputSchema).default([]),
    languages: z.array(languageInputSchema).default([]),
    expertise: z.array(expertiseInputSchema).default([]),
  }),
  memories: z
    .array(
      z.object({
        id: z.string(),
        category: z.enum(MEMORY_CATEGORIES),
        scenarioId: z.string().nullish(),
        content: z.string().min(1),
        importance: z.number().int().min(1).max(5).default(3),
        epistemicStatus: z.enum(EPISTEMIC_STATUSES).default('fact'),
        language: z.string().nullish(),
        status: z.enum(MEMORY_STATUSES).default('active'),
        origin: z.enum(MEMORY_ORIGINS).default('import'),
        pinned: z.boolean().default(false),
        createdAt: z.string().optional(),
        sources: z
          .array(
            z.object({
              conversationId: z.string().nullish(),
              messageId: z.string().nullish(),
              scenarioId: z.string().nullish(),
              fromSeq: z.number().int().nullish(),
              toSeq: z.number().int().nullish(),
              note: z.string().nullish(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  knowledge: z
    .array(
      z.object({
        title: z.string().min(1),
        kind: z.enum(['text', 'markdown', 'note']).default('text'),
        content: z.string().min(1),
        sourceRef: z.string().nullish(),
        epistemicStatus: z.enum(EPISTEMIC_STATUSES).default('fact'),
        language: z.string().nullish(),
        enabled: z.boolean().default(true),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  conversations: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['lab', 'scenario', 'simulation']),
        title: z.string().min(1),
        language: z.string().default('auto'),
        defaultMode: z.enum(['dialogue', 'interview', 'analysis']).default('dialogue'),
        createdAt: z.string(),
        updatedAt: z.string().optional(),
        messages: z.array(
          z.object({
            id: z.string(),
            seq: z.number().int(),
            role: z.enum(['author', 'character', 'analysis', 'narrator']),
            isSelf: z.boolean().default(false),
            speakerName: z.string().nullish(),
            content: z.string(),
            mode: z.enum(['dialogue', 'interview', 'analysis']).default('dialogue'),
            language: z.string().nullish(),
            status: z.enum(['complete', 'incomplete', 'error', 'superseded']).default('complete'),
            model: z.string().nullish(),
            createdAt: z.string(),
          }),
        ),
        summaries: z
          .array(z.object({ fromSeq: z.number().int(), toSeq: z.number().int(), content: z.string(), createdAt: z.string() }))
          .default([]),
      }),
    )
    .default([]),
});

export interface ImportOptions {
  includeConversations: boolean;
  includeMemories: boolean;
  includeKnowledge: boolean;
}

export interface ImportResult {
  character: Character;
  imported: { memories: number; knowledge: number; conversations: number; messages: number };
  skipped: { contextualMemories: number; scenarioConversations: number };
}

/**
 * Importa un personaggio come NUOVA identità (nuovi identificativi): non sovrascrive
 * mai dati esistenti. Le memorie contestuali e le sessioni di scenario vengono
 * importate solo se lo scenario di riferimento esiste in questo database.
 */
export function importCharacter(ctx: AppContext, payload: unknown, opts: ImportOptions): ImportResult {
  let data: z.output<typeof importSchema>;
  try {
    data = importSchema.parse(payload);
  } catch (err) {
    throw new AppError('invalid_import', `File di esportazione non valido: ${(err as Error).message.slice(0, 500)}`, 400);
  }
  const { id: _id, variantNote, traits, languages, expertise, ...profile } = data.character;
  const created = createCharacter(
    ctx,
    { ...profile, traits, languages, expertise, revisionReason: null },
    { parentId: null, variantNote: variantNote ?? null },
  );
  const result: ImportResult = {
    character: created,
    imported: { memories: 0, knowledge: 0, conversations: 0, messages: 0 },
    skipped: { contextualMemories: 0, scenarioConversations: 0 },
  };
  const localScenarios = new Set(ctx.dbm.db.select({ id: scenarios.id }).from(scenarios).all().map((s) => s.id));
  const convMap = new Map<string, string>();
  const msgMap = new Map<string, string>();

  ctx.dbm.db.transaction((tx) => {
    if (opts.includeConversations) {
      for (const conv of data.conversations) {
        if (conv.kind !== 'lab') {
          result.skipped.scenarioConversations++;
          continue;
        }
        const cid = newId();
        convMap.set(conv.id, cid);
        const maxSeq = conv.messages.reduce((n, m) => Math.max(n, m.seq), 0);
        tx.insert(conversations)
          .values({
            id: cid,
            kind: 'lab',
            characterId: created.id,
            scenarioId: null,
            title: conv.title,
            language: conv.language,
            defaultMode: conv.defaultMode,
            turnMode: 'manual',
            archived: false,
            summarizedSeq: conv.summaries.reduce((n, s) => Math.max(n, s.toSeq), 0),
            memoryProcessedSeq: opts.includeMemories ? maxSeq : 0,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt ?? conv.createdAt,
          })
          .run();
        tx.insert(conversationParticipants).values({ id: newId(), conversationId: cid, characterId: created.id, sortOrder: 0 }).run();
        for (const m of conv.messages) {
          const mid = newId();
          msgMap.set(m.id, mid);
          tx.insert(messages)
            .values({
              id: mid,
              conversationId: cid,
              seq: m.seq,
              role: m.role,
              characterId: m.isSelf ? created.id : null,
              speakerName: m.isSelf ? created.name : (m.speakerName ?? null),
              content: m.content,
              mode: m.mode,
              language: m.language ?? null,
              status: m.status,
              model: m.model ?? null,
              createdAt: m.createdAt,
            })
            .run();
          result.imported.messages++;
        }
        for (const s of conv.summaries) {
          tx.insert(conversationSummaries)
            .values({ id: newId(), conversationId: cid, fromSeq: s.fromSeq, toSeq: s.toSeq, content: s.content, createdAt: s.createdAt })
            .run();
        }
        result.imported.conversations++;
      }
    }

    if (opts.includeMemories) {
      const ts = nowIso();
      for (const m of data.memories) {
        const scenarioId = m.category === 'contextual' ? (m.scenarioId ?? null) : null;
        if (m.category === 'contextual' && (!scenarioId || !localScenarios.has(scenarioId))) {
          result.skipped.contextualMemories++;
          continue;
        }
        const mid = newId();
        tx.insert(memories)
          .values({
            id: mid,
            characterId: created.id,
            category: m.category,
            scenarioId,
            content: m.content,
            importance: m.importance,
            epistemicStatus: m.epistemicStatus,
            language: m.language ?? null,
            status: m.status,
            origin: m.origin,
            pinned: m.pinned,
            promotedFromId: null,
            retrievalCount: 0,
            createdAt: m.createdAt ?? ts,
            updatedAt: ts,
          })
          .run();
        const sources = m.sources.length ? m.sources : [{}];
        for (const s of sources as z.output<typeof importSchema>['memories'][number]['sources']) {
          tx.insert(memorySources)
            .values({
              id: newId(),
              memoryId: mid,
              conversationId: s.conversationId ? (convMap.get(s.conversationId) ?? null) : null,
              messageId: s.messageId ? (msgMap.get(s.messageId) ?? null) : null,
              scenarioId: s.scenarioId && localScenarios.has(s.scenarioId) ? s.scenarioId : null,
              fromSeq: s.fromSeq ?? null,
              toSeq: s.toSeq ?? null,
              note: [s.note, `Importata (memoria originale ${m.id})`].filter(Boolean).join(' — '),
              createdAt: ts,
            })
            .run();
        }
        result.imported.memories++;
      }
    }
  });

  if (opts.includeKnowledge) {
    for (const k of data.knowledge) {
      createKnowledgeSource(ctx, created.id, {
        title: k.title,
        kind: k.kind,
        content: k.content,
        sourceRef: k.sourceRef ?? null,
        epistemicStatus: k.epistemicStatus,
        language: k.language ?? null,
        enabled: k.enabled,
      });
      result.imported.knowledge++;
    }
  }
  scheduleIndexing(ctx);
  result.character = getCharacter(ctx, created.id);
  return result;
}

/* ------------------------------------------------------------------ */
/* Backup e ripristino                                                 */
/* ------------------------------------------------------------------ */

const BACKUP_NAME = /^persona-[A-Za-z0-9_-]+\.db$/;

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

/** Nome di file univoco nella cartella dei backup (risoluzione al secondo + contatore). */
function uniqueBackupName(ctx: AppContext, prefix: string): string {
  mkdirSync(ctx.config.backupsDir, { recursive: true });
  const existing = new Set(readdirSafe(ctx.config.backupsDir));
  const base = `${prefix}-${stamp()}`;
  let fileName = `${base}.db`;
  for (let n = 1; existing.has(fileName); n++) fileName = `${base}-${n}.db`;
  return fileName;
}

export async function createBackup(ctx: AppContext, prefix = 'persona'): Promise<BackupInfo> {
  const fileName = uniqueBackupName(ctx, prefix);
  const full = join(ctx.config.backupsDir, fileName);
  await ctx.dbm.backupTo(full);
  const st = statSync(full);
  return { fileName, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function listBackups(ctx: AppContext): BackupInfo[] {
  return readdirSafe(ctx.config.backupsDir)
    .filter((f) => BACKUP_NAME.test(f))
    .map((f) => {
      const st = statSync(join(ctx.config.backupsDir, f));
      return { fileName: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function backupPath(ctx: AppContext, fileName: string): string {
  if (!BACKUP_NAME.test(fileName)) throw new AppError('validation', 'Nome di backup non valido');
  const full = join(ctx.config.backupsDir, fileName);
  if (!readdirSafe(ctx.config.backupsDir).includes(fileName)) throw new AppError('not_found', 'Backup non trovato', 404);
  return full;
}

export function deleteBackup(ctx: AppContext, fileName: string): void {
  rmSync(backupPath(ctx, fileName));
}

/** Ripristina da un file caricato: crea prima una copia di sicurezza del database attuale. */
export async function restoreFromBuffer(ctx: AppContext, buffer: Buffer): Promise<{ safetyBackup: string }> {
  if (buffer.length < 512 || buffer.subarray(0, 15).toString('latin1') !== 'SQLite format 3') {
    throw new AppError('invalid_backup', 'Il file non è un database SQLite', 400);
  }
  mkdirSync(ctx.config.backupsDir, { recursive: true });
  const tmp = join(ctx.config.dataDir, `restore-${Date.now()}.db.tmp`);
  writeFileSync(tmp, buffer);
  try {
    return await restoreFromFile(ctx, tmp);
  } finally {
    rmSync(tmp, { force: true });
  }
}

export async function restoreFromStored(ctx: AppContext, fileName: string): Promise<{ safetyBackup: string }> {
  return restoreFromFile(ctx, backupPath(ctx, fileName));
}

async function restoreFromFile(ctx: AppContext, file: string): Promise<{ safetyBackup: string }> {
  const safetyName = uniqueBackupName(ctx, 'persona-pre-restore');
  try {
    await ctx.dbm.restoreFrom(file, join(ctx.config.backupsDir, safetyName));
  } catch (err) {
    throw new AppError('invalid_backup', `Ripristino non riuscito: ${(err as Error).message}`, 400);
  }
  return { safetyBackup: safetyName };
}
