# PERSONA — istruzioni per Claude Code

PERSONA è un laboratorio **local-first** per creare, mantenere, interrogare e simulare identità artificiali persistenti. Un personaggio esiste indipendentemente da qualsiasi narrazione: l'app fornisce identità, continuità, memoria e portabilità; l'LLM è solo un motore di inferenza intercambiabile.

Lingua: documentazione e testi per l'utente in **italiano** (UI predefinita italiana, inglese disponibile). Identificatori di codice in inglese.

## Architettura

```
shared/   tipi, costanti, schemi zod, formati di export, stima token
          (il web importa `@persona/shared/client`, che esclude gli schemi zod; il server `@persona/shared`)
server/   Node 22 + Fastify 5 + SQLite (better-sqlite3) + Drizzle ORM
  src/db/          schema.ts (Drizzle), client.ts (apertura, migrazioni, swap per restore)
  drizzle/         migrazioni SQL (0001_fts.sql = FTS5 + trigger, scritta a mano)
  src/llm/         adattatore provider-indipendente: openai-compatible.ts (LM Studio/OpenAI/…: chat in
                   streaming + /embeddings), mock.ts (test/demo, embedding deterministici), think-filter.ts, registry.ts
  src/services/    logica di dominio; src/routes/index.ts = API REST + SSE
                   embeddings.ts (recupero semantico + indicizzazione), turns.ts (gestione turni),
                   pdf.ts, scenario-portability.ts (bundle persona.scenario), portability.ts (personaggi, backup)
  src/embedded.ts  startPersonaServer(): avvio in-process su porta libera (usato da index.ts; base per Electron)
  test/            vitest + app.inject, sempre con provider mock (nessun LM Studio richiesto)
web/      React 19 + Vite 7 + Tailwind 4 + TanStack Query + Zustand + i18next
  src/pages/       Characters, CharacterEditor, Dialogue, Scenarios(+Editor), Simulations, Memory, Settings
  src/components/chat/  ChatWorkspace (streaming SSE), MessageItem, Inspector
  src/i18n/locales/     it.json, en.json (stesse chiavi; test di parità)
docs/     architecture.md, export-format.md
```

Flusso di generazione (server/src/services/generation.ts):
identità → recupero memorie (retrieval.ts) → assemblaggio contesto (context-engine.ts + prompts.ts) → adattatore LLM → streaming SSE → salvataggio messaggio (+ contextMeta) → elaborazione memoria in background (memory-processing.ts).

## Regole di isolamento (non violarle)

- **Identità canonica** = riga `characters` + traits/languages/expertise + memorie `core` attive. Si modifica solo con azioni esplicite dell'autore (`PUT /api/characters/:id`); ogni modifica salva un'istantanea in `identity_revisions` e incrementa `identityVersion`. Cambiare modello NON è una modifica d'identità.
- L'elaborazione automatica **non crea mai memorie core attive**: le proposte core nascono `status='proposed'` e richiedono `POST /api/memories/:id/approve`.
- Tutto ciò che viene estratto da conversazioni di scenario/simulazione diventa `category='contextual'` con `scenarioId` (mai core/semantic). La promozione all'identità personale è solo esplicita (`POST /api/memories/:id/promote`, crea una NUOVA memoria, l'originale resta).
- Perimetri di recupero (retrieval.ts `scopeClause`): Laboratorio = core + episodic + semantic (mai contextual). Scenario = core + semantic personali + contextual dello **stesso** scenario. Gli estratti di conversazioni precedenti seguono lo stesso perimetro.
- Simulazioni multi-personaggio: il contesto si assembla **per ogni turno** per il solo personaggio che parla; le sue battute sono `assistant`, quelle altrui `user` con prefisso `[Nome]:`. L'estrazione di memorie avviene per ciascun partecipante.
- I riassunti (`conversation_summaries`) sono cumulativi e **non sostituiscono né cancellano** i messaggi. Rigenerare marca la vecchia risposta `superseded`; modificare un messaggio salva la versione precedente in `message_revisions`. Generazioni interrotte restano salvate come `incomplete`.
- L'analisi esterna (`mode='analysis'`, `role='analysis'`) non è parlato del personaggio ed è esclusa dalla cronologia in-personaggio.
- Tutto il materiale recuperato va nei blocchi `<data>` (prompts.ts `dataBlock`/`escapeData`) ed è trattato come dato non attendibile.
- Le chiavi API restano sul backend: `toModelConfigDto` espone solo `hasApiKey`.

