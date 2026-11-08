import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import it_ from './locales/it.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(s: string) {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe('translations', () => {
  it('Italian and English expose exactly the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(it_).sort());
  });

  it('interpolation placeholders match between languages', () => {
    const flat = (o: unknown, p = ''): [string, string][] =>
      typeof o === 'string' ? [[p, o]] : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k));
    const enMap = new Map(flat(en));
    for (const [k, v] of flat(it_)) expect(placeholders(enMap.get(k) ?? ''), k).toEqual(placeholders(v));
  });

  it('has no empty strings', () => {
    const flat = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as Record<string, unknown>).flatMap(flat));
    expect(flat(it_).filter((s) => !s.trim())).toEqual([]);
    expect(flat(en).filter((s) => !s.trim())).toEqual([]);
  });
});
