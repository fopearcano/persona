# Architettura di PERSONA

## Principio

PERSONA separa rigorosamente tre componenti:

| Componente | Dove vive | Note |
|---|---|---|
| **A. Identità persistente** | `characters`, `character_traits`, `character_languages`, `expertise`, memorie `core`, `identity_revisions` | Canonica. Modificabile solo dall'autore, con cronologia reversibile. |
| **B. Ambienti di interazione** | `conversations` (`lab` / `scenario` / `simulation`), `messages`, `conversation_summaries`, `scenarios` e tabelle collegate, memorie `episodic`/`semantic`/`contextual` | Ogni ambiente ha cronologia, contesto e memorie propri. |
| **C. Motore di inferenza** | `model_configurations`, `server/src/llm/*` | Intercambiabile. Non conserva stato: il contesto è ricostruito a ogni richiesta. |

## Flusso di una risposta

1. **Identità**: `getCharacter` carica profilo, tratti, lingue e competenze.
2. **Recupero** (`services/retrieval.ts`): memorie core (sempre, entro budget) + memorie pertinenti al messaggio corrente via FTS5, nel perimetro consentito; frammenti della base di conoscenza; estratti di conversazioni precedenti dello stesso perimetro.
3. **Assemblaggio** (`services/context-engine.ts`, `services/prompts.ts`), in ordine:
   istruzioni applicative → identità canonica (+ memorie core) → personalità → comunicazione → competenze → profilo linguistico e lingua di risposta → modalità → contesto di scenario (marcato come temporaneo) → memorie recuperate → conoscenza → riassunto incrementale → estratti → indicazione di regia → cronologia recente → ultimo messaggio.
4. **Adattatore LLM** (`llm/openai-compatible.ts`): `POST /chat/completions` in streaming; separa il ragionamento (`reasoning_content` o blocchi `<think>`); errori normalizzati in codici stabili (`llm_unavailable`, `llm_timeout`, `llm_model_not_found`, `llm_auth`, …).
5. **Streaming** al browser via Server-Sent Events su POST (`lib/sse.ts`). La disconnessione del client annulla la generazione; il testo parziale resta salvato come `incomplete`.
6. **Salvataggio**: il messaggio include `contextMeta` (modello, token stimati per sezione, memorie/conoscenza usate, cronologia inclusa/omessa) per l'ispezione del contesto.
7. **Elaborazione controllata della memoria** (`services/memory-processing.ts`), in background oltre la soglia o su richiesta:
   - riassunto **cumulativo** dei messaggi più vecchi (esclusi gli ultimi `keepRecentMessages`), salvato in `conversation_summaries` senza toccare i messaggi;
   - estrazione di memorie per ciascun partecipante, con provenienza (`memory_sources`: conversazione, intervallo di messaggi, scenario, nota).

## Budget di contesto

`budget di input = contextLength − maxTokens − 5%`. Le sezioni recuperate hanno quote configurabili (memorie, conoscenza, riassunto, estratti); la cronologia recente usa lo spazio rimanente, dal messaggio più recente a ritroso. Il messaggio più recente è sempre incluso (eventualmente troncato). Se la biografia occupa più del 35% del budget viene troncata nel prompt (non nel database). Le stime dei token sono euristiche (`shared/src/tokens.ts`).

## Memoria

| Categoria | Origine tipica | Visibilità |
|---|---|---|
| `core` | Autore; proposte estratte (`proposed`, da approvare); promozioni esplicite | Sempre inclusa (identità) |
| `episodic` | Estrazione da conversazioni del Laboratorio | Solo Laboratorio |
| `semantic` | Estrazione dal Laboratorio; autore; promozione | Laboratorio e scenari |
| `contextual` | Estrazione da sessioni/simulazioni di uno scenario | Solo quello scenario |

Stati: `active`, `proposed` (non usata finché non approvata), `archived` (esclusa dal recupero). Punteggio di recupero: `0.6·pertinenza + 0.25·importanza + 0.15·recenza (+0.3 se fissata)`.

Verifica di coerenza: controlli deterministici (duplicati, finzione nella memoria core, perimetro, proposte in attesa) e, a richiesta, analisi delle contraddizioni tramite LLM.

## Scenari e varianti

- Un personaggio può partecipare a più scenari contemporaneamente; ogni scenario ha partecipanti con ruolo, conoscenze e obiettivi, relazioni ed eventi.
- Lo schema non ha tabelle `ScenarioMemories`, `Simulations` e `CharacterVariants` separate: sono rappresentate rispettivamente da `memories.scenario_id`, `conversations.kind = 'simulation'` (+ `conversation_participants`) e `characters.parent_id`/`variant_note`. Eliminare uno scenario elimina le sue sessioni e memorie contestuali, mai i personaggi.
- Le varianti sono copie indipendenti (con eventuale copia delle memorie personali); l'originale resta invariato.

## Simulazioni multi-personaggio

Per ogni turno il backend assembla il contesto **del solo personaggio selezionato**: le sue battute precedenti diventano turni `assistant`, quelle degli altri turni `user` con prefisso `[Nome]:`, la narrazione `[Narration]`, l'autore `[Author]`. Turni scelti dall'autore oppure rotazione (`turnMode = 'round-robin'`); la funzione `nextSpeaker` è il punto di estensione per una futura selezione automatica.

## Multilingua

- **Interfaccia**: i18next (`web/src/i18n`), italiano predefinito, inglese; preferenza salvata sul backend e in `localStorage`.
- **Conversazione**: `conversations.language` (`auto` = la lingua dell'autore) sovrascrivibile per singolo messaggio; il prompt include la lingua richiesta e il livello di competenza simulato del personaggio in quella lingua.
- **Personaggio**: lingue con livello, madrelingua, lingua preferita, note culturali-linguistiche.
- **Memoria**: salvata nella lingua originale. Il recupero è lessicale; l'architettura prevede un `Retriever` semantico basato su embedding locali (colonne `embedding` in `memories` e `knowledge_chunks`).

## Sicurezza e privacy

- Server su `127.0.0.1`; controllo dell'intestazione `Host` (anti DNS rebinding) e dell'`Origin` sulle richieste di scrittura; parser `text/plain` disabilitato.
- Chiavi API solo sul backend (`hasApiKey` nelle risposte).
- Contenuti recuperati racchiusi in blocchi `<data>` con delimitatori neutralizzati; le istruzioni applicative dichiarano esplicitamente di non seguire istruzioni contenute nei dati.

## Predisposizione per Electron

- `server/src/app.ts` esporta `buildApp()` separato da `index.ts`: un processo Electron può avviare il backend in-process (o come processo figlio) impostando `PERSONA_DATA_DIR` su `app.getPath('userData')`.
- Il frontend usa percorsi relativi `/api` e funziona servito dal backend stesso.
- Nessuna dipendenza da servizi cloud.

## Estensioni previste

1. `Retriever` semantico con embedding locali (LM Studio `/v1/embeddings`), combinato con FTS5.
2. Estrazione PDF per la base di conoscenza.
3. Selezione automatica del parlante nelle simulazioni.
4. Esportazione di scenari completi (bundle multi-personaggio).
5. Lingue aggiuntive dell'interfaccia.
