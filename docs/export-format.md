# Formato di esportazione dei personaggi (`persona.character`, versione 1)

File JSON in UTF-8, prodotto da `GET /api/characters/:id/export` e accettato da `POST /api/characters/import`. Le definizioni TypeScript di riferimento sono in [`shared/src/export-format.ts`](../shared/src/export-format.ts).

## Parametri di esportazione

| Parametro | Predefinito | Effetto |
|---|---|---|
| `conversations=1` | sì | Include le conversazioni del Laboratorio con messaggi e riassunti |
| `knowledge=1` | sì | Include la base di conoscenza (testo completo dei documenti) |
| `contextual=1` | no | Include memorie contestuali e sessioni di scenario/simulazione |

## Struttura

```jsonc
{
  "format": "persona.character",
  "version": 1,
  "exportedAt": "2026-11-08T10:00:00.000Z",
  "app": { "name": "PERSONA", "version": "0.1.0" },
  "character": {
    "id": "…",                       // id originale (all'importazione ne viene generato uno nuovo)
    "name": "Irina Volkova",
    "age": "52", "origin": "…", "culturalBackground": "…", "occupation": "…", "education": "…",
    "biography": "…", "appearance": "…",
    "portrait": "data:image/jpeg;base64,…" | null,
    "temperament": "…", "interpersonalStyle": "…", "conflictResponse": "…", "stressResponse": "…",
    "bigFive": { "openness": 85, "conscientiousness": 70, "extraversion": null, "agreeableness": 40, "neuroticism": null } | null,
    "register": "…", "vocabulary": "…", "formality": "…", "humor": "…", "assertiveness": "…",
    "argumentativeStyle": "…", "conversationalDepth": "…", "culturalLinguisticNotes": "…",
    "preferredLanguage": "it" | null,
    "authorNotes": "…" | null,
    "traits":    [ { "category": "personality|motivation|value|desire|fear|bias|contradiction|expression", "content": "…", "sortOrder": 0 } ],
    "languages": [ { "code": "ru", "proficiency": "native|fluent|advanced|intermediate|basic", "isNative": true, "notes": null, "sortOrder": 0 } ],
    "expertise": [ { "domain": "Cosmologia", "level": "foundational|competent|expert|leading", "description": "…", "subtopics": ["…"], "sortOrder": 0 } ],
    "identityVersion": 3, "parentId": null, "variantNote": null,
    "createdAt": "…", "updatedAt": "…"
  },
  "memories": [
    {
      "id": "…",
      "category": "core|episodic|semantic|contextual",
      "scenarioId": null,                // valorizzato solo per le memorie contestuali
      "content": "…",
      "importance": 1,                   // 1–5
      "epistemicStatus": "fact|interpretation|opinion|fiction|unverified",
      "language": "it" | null,
      "status": "active|proposed|archived",
      "origin": "author|conversation|summary|extraction|promotion|import",
      "pinned": false,
      "promotedFromId": null,
      "createdAt": "…", "updatedAt": "…",
      "sources": [ { "conversationId": "…", "messageId": null, "scenarioId": null, "fromSeq": 3, "toSeq": 12, "note": "…" } ]
    }
  ],
  "knowledge": [
    { "id": "…", "title": "…", "kind": "text|markdown|note", "content": "…", "sourceRef": "…" | null,
      "epistemicStatus": "fact", "language": null, "enabled": true, "createdAt": "…" }
  ],
  "conversations": [
    {
      "id": "…", "kind": "lab|scenario|simulation", "scenarioId": null, "title": "…",
      "language": "auto", "defaultMode": "dialogue|interview|analysis", "createdAt": "…", "updatedAt": "…",
      "messages": [
        { "id": "…", "seq": 1, "role": "author|character|analysis|narrator", "isSelf": false,
          "speakerName": null, "content": "…", "mode": "dialogue", "language": null,
          "status": "complete|incomplete|error|superseded", "model": null, "createdAt": "…" }
      ],
      "summaries": [ { "fromSeq": 1, "toSeq": 20, "content": "…", "createdAt": "…" } ]
    }
  ],
  "scenarios": [ { "id": "…", "title": "…" } ]   // scenari referenziati (solo riferimento)
}
```

