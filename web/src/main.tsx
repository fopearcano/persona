import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { usePreferences } from './api/hooks';
import { App } from './App';
import i18n from './i18n';
import './index.css';
import { applyTheme, useUi } from './stores/ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

/** Allinea tema e lingua alle preferenze salvate sul backend (persistenti tra i riavvii). */
function PreferencesSync() {
  const { data } = usePreferences();
  const applied = useRef(false);
  useEffect(() => {
    if (!data || applied.current) return;
    applied.current = true;
    if (data.uiLanguage && data.uiLanguage !== i18n.language && i18n.options.supportedLngs && (i18n.options.supportedLngs as string[]).includes(data.uiLanguage)) {
      void i18n.changeLanguage(data.uiLanguage);
    }
    if (data.theme !== useUi.getState().theme) useUi.getState().setTheme(data.theme);
  }, [data]);
  return null;
}

applyTheme(useUi.getState().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PreferencesSync />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