## Requisiti multilingua

- Nessuna stringa visibile hardcoded nei componenti React: usare `t('…')` e aggiungere la chiave **sia** in `it.json` sia in `en.json` (il test `web/src/i18n/i18n.test.ts` verifica parità di chiavi e placeholder). Le chiavi di errore sono `errors.<ErrorCode>`.
- Date/numeri/nomi di lingua con `Intl` tramite `web/src/lib/format.ts`.
- Tre dimensioni indipendenti: lingua UI (preferenza `uiLanguage`), lingua di conversazione (`conversations.language`, `'auto'` o codice BCP-47, sovrascrivibile per messaggio), profilo linguistico del personaggio (`character_languages`). Le memorie restano nella lingua originale.
- Recupero: FTS5 lessicale sempre; semantico (embedding multilingue locali) solo se attivato in `preferences.embeddings`, con fallback automatico al lessicale. Non dichiarare capacità semantiche quando gli embedding sono disattivati.

## Comandi

```bash
npm install            # dalla root (workspaces)
npm run dev            # backend :4317 (tsx watch) + Vite :5173 con proxy /api
npm run build          # build del frontend (web/dist)
npm start              # produzione: backend serve API + web/dist su http://127.0.0.1:4317
npm run typecheck      # tsc su shared, server, web
npm test               # vitest server + web
npm run check          # typecheck + test + build
npm run db:generate    # (server) genera migrazione Drizzle dopo modifiche a schema.ts
npm run db:migrate     # applica le migrazioni (avvengono anche automaticamente all'avvio)
node scripts/e2e-smoke.cjs <cartella-screenshot>   # facoltativo, richiede playwright + server su :4399
```

Variabili: `PERSONA_DATA_DIR` (default `./data`), `PERSONA_PORT` (4317), `PERSONA_HOST` (127.0.0.1), `PERSONA_LMSTUDIO_URL`, `OPENAI_API_KEY`, `PERSONA_ALLOWED_HOSTS`. Vedi `.env.example`.

## Convenzioni

- TypeScript strict ovunque; ESM; validazione input con gli schemi zod di `shared/src/schemas.ts` (helper `validate`, errori `AppError` con `ErrorCode`).
- I servizi ricevono `ctx: AppContext` e leggono `ctx.dbm.db` a ogni uso (il DB può essere sostituito a caldo dal restore). Timestamp ISO-8601, id UUID.
- `assembleContext` è asincrono (embedding della query). Le scritture di memorie/frammenti chiamano `scheduleIndexing(ctx)`; i lavori in background passano da `trackBackground` (i test li attendono con `settleBackground`).
- Il provider mock riconosce `params.purpose` (`character`, `analysis`, `summarize`, `extract`, `title`, `turn`, `consistency`, `test`) per risposte deterministiche; i suoi embedding usano un piccolo dizionario multilingue di concetti (solo per i test).
- Migrazioni: modificare `schema.ts` → `npm run db:generate`; SQL personalizzato (FTS, trigger) con `npx drizzle-kit generate --custom`. Non modificare migrazioni già rilasciate.
- Ogni nuova funzionalità backend ha un test in `server/test/` usando `createTestEnv()` (provider mock predefinito). Non dichiarare funzionalità complete senza test eseguiti.
- UI sobria: token colore in `web/src/index.css` (`bg-panel`, `text-muted`, `border-border`, `text-accent`, …), niente animazioni superflue.

## Stato attuale (v0.2.0)

Implementato e testato: fasi 1–6 — fondazioni, personaggi, memoria, scenari, simulazioni (turni manuali, rotazione, regia automatica), recupero semantico ibrido con embedding locali, PDF nella base di conoscenza, export/import di personaggi e scenari, backup/restore, avvio in-process (`startPersonaServer`). 65 test server + 10 test web; smoke E2E Playwright (16 passaggi) con provider mock.

Non verificato in questo ambiente: LM Studio reale (chat ed embedding sono testati contro un server finto compatibile). Non implementati: involucro Electron vero e proprio, traduzioni UI oltre it/en, OCR. Dettagli: `README.md` § Limiti noti e `docs/architecture.md`.
