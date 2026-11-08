import type {
  CharacterSnapshot,
  ConversationKind,
  DialogueMode,
  EpistemicStatus,
  MemoryCategory,
  MemoryOrigin,
  MemoryStatus,
  MessageRole,
  MessageStatus,
} from './index.js';

/**
 * Formato di esportazione documentato di un personaggio PERSONA.
 * Vedi docs/export-format.md. JSON UTF-8, nessun formato proprietario.
 */
export const CHARACTER_EXPORT_FORMAT = 'persona.character' as const;
export const CHARACTER_EXPORT_VERSION = 1 as const;

export interface CharacterExportV1 {
  format: typeof CHARACTER_EXPORT_FORMAT;
  version: typeof CHARACTER_EXPORT_VERSION;
  exportedAt: string;
  app: { name: 'PERSONA'; version: string };
  character: CharacterSnapshot & {
    /** Identificativo originale (sull'import viene generato un nuovo id). */
    id: string;
    identityVersion: number;
    parentId: string | null;
    variantNote: string | null;
    createdAt: string;
    updatedAt: string;
  };
  memories: ExportedMemory[];
  knowledge: ExportedKnowledgeSource[];
  conversations: ExportedConversation[];
  /** Scenari referenziati dalle memorie contestuali e dalle conversazioni esportate. */
  scenarios: ExportedScenarioRef[];
}

export interface ExportedMemory {
  id: string;
  category: MemoryCategory;
  scenarioId: string | null;
  content: string;
  importance: number;
  epistemicStatus: EpistemicStatus;
  language: string | null;
  status: MemoryStatus;
  origin: MemoryOrigin;
  pinned: boolean;
  promotedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  sources: {
    conversationId: string | null;
    messageId: string | null;
    scenarioId: string | null;
    fromSeq: number | null;
    toSeq: number | null;
    note: string | null;
  }[];
}

export interface ExportedKnowledgeSource {
  id: string;
  title: string;
  kind: 'text' | 'markdown' | 'note';
  content: string;
  sourceRef: string | null;
  epistemicStatus: EpistemicStatus;
  language: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface ExportedScenarioRef {
  id: string;
  title: string;
}

export interface ExportedConversation {
  id: string;
  kind: ConversationKind;
  scenarioId: string | null;
  title: string;
  language: string;
  defaultMode: DialogueMode;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    seq: number;
    role: MessageRole;
    /** true se il messaggio è del personaggio esportato. */
    isSelf: boolean;
    speakerName: string | null;
    content: string;
    mode: DialogueMode;
    language: string | null;
    status: MessageStatus;
    model: string | null;
    createdAt: string;
  }[];
  summaries: { fromSeq: number; toSeq: number; content: string; createdAt: string }[];
}
