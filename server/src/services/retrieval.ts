/**
 * Recupero lessicale (SQLite FTS5) di memorie, conoscenza ed estratti di conversazioni.
 *
 * Limiti dichiarati: il recupero è lessicale, non semantico. Il tokenizer unicode61
 * gestisce bene alfabeti latini, cirillici e greci, con una normalizzazione grezza
 * (prefissi) per le varianti morfologiche; NON abbina concetti tra lingue diverse
 * né segmenta testo CJK. L'interfaccia `Retriever` è pensata per affiancare in futuro
 * embedding multilingue locali.
 */
import type { EpistemicStatus, KnowledgeHit, MemoryCategory } from '@persona/shared';
import type { AppContext } from '../context.js';

const STOPWORDS = new Set(
  [
    // it
    'il lo la i gli le un una uno di da in con su per tra fra che chi cui non come dove quando perché perche anche ancora più piu molto poco questo questa questi queste quello quella sono sei siamo siete hanno abbiamo avete ho hai ha era erano essere avere fare cosa cose del della dei delle dello degli nel nella nei nelle sul sulla sui sulle dal dalla dai dalle al alla ai alle mi ti ci vi si ne se ma ed o oppure poi già gia mio mia tuo tua suo sua nostro vostro loro lei lui noi voi tu io me te sé',
    // en
    'the a an of to in on at for with by from and or but not is are was were be been being have has had do does did this that these those it its you your yours we our they them their he she his her i me my mine what which who whom whose when where why how about into than then there here can could would should will shall may might must just also very really',
    // fr / es / de / pt (essenziali)
    'le la les des du de et ou un une est sont pas que qui dans pour avec sur au aux ce cette ces el los las del y o es son no que en por con para una unos unas der die das und oder ist sind nicht ein eine mit von zu auf für fur dem den des o os as um uma é e não nao com por para mais',
  ]
    .join(' ')
    .split(/\s+/),
);

/** Estrae i termini significativi da un testo, in qualsiasi alfabeto. */
export function extractTerms(text: string, max = 24): string[] {
  const words = text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w) && w.length < 4) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  // Privilegia i termini più lunghi (più informativi), mantenendo un limite.
  return out.sort((a, b) => b.length - a.length).slice(0, max);
}

/**
 * Costruisce una query FTS5 in OR con normalizzazione per prefisso
 * ("pianeti" → "piane"*), utile per lingue flessive.
 */
export function buildFtsQuery(text: string, max = 24): string | null {
  const terms = extractTerms(text, max);
  if (terms.length === 0) return null;
  const parts = terms.map((t) => {
    const chars = [...t];
    const stem = chars.length >= 6 ? chars.slice(0, Math.max(4, chars.length - 2)).join('') : t;
    return `"${stem.replace(/"/g, '')}"*`;
  });
  return [...new Set(parts)].join(' OR ');
}

/** Converte i punteggi bm25 (negativi, più bassi = migliori) in [0,1] relativi al migliore. */
function normalizeRanks<T extends { rank: number }>(rows: T[]): (T & { relevance: number })[] {
  if (rows.length === 0) return [];
  const best = Math.min(...rows.map((r) => r.rank));
  return rows.map((r) => ({ ...r, relevance: best === 0 ? 0.5 : Math.max(0, Math.min(1, r.rank / best)) }));
}

export interface MemoryScope {
  characterId: string;
  /** null = Laboratorio personale; altrimenti lo scenario attivo. */
  scenarioId: string | null;
}

export interface MemoryRow {
  id: string;
  category: MemoryCategory;
  scenarioId: string | null;
  content: string;
  importance: number;
  epistemicStatus: EpistemicStatus;
  language: string | null;
  pinned: number;
  createdAt: string;
}

export interface ScoredMemory extends MemoryRow {
  score: number;
  relevance: number;
}

/**
 * Regole di isolamento della memoria:
 * - Laboratorio: core + episodiche + semantiche (mai contestuali).
 * - Scenario: core + semantiche personali + contestuali DELLO STESSO scenario.
 *   Le memorie episodiche del laboratorio e quelle di altri scenari non sono visibili.
 */
function scopeClause(scope: MemoryScope): { sql: string; params: Record<string, unknown> } {
  if (scope.scenarioId == null) {
    return { sql: `(m.scenario_id IS NULL AND m.category IN ('episodic','semantic'))`, params: {} };
  }
  return {
    sql: `((m.scenario_id IS NULL AND m.category = 'semantic') OR (m.scenario_id = @sid AND m.category = 'contextual'))`,
    params: { sid: scope.scenarioId },
  };
}

const MEMORY_COLS = `m.id, m.category, m.scenario_id AS scenarioId, m.content, m.importance,
  m.epistemic_status AS epistemicStatus, m.language, m.pinned, m.created_at AS createdAt`;

export function coreMemories(ctx: AppContext, characterId: string): MemoryRow[] {
  return ctx.dbm.sqlite
    .prepare(
      `SELECT ${MEMORY_COLS} FROM memories m
        WHERE m.character_id = @cid AND m.category = 'core' AND m.status = 'active'
        ORDER BY m.pinned DESC, m.importance DESC, m.created_at ASC`,
    )
    .all({ cid: characterId }) as MemoryRow[];
}