## Regole di importazione

- Viene sempre creata una **nuova** identità con nuovi identificativi; nessun dato esistente viene sovrascritto. Il collegamento a un personaggio genitore (`parentId`) non viene ricreato.
- Opzioni (`?conversations=0|1&memories=0|1&knowledge=0|1`, tutte attive per impostazione predefinita).
- Le conversazioni del Laboratorio vengono importate con messaggi e riassunti; i messaggi con `isSelf: true` vengono attribuiti al nuovo personaggio.
- Le **sessioni di scenario e le simulazioni** non vengono importate (dipendono da scenari e altri personaggi): sono conteggiate in `skipped.scenarioConversations`. Restano comunque nel file come archivio leggibile.
- Le **memorie contestuali** vengono importate solo se lo scenario referenziato esiste nel database di destinazione con lo stesso id; altrimenti sono saltate e conteggiate in `skipped.contextualMemories`.
- La provenienza delle memorie viene conservata e annotata con l'id della memoria originale.
- Il file viene validato: formato o versione non riconosciuti producono l'errore `invalid_import`.

## Compatibilità

Le versioni future del formato incrementeranno `version` e manterranno l'importazione delle versioni precedenti.

---

# Formato di esportazione degli scenari (`persona.scenario`, versione 1)

Prodotto da `GET /api/scenarios/:id/export?sessions=0|1` e accettato da `POST /api/scenarios/import?characters=reuse|new&sessions=0|1`. Tipi di riferimento: `ScenarioExportV1` in [`shared/src/export-format.ts`](../shared/src/export-format.ts).

```jsonc
{
  "format": "persona.scenario",
  "version": 1,
  "exportedAt": "…",
  "app": { "name": "PERSONA", "version": "0.3.0" },
  "scenario": { "id": "…", "title": "Aurora", "description": "…", "setting": "…", "timeline": "…", "environment": "…",
                "initialSituation": "…", "currentSituation": "…", "knowledge": "…", "language": "en" | null,
                "status": "active", "createdAt": "…", "updatedAt": "…" },
  "characters": [ /* un oggetto persona.character v1 per ogni partecipante (senza conversazioni del Laboratorio) */ ],
  "participants": [ { "characterId": "…", "role": "…", "roleDescription": "…", "knowledge": "…", "objectives": "…", "sortOrder": 0 } ],
  "relationships": [ { "fromCharacterId": "…", "toCharacterId": "…", "description": "…" } ],
  "events": [ { "title": "…", "content": "…", "fictionalTime": "Giorno 12", "sortOrder": 0, "createdAt": "…" } ],
  "memories": [ /* memorie contestuali dello scenario, come in persona.character, più "characterId" */ ],
  "sessions": [
    { "id": "…", "kind": "scenario|simulation", "title": "…", "language": "auto", "defaultMode": "dialogue",
      "turnMode": "manual|round-robin|auto", "characterId": "…" | null, "participantIds": ["…"],
      "createdAt": "…", "updatedAt": "…",
      "messages": [ { "seq": 1, "role": "narrator", "characterId": null, "speakerName": null, "content": "…", "mode": "dialogue",
                      "language": null, "status": "complete", "model": null, "createdAt": "…" } ],
      "summaries": [ { "fromSeq": 1, "toSeq": 20, "content": "…", "createdAt": "…" } ] }
  ]
}
```

## Regole di importazione

- Viene sempre creato un **nuovo** scenario.
- `characters=reuse` (predefinito): i personaggi il cui id esiste già nel database vengono riutilizzati così come sono (la loro identità non viene modificata); gli altri vengono importati come nuove identità. `characters=new`: tutti i personaggi vengono importati come nuove identità.
- Partecipanti, relazioni, eventi, sessioni (con messaggi e riassunti) e memorie contestuali vengono ricollegati ai personaggi importati o riutilizzati. Le memorie contestuali restano isolate nel nuovo scenario.
- I messaggi delle sessioni importate sono considerati già elaborati per la memoria (le memorie contestuali arrivano con il file).
