/**
 * Costanti di dominio condivise tra backend e frontend.
 * I valori sono identificatori stabili (in inglese): le etichette visibili
 * all'utente sono tradotte nel frontend tramite i18next.
 */

export const MEMORY_CATEGORIES = ['core', 'episodic', 'semantic', 'contextual'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** active = utilizzabile; proposed = in attesa di approvazione dell'autore; archived = esclusa dal recupero. */
export const MEMORY_STATUSES = ['active', 'proposed', 'archived'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_ORIGINS = [
  'author',
  'conversation',
  'summary',
  'extraction',
  'promotion',
  'import',
] as const;
export type MemoryOrigin = (typeof MEMORY_ORIGINS)[number];

/** Statuto epistemico di un'informazione (memoria o fonte di conoscenza). */
export const EPISTEMIC_STATUSES = ['fact', 'interpretation', 'opinion', 'fiction', 'unverified'] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

export const TRAIT_CATEGORIES = [
  'personality',
  'motivation',
  'value',
  'desire',
  'fear',
  'bias',
  'contradiction',
  'expression',
] as const;
export type TraitCategory = (typeof TRAIT_CATEGORIES)[number];

export const PROFICIENCY_LEVELS = ['native', 'fluent', 'advanced', 'intermediate', 'basic'] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

export const EXPERTISE_LEVELS = ['foundational', 'competent', 'expert', 'leading'] as const;
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];

export const CHARACTER_STATUSES = ['active', 'archived'] as const;
export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];

/** lab = Laboratorio personale; scenario = sessione narrativa; simulation = scena multi-personaggio. */
export const CONVERSATION_KINDS = ['lab', 'scenario', 'simulation'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const DIALOGUE_MODES = ['dialogue', 'interview', 'analysis'] as const;
export type DialogueMode = (typeof DIALOGUE_MODES)[number];

/**
 * author = messaggio dell'autore; character = battuta generata di un personaggio;
 * analysis = analisi esterna (NON è parlato del personaggio); narrator = narrazione/eventi.
 */
export const MESSAGE_ROLES = ['author', 'character', 'analysis', 'narrator'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ['complete', 'incomplete', 'error', 'superseded'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const PROVIDER_TYPES = ['lmstudio', 'openai', 'openai-compatible', 'mock'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const TURN_MODES = ['manual', 'round-robin'] as const;
export type TurnMode = (typeof TURN_MODES)[number];

export const SCENARIO_STATUSES = ['active', 'archived'] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

/** Lingue dell'interfaccia effettivamente tradotte. */
export const UI_LANGUAGES = ['it', 'en'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
/** Lingue dell'interfaccia previste ma non ancora tradotte. */
export const PLANNED_UI_LANGUAGES = ['fr', 'es', 'de', 'pt'] as const;

export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** Valore speciale: il personaggio risponde nella lingua usata dall'autore. */
export const AUTO_LANGUAGE = 'auto';

/**
 * Codici BCP-47 proposti nei selettori di lingua. L'elenco non è limitante:
 * qualunque codice valido può essere inserito, entro i limiti del modello scelto.
 */
export const COMMON_LANGUAGE_CODES = [
  'it',
  'en',
  'fr',
  'es',
  'de',
  'pt',
  'ru',
  'uk',
  'pl',
  'nl',
  'sv',
  'el',
  'tr',
  'ar',
  'he',
  'hi',
  'zh',
  'ja',
  'ko',
  'la',
] as const;

export const ERROR_CODES = [
  'validation',
  'not_found',
  'conflict',
  'no_model_config',
  'llm_unavailable',
  'llm_timeout',
  'llm_model_not_found',
  'llm_auth',
  'llm_bad_response',
  'llm_error',
  'aborted',
  'busy',
  'invalid_import',
  'invalid_backup',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