/** Memorie non-core pertinenti alla query, nel perimetro consentito, ordinate per punteggio. */
export function searchScopedMemories(ctx: AppContext, scope: MemoryScope, queryText: string, limit = 60): ScoredMemory[] {
  const clause = scopeClause(scope);
  const params = { cid: scope.characterId, ...clause.params };
  const q = buildFtsQuery(queryText);
  let matched: (MemoryRow & { rank: number })[] = [];
  if (q) {
    try {
      matched = ctx.dbm.sqlite
        .prepare(
          `SELECT ${MEMORY_COLS}, bm25(memories_fts) AS rank
             FROM memories_fts JOIN memories m ON m.id = memories_fts.memory_id
            WHERE memories_fts MATCH @q AND m.character_id = @cid AND m.status = 'active' AND ${clause.sql}
            ORDER BY rank LIMIT @limit`,
        )
        .all({ ...params, q, limit }) as (MemoryRow & { rank: number })[];
    } catch {
      matched = [];
    }
  }
  // Integra memorie fissate o molto importanti anche senza corrispondenza lessicale.
  const anchors = ctx.dbm.sqlite
    .prepare(
      `SELECT ${MEMORY_COLS}, 0 AS rank FROM memories m
        WHERE m.character_id = @cid AND m.status = 'active' AND ${clause.sql}
          AND (m.pinned = 1 OR m.importance >= 4)
        ORDER BY m.pinned DESC, m.importance DESC, m.created_at DESC LIMIT 20`,
    )
    .all(params) as (MemoryRow & { rank: number })[];

  const now = Date.now();
  const byId = new Map<string, ScoredMemory>();
  for (const r of normalizeRanks(matched)) byId.set(r.id, { ...r, score: 0 });
  for (const a of anchors) if (!byId.has(a.id)) byId.set(a.id, { ...a, relevance: 0, score: 0 });
  for (const m of byId.values()) {
    const ageDays = Math.max(0, (now - Date.parse(m.createdAt)) / 86_400_000);
    const recency = Math.exp(-ageDays / 45);
    m.score = m.relevance * 0.6 + (m.importance / 5) * 0.25 + recency * 0.15 + (m.pinned ? 0.3 : 0);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

export function touchMemories(ctx: AppContext, ids: string[]): void {
  if (ids.length === 0) return;
  const stmt = ctx.dbm.sqlite.prepare(
    `UPDATE memories SET retrieval_count = retrieval_count + 1, last_retrieved_at = @ts WHERE id = @id`,
  );
  const ts = new Date().toISOString();
  ctx.dbm.sqlite.transaction(() => ids.forEach((id) => stmt.run({ id, ts })))();
}

export function searchKnowledge(ctx: AppContext, characterId: string, queryText: string, limit = 6): KnowledgeHit[] {
  const q = buildFtsQuery(queryText);
  if (!q) return [];
  try {
    const rows = ctx.dbm.sqlite
      .prepare(
        `SELECT k.id AS chunkId, k.source_id AS sourceId, s.title, s.epistemic_status AS epistemicStatus,
                s.source_ref AS sourceRef, k.content, bm25(knowledge_fts) AS rank
           FROM knowledge_fts
           JOIN knowledge_chunks k ON k.id = knowledge_fts.chunk_id
           JOIN knowledge_sources s ON s.id = k.source_id
          WHERE knowledge_fts MATCH @q AND k.character_id = @cid AND s.enabled = 1
          ORDER BY rank LIMIT @limit`,
      )
      .all({ q, cid: characterId, limit }) as (Omit<KnowledgeHit, 'score'> & { rank: number })[];
    return normalizeRanks(rows).map(({ rank: _rank, relevance, ...r }) => ({ ...r, score: relevance }));
  } catch {
    return [];
  }
}

export interface ExcerptHit {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  role: string;
  speakerName: string | null;
  content: string;
  createdAt: string;
  score: number;
}

/**
 * Estratti pertinenti da ALTRE conversazioni a cui il personaggio ha partecipato,
 * nello stesso perimetro (laboratorio ↔ laboratorio, scenario ↔ stesso scenario).
 */
export function searchExcerpts(
  ctx: AppContext,
  scope: MemoryScope,
  currentConversationId: string,
  queryText: string,
  limit = 4,
): ExcerptHit[] {
  const q = buildFtsQuery(queryText);
  if (!q || limit <= 0) return [];
  try {
    const rows = ctx.dbm.sqlite
      .prepare(
        `SELECT msg.id AS messageId, msg.conversation_id AS conversationId, c.title AS conversationTitle,
                msg.role, msg.speaker_name AS speakerName, msg.content, msg.created_at AS createdAt,
                bm25(messages_fts) AS rank
           FROM messages_fts
           JOIN messages msg ON msg.id = messages_fts.message_id
           JOIN conversations c ON c.id = msg.conversation_id
          WHERE messages_fts MATCH @q
            AND msg.conversation_id != @conv
            AND msg.status = 'complete'
            AND msg.role IN ('author','character','narrator')
            AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND p.character_id = @cid)
            AND ${scope.scenarioId == null ? `c.kind = 'lab'` : `c.scenario_id = @sid`}
          ORDER BY rank LIMIT @limit`,
      )
      .all({ q, conv: currentConversationId, cid: scope.characterId, sid: scope.scenarioId, limit }) as (Omit<ExcerptHit, 'score'> & {
      rank: number;
    })[];
    return normalizeRanks(rows).map(({ rank: _rank, relevance, ...r }) => ({ ...r, score: relevance }));
  } catch {
    return [];
  }
}
