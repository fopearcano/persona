import type { ModelInfo } from '@persona/shared';
import { type ChatChunk, type ChatMessage, type InferenceParams, LlmError, type LlmProvider } from './types.js';

/**
 * Provider deterministico per test automatici e uso dimostrativo offline.
 * Non è un modello linguistico: produce risposte segnaposto ricavate dal contesto
 * (utile per verificare l'assemblaggio del contesto senza LM Studio).
 */
export class MockProvider implements LlmProvider {
  readonly type = 'mock' as const;

  constructor(private readonly delayMs = 0) {}

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'mock-persona', loaded: true, contextLength: 32768, type: 'llm' },
      { id: 'mock-fail', loaded: true, contextLength: 8192, type: 'llm' },
      { id: 'mock-slow', loaded: true, contextLength: 8192, type: 'llm' },
    ];
  }

  private respond(messages: ChatMessage[], params: InferenceParams): string {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const firstWords = (text: string, n: number) => text.replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
    switch (params.purpose) {
      case 'test':
        return 'OK';
      case 'title':
        return `Conversazione: ${firstWords(lastUser.replace(/^.*?:\s*/m, ''), 5)}`;
      case 'summarize':
        return `Riassunto simulato. ${firstWords(lastUser, 40)}`;
      case 'consistency':
        return JSON.stringify({ issues: [] });
      case 'extract': {
        const lines = lastUser.split('\n').filter((l) => /^\[(AUTHOR|AUTORE|NARRATOR)/i.test(l));
        const source = lines.at(-1)?.replace(/^\[[^\]]+\]:?\s*/, '') ?? firstWords(lastUser, 12);
        return JSON.stringify({
          memories: [
            {
              content: `Mock: si è parlato di «${firstWords(source, 12)}»`,
              category: 'semantic',
              importance: 3,
              epistemicStatus: 'fact',
            },
          ],
        });
      }
      default: {
        const name = system.match(/^Name: (.+)$/m)?.[1]?.trim() ?? 'Personaggio';
        const lang = system.match(/^Respond in: .*\(([A-Za-z-]+)\)/m)?.[1] ?? 'auto';
        const memoryCount = (system.match(/^- \[mem /gm) ?? []).length;
        const prefix = params.purpose === 'analysis' ? `[analisi esterna su ${name}]` : `[${name}]`;
        return `${prefix} Risposta simulata (lingua: ${lang}; memorie nel contesto: ${memoryCount}). Hai detto: «${firstWords(lastUser, 20)}».`;
      }
    }
  }

  async *chatStream(messages: ChatMessage[], params: InferenceParams, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    if (params.model === 'mock-fail') throw new LlmError('llm_unavailable', 'Provider mock: errore simulato');
    const text = this.respond(messages, params);
    const delay = params.model === 'mock-slow' ? Math.max(this.delayMs, 200) : this.delayMs;
    const parts = text.match(/\S+\s*/g) ?? [text];
    for (const part of parts) {
      if (signal?.aborted) throw new LlmError('aborted', 'Richiesta annullata');
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      yield { type: 'content', text: part };
    }
  }
}
