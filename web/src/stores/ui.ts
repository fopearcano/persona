import type { Theme } from '@persona/shared/client';
import { create } from 'zustand';
import { api } from '../api/client';
import { setUiLanguage } from '../i18n';

const THEME_KEY = 'persona.theme';
const PROJECT_KEY = 'persona.activeProject';

function readProject(): string | null {
  try {
    return localStorage.getItem(PROJECT_KEY) || null;
  } catch {
    return null;
  }
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light' || t === 'system') return t;
  } catch {
    /* ignora */
  }
  return 'dark';
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

interface UiState {
  theme: Theme;
  setTheme(theme: Theme): void;
  setLanguage(lang: string): void;
  toasts: Toast[];
  toast(text: string, kind?: Toast['kind']): void;
  dismiss(id: number): void;
  inspectorOpen: boolean;
  toggleInspector(): void;
  /** Progetto attivo (null = tutti i progetti). Salvato anche sul backend. */
  activeProjectId: string | null;
  setActiveProject(id: string | null, opts?: { persist?: boolean }): void;
}

let toastId = 0;

/** Stato dell'interfaccia (tema, lingua, notifiche). Le preferenze sono anche salvate sul backend. */
export const useUi = create<UiState>((set, get) => ({
  theme: readTheme(),
  setTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignora */
    }
    applyTheme(theme);
    set({ theme });
  },
  setLanguage(lang) {
    void setUiLanguage(lang);
  },
  toasts: [],
  toast(text, kind = 'info') {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  inspectorOpen: true,
  toggleInspector() {
    set({ inspectorOpen: !get().inspectorOpen });
  },
  activeProjectId: readProject(),
  setActiveProject(id, opts = {}) {
    try {
      if (id) localStorage.setItem(PROJECT_KEY, id);
      else localStorage.removeItem(PROJECT_KEY);
    } catch {
      /* ignora */
    }
    set({ activeProjectId: id });
    if (opts.persist !== false) void api.put('/api/preferences', { activeProjectId: id }).catch(() => undefined);
  },
}));

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (useUi.getState().theme === 'system') applyTheme('system');
  });
}
