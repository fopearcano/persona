# PERSONA

**Laboratorio local-first di identità artificiali persistenti.**

PERSONA permette di creare, mantenere, interrogare e simulare personaggi che esistono indipendentemente da qualsiasi storia. Un'astrofisica creata oggi può discutere di cosmologia con l'autore per settimane, poi salire a bordo di una nave interstellare in uno scenario narrativo, e infine partecipare a un universo del tutto diverso, mantenendo la stessa identità di fondo.

- **L'applicazione** conserva identità, continuità, memoria e portabilità.
- **L'LLM** (LM Studio in locale, oppure OpenAI o altri provider compatibili) fornisce solo l'intelligenza conversazionale: è intercambiabile e non contiene il personaggio.

Nessun account, nessun abbonamento, nessuna telemetria. Tutti i dati restano in un file SQLite sul tuo computer.

---

## Requisiti

- **Node.js 22** o superiore (con npm).
- Per conversare con un modello locale: **[LM Studio](https://lmstudio.ai)** con almeno un modello scaricato. In alternativa un provider compatibile OpenAI.
- Senza LLM si può esplorare l'interfaccia con il motore **Mock** (risposte segnaposto, solo per prove).

`better-sqlite3` usa binari precompilati; se non sono disponibili per la tua piattaforma, npm li compila e servono Python 3 e un compilatore C/C++.

## Installazione

```bash
git clone <repository> persona
cd persona
npm install
```

## Avvio

### Sviluppo (ricaricamento automatico)

```bash
npm run dev
```

- Backend: `http://127.0.0.1:4317` (API)
- Interfaccia: **`http://127.0.0.1:5173`** (Vite, inoltra `/api` al backend)

### Uso quotidiano (build di produzione)

```bash
npm run build
npm start
```

Apri **`http://127.0.0.1:4317`**: il backend serve sia le API sia l'interfaccia.

Il database viene creato in `./data/persona.db` e le migrazioni vengono applicate automaticamente all'avvio. Per cambiare cartella o porta: variabili `PERSONA_DATA_DIR`, `PERSONA_PORT` (vedi `.env.example`; un file `.env` nella root o in `server/` viene letto automaticamente).

## Configurare LM Studio

1. In LM Studio scarica un modello di chat (per conversazioni ricche in italiano è consigliabile un modello da 7–14B o superiore).
2. Apri la scheda **Developer** e avvia il server locale (**Start Server**). L'endpoint predefinito è `http://localhost:1234/v1`.
3. Carica il modello (anche il caricamento "just-in-time" funziona: la prima risposta sarà più lenta).
4. In PERSONA vai su **Impostazioni → Motori LLM**:
   - la configurazione **LM Studio (locale)** è già presente ed è quella predefinita;
   - premi **Rileva modelli** per elencare i modelli e il loro stato (caricato/non caricato);
   - lascia il modello su *Automatico* per usare il primo modello caricato, oppure sceglilo;
   - imposta **Lunghezza del contesto** uguale al contesto con cui il modello è caricato in LM Studio;
   - premi **Prova connessione**.

Ogni personaggio può usare un motore diverso (editor del personaggio → scheda **Motore**). Cambiare motore non modifica identità, memorie o conversazioni.

**OpenAI o altri provider**: aggiungi una configurazione di tipo *OpenAI* o *Compatibile OpenAI* (endpoint e chiave). La chiave resta sul backend locale e non viene mai inviata all'interfaccia; in alternativa usa la variabile d'ambiente `OPENAI_API_KEY`.

## Percorso tipico

1. **Personaggi → Nuovo personaggio**: identità, biografia, psicologia (Big Five facoltativi), comunicazione, competenze, lingue (madrelingua, livelli), base di conoscenza.
2. **Dialogo**: scegli il personaggio, crea una conversazione e parla in modalità *Dialogo*, *Intervista* o *Analisi esterna* (l'analisi non è mai presentata come parlato del personaggio). Puoi cambiare lingua di risposta in qualsiasi momento.
3. **Elabora memoria** (o automaticamente oltre la soglia): riassunti incrementali ed estrazione di memorie con provenienza. Le nuove conversazioni ereditano le memorie pertinenti, non l'intera cronologia.
4. **Memoria**: ispeziona, modifica, fissa, archivia, approva e promuovi le memorie; verifica di coerenza; anteprima del recupero.
5. **Scenari**: crea un universo (ambientazione, cronologia, condizioni, eventi, conoscenze), aggiungi partecipanti con ruoli e relazioni, apri sessioni narrative. Le memorie della storia restano nello scenario.
6. **Simulazioni**: scene condivise tra più personaggi; l'autore sceglie chi parla (o usa la rotazione) e può aggiungere narrazione o indicazioni di regia per il turno.
7. **Personaggi → Esporta/Importa** per portare un'identità altrove; **Impostazioni → Backup** per salvare e ripristinare l'intero database.

## Test e verifiche

```bash
npm run typecheck   # TypeScript su shared, server e web
npm test            # test automatici (vitest) di server e web
npm run build       # build di produzione del frontend
npm run check       # tutti i precedenti
```

I test usano il provider **mock**: non serve LM Studio. L'adattatore OpenAI-compatibile è verificato contro un server HTTP finto che imita le API di LM Studio (streaming SSE, `/v1/models`, `/api/v0/models`, errori).

Smoke test end-to-end facoltativo nel browser (richiede Playwright con Chromium):

```bash
npm run build
PERSONA_DATA_DIR=/tmp/persona-e2e PERSONA_PORT=4399 npm start
node scripts/e2e-smoke.cjs /tmp/persona-shots   # in un altro terminale
```

## Dati e portabilità

- Database: `data/persona.db` (SQLite, UTF-8). Backup in `data/backups/`.
- **Backup**: Impostazioni → Backup (copia consistente tramite l'API di backup di SQLite). Il ripristino salva prima una copia di sicurezza del database corrente. Nota: il backup contiene anche le eventuali chiavi API salvate nelle configurazioni dei motori.
- **Esportazione personaggi**: JSON documentato in [`docs/export-format.md`](docs/export-format.md). L'importazione crea sempre una **nuova** identità senza sovrascrivere dati esistenti.

## Architettura in breve

```
Identità del personaggio → Recupero memorie → Assemblaggio contesto → Adattatore LLM
→ Risposta in streaming → Salvataggio conversazione → Elaborazione controllata della memoria
```

Monorepo npm: `shared/` (tipi e schemi), `server/` (Fastify, SQLite, Drizzle, servizi), `web/` (React). Dettagli in [`docs/architecture.md`](docs/architecture.md). Il backend è separato dall'avvio del server (`buildApp`) ed è servito su `localhost`: un futuro involucro Electron potrà avviarlo in-process e caricare la stessa interfaccia senza riscritture.

## Sicurezza

- Il server ascolta solo su `127.0.0.1` per impostazione predefinita.
- Le richieste con intestazione `Host` diversa da localhost vengono rifiutate (protezione da DNS rebinding); le scritture da altre origini del browser sono bloccate. Per esporre volutamente il server su altri host usa `PERSONA_HOST` e `PERSONA_ALLOWED_HOSTS` (non c'è autenticazione: farlo solo su reti fidate).
- Documenti, memorie e trascrizioni sono inseriti nel prompt come dati non attendibili, separati dalle istruzioni applicative.

## Limiti noti

- **LM Studio non è stato verificato dal vivo** nell'ambiente di sviluppo usato per questa versione (nessun server di modelli disponibile): l'integrazione è testata con un server finto compatibile. Segnalare eventuali differenze di comportamento dei modelli reali.
- Il recupero è **lessicale** (SQLite FTS5, tokenizer `unicode61`): funziona per alfabeti latini, cirillici, greci; non riconosce sinonimi né traduzioni tra lingue e non segmenta testo cinese/giapponese/coreano. Gli embedding multilingue locali sono previsti (colonne `embedding` già nello schema).
- La qualità dell'estrazione automatica di memorie dipende dalla capacità del modello di produrre JSON valido; in caso contrario non viene creata alcuna memoria (nessuna corruzione dei dati).
- Il conteggio dei token è una stima (circa 3,5 caratteri per token); impostare la lunghezza del contesto con margine.
- Estrazione di testo da PDF non ancora disponibile (solo testo e Markdown).
- Gestione dei turni nelle simulazioni: scelta dell'autore o rotazione; la selezione automatica del parlante tramite LLM è prevista.
- La competenza linguistica e specialistica del personaggio è simulata ed è limitata dalle reali capacità del modello scelto.
- Modificare un messaggio non rielabora le memorie già estratte da quel messaggio.

## Roadmap

- Embedding locali (LM Studio `/v1/embeddings`) per recupero semantico multilingue.
- Estrazione PDF nella base di conoscenza.
- Gestione automatica dei turni nelle simulazioni.
- Esportazione/importazione di scenari completi.
- Involucro Electron.
- Ulteriori lingue dell'interfaccia (francese, spagnolo, tedesco, portoghese).
