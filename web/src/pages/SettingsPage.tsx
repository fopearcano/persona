import type { BackupInfo, ConnectionTestResult, ModelConfig, ModelInfo, Preferences, PreferencesUpdate, ProviderType, Theme } from '@persona/shared';
import { PLANNED_UI_LANGUAGES, PROVIDER_TYPES, UI_LANGUAGES } from '@persona/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, DatabaseBackup, Download, Plug, Plus, RotateCcw, Save, Search, Star, Trash2, Upload, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, downloadUrl } from '../api/client';
import { qk, useBackups, useInfo, useInvalidate, useModelConfigs, usePreferences } from '../api/hooks';
import { LanguageSelect } from '../components/LanguageSelect';
import { Badge, Button, Card, Checkbox, ErrorBox, Field, IconButton, Input, PageHeader, Segmented, Select, Spinner, useErrorText } from '../components/ui';
import { formatBytes, formatDateTime, languageLabel, nativeLanguageLabel } from '../lib/format';
import { useUi } from '../stores/ui';

function useSavePreferences() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  return async (patch: PreferencesUpdate) => {
    try {
      const next = await api.put<Preferences>('/api/preferences', patch);
      qc.setQueryData(qk.preferences, next);
      return next;
    } catch (err) {
      toast(errorText(err), 'error');
      return null;
    }
  };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { data: prefs, isLoading } = usePreferences();
  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.localOnly')} />
      {isLoading || !prefs ? (
        <Spinner />
      ) : (
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-5">
          <AppearanceCard prefs={prefs} />
          <ModelsCard />
          <MemoryContextCard prefs={prefs} />
          <BackupCard />
          <InfoCard />
        </div>
      )}
    </div>
  );
}

function AppearanceCard({ prefs }: { prefs: Preferences }) {
  const { t, i18n } = useTranslation();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const setLanguage = useUi((s) => s.setLanguage);
  const save = useSavePreferences();
  return (
    <Card title={t('settings.appearance')}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field group label={t('settings.theme')}>
          <Segmented<Theme>
            label={t('settings.theme')}
            value={theme}
            onChange={(v) => {
              setTheme(v);
              void save({ theme: v });
            }}
            options={(['dark', 'light', 'system'] as const).map((id) => ({ id, label: t(`theme.${id}`) }))}
          />
        </Field>
        <Field label={t('settings.interfaceLanguage')} help={t('settings.plannedLanguages', { list: PLANNED_UI_LANGUAGES.map((c) => languageLabel(c)).join(', ') })}>
          <Select
            value={i18n.language}
            onChange={(e) => {
              setLanguage(e.target.value);
              void save({ uiLanguage: e.target.value });
            }}
          >
            {UI_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {nativeLanguageLabel(l)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('settings.conversationLanguage')} help={t('settings.conversationLanguageHelp')}>
          <LanguageSelect value={prefs.conversationLanguage} allowAuto onChange={(v) => void save({ conversationLanguage: v ?? 'auto' })} />
        </Field>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

type ConfigDraft = Omit<ModelConfig, 'id' | 'hasApiKey' | 'apiKeyFromEnv' | 'createdAt' | 'updatedAt'> & { apiKey?: string | null };

function ModelsCard() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useModelConfigs();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  return (
    <Card
      title={t('settings.models')}
      actions={
        <Button
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={async () => {
            try {
              await api.post('/api/model-configs', { name: t('settings.newModelName'), providerType: 'lmstudio' });
              await invalidate('model-configs');
            } catch (err) {
              toast(errorText(err), 'error');
            }
          }}
        >
          {t('settings.addModel')}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('settings.modelsHelp')}</p>
      {isLoading && <Spinner />}
      {error && <ErrorBox error={error} />}
      {data?.length === 0 && <p className="text-sm text-muted">{t('settings.noModels')}</p>}
      <div className="flex flex-col gap-3">
        {data?.map((c) => (
          <ModelConfigEditor key={c.id} config={c} />
        ))}
      </div>
    </Card>
  );
}

function ModelConfigEditor({ config }: { config: ModelConfig }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const toDraft = (c: ModelConfig): ConfigDraft => ({
    name: c.name,
    providerType: c.providerType,
    baseUrl: c.baseUrl,
    model: c.model,
    temperature: c.temperature,
    topP: c.topP,
    maxTokens: c.maxTokens,
    contextLength: c.contextLength,
    isDefault: c.isDefault,
  });
  const [d, setD] = useState<ConfigDraft>(() => toDraft(config));
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | 'discover' | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setD(toDraft(config)), [config]);
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(config)) || apiKey !== '';
  const needsKey = d.providerType === 'openai' || d.providerType === 'openai-compatible';

  const save = async (extra: Partial<ConfigDraft> = {}) => {
    setBusy('save');
    setError(null);
    try {
      await api.put(`/api/model-configs/${config.id}`, { ...d, ...extra, apiKey: 'apiKey' in extra ? extra.apiKey : apiKey ? apiKey : undefined });
      setApiKey('');
      await invalidate('model-configs');
      toast(t('toast.saved'), 'success');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs font-medium" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label={t('common.name')} />
        {config.isDefault ? (
          <Badge tone="accent">
            <Star className="size-3" aria-hidden /> {t('common.default')}
          </Badge>
        ) : (
          <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={() => void save({ isDefault: true })}>
            {t('settings.makeDefault')}
          </Button>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            icon={<Plug className="size-3.5" />}
            loading={busy === 'test'}
            disabled={dirty}
            onClick={async () => {
              setBusy('test');
              setTest(null);
              try {
                const res = await api.post<ConnectionTestResult>(`/api/model-configs/${config.id}/test`, { completion: true });
                setTest(res);
                setModels(res.models);
              } catch (err) {
                setError(err);
              } finally {
                setBusy(null);
              }
            }}
          >
            {t('settings.test')}
          </Button>
          <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={busy === 'save'} disabled={!dirty} onClick={() => void save()}>
            {t('common.save')}
          </Button>
          <IconButton
            label={t('common.delete')}
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (!window.confirm(t('settings.deleteModelConfirm'))) return;
              await api.del(`/api/model-configs/${config.id}`);
              await invalidate('model-configs', 'character');
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label={t('settings.provider')}>
          <Select value={d.providerType} onChange={(e) => setD({ ...d, providerType: e.target.value as ProviderType })}>
            {PROVIDER_TYPES.map((p) => (
              <option key={p} value={p}>
                {t(`enums.provider.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        {d.providerType !== 'mock' && (
          <Field label={t('settings.baseUrl')} className="md:col-span-3">
            <Input value={d.baseUrl} onChange={(e) => setD({ ...d, baseUrl: e.target.value })} placeholder="http://localhost:1234/v1" />
          </Field>
        )}
        <Field label={t('settings.model')} className="md:col-span-2">
          <div className="flex gap-1">
            {models && models.length > 0 ? (
              <Select value={d.model} onChange={(e) => setD({ ...d, model: e.target.value })}>
                <option value="">{t('settings.modelAuto')}</option>
                {!models.some((m) => m.id === d.model) && d.model && <option value={d.model}>{d.model}</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    {m.loaded === true ? ` · ${t('settings.loaded')}` : m.loaded === false ? ` · ${t('settings.notLoaded')}` : ''}
                    {m.contextLength ? ` · ${m.contextLength}` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={d.model} onChange={(e) => setD({ ...d, model: e.target.value })} placeholder={t('settings.modelAuto')} />
            )}
            <Button
              icon={<Search className="size-3.5" />}
              loading={busy === 'discover'}
              title={t('settings.discover')}
              onClick={async () => {
                setBusy('discover');
                setError(null);
                try {
                  setModels(await api.post<ModelInfo[]>('/api/model-configs/probe', { providerType: d.providerType, baseUrl: d.baseUrl, apiKey: apiKey || undefined }));
                } catch (err) {
                  setError(err);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {t('settings.discover')}
            </Button>
          </div>
          {models && <p className="text-xs text-muted">{t('settings.modelsFound', { count: models.length })}</p>}
        </Field>
        <Field label={`${t('settings.temperature')}: ${d.temperature.toFixed(2)}`}>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={d.temperature}
            onChange={(e) => setD({ ...d, temperature: Number(e.target.value) })}
            className="mt-2 accent-[var(--accent)]"
            aria-label={t('settings.temperature')}
          />
        </Field>
        <Field label={t('settings.topP')}>
          <Input type="number" min={0} max={1} step={0.05} value={d.topP ?? ''} onChange={(e) => setD({ ...d, topP: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
        <Field label={t('settings.maxTokens')}>
          <Input type="number" min={16} step={64} value={d.maxTokens} onChange={(e) => setD({ ...d, maxTokens: Number(e.target.value) })} />
        </Field>
        <Field label={t('settings.contextLength')} help={t('settings.contextLengthHelp')} className="md:col-span-2">
          <Input type="number" min={512} step={512} value={d.contextLength} onChange={(e) => setD({ ...d, contextLength: Number(e.target.value) })} />
        </Field>
        {needsKey && (
          <Field
            label={t('settings.apiKey')}
            className="md:col-span-2"
            help={
              <>
                {config.hasApiKey && (config.apiKeyFromEnv ? t('settings.apiKeyEnv') : t('settings.apiKeySet'))} {t('settings.apiKeyHelp')}
              </>
            }
          >
            <div className="flex gap-1">
              <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('settings.apiKeyPlaceholder')} />
              {config.hasApiKey && !config.apiKeyFromEnv && (
                <Button size="sm" variant="ghost" onClick={() => void save({ apiKey: null })}>
                  {t('settings.apiKeyClear')}
                </Button>
              )}
            </div>
          </Field>
        )}
      </div>
      {error != null && <div className="mt-3"><ErrorBox error={error} /></div>}
      {test && (
        <div className={`mt-3 flex items-start gap-2 rounded-md border p-2 text-sm ${test.ok ? 'border-ok/40 text-ok' : 'border-danger/40 text-danger'}`}>
          {test.ok ? <CheckCircle2 className="mt-0.5 size-4" /> : <XCircle className="mt-0.5 size-4" />}
          <div>
            {test.ok ? t('settings.testOk', { ms: test.latencyMs, model: test.resolvedModel }) : t('settings.testFail')}
            {!test.ok && test.error && <div className="text-xs">{errorText(test.error)}</div>}
            {!test.ok && !test.error && !test.modelAvailable && <div className="text-xs">{t('settings.modelMissing')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MemoryContextCard({ prefs }: { prefs: Preferences }) {
  const { t } = useTranslation();
  const save = useSavePreferences();
  const toast = useUi((s) => s.toast);
  const [mem, setMem] = useState(prefs.memory);
  const [ctx, setCtx] = useState(prefs.context);
  const dirty = JSON.stringify(mem) !== JSON.stringify(prefs.memory) || JSON.stringify(ctx) !== JSON.stringify(prefs.context);
  const ratio = (k: 'memoryRatio' | 'knowledgeRatio' | 'summaryRatio' | 'excerptRatio', max: number) => (
    <Field label={`${t(`settings.${k}`)}: ${Math.round(ctx[k] * 100)}%`}>
      <input
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={ctx[k]}
        onChange={(e) => setCtx({ ...ctx, [k]: Number(e.target.value) })}
        className="accent-[var(--accent)]"
        aria-label={t(`settings.${k}`)}
      />
    </Field>
  );
  const num = (k: 'maxMemories' | 'maxKnowledgeChunks' | 'maxExcerpts', max: number) => (
    <Field label={t(`settings.${k}`)}>
      <Input type="number" min={0} max={max} value={ctx[k]} onChange={(e) => setCtx({ ...ctx, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <Card
      title={t('settings.memory')}
      actions={
        <Button
          size="sm"
          variant="primary"
          icon={<Save className="size-3.5" />}
          disabled={!dirty}
          onClick={async () => {
            if (await save({ memory: mem, context: ctx })) toast(t('toast.saved'), 'success');
          }}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Checkbox label={t('settings.autoProcess')} checked={mem.autoProcess} onChange={(v) => setMem({ ...mem, autoProcess: v })} />
          <p className="text-xs text-muted">{t('settings.autoProcessHelp')}</p>
          <Checkbox label={t('settings.reviewExtracted')} checked={mem.reviewExtracted} onChange={(v) => setMem({ ...mem, reviewExtracted: v })} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t('settings.processThreshold')}>
            <Input type="number" min={4} max={200} value={mem.processThreshold} onChange={(e) => setMem({ ...mem, processThreshold: Number(e.target.value) })} />
          </Field>
          <Field label={t('settings.keepRecent')}>
            <Input type="number" min={2} max={100} value={mem.keepRecentMessages} onChange={(e) => setMem({ ...mem, keepRecentMessages: Number(e.target.value) })} />
          </Field>
        </div>
        <p className="text-xs text-muted">{t('settings.budgetHelp')}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {ratio('memoryRatio', 0.6)}
          {ratio('knowledgeRatio', 0.6)}
          {ratio('summaryRatio', 0.5)}
          {ratio('excerptRatio', 0.4)}
          {num('maxMemories', 200)}
          {num('maxKnowledgeChunks', 50)}
          {num('maxExcerpts', 50)}
          <div className="flex items-end pb-1.5">
            <Checkbox label={t('settings.includeExcerpts')} checked={ctx.includeExcerpts} onChange={(v) => setCtx({ ...ctx, includeExcerpts: v })} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function BackupCard() {
  const { t } = useTranslation();
  const { data } = useBackups();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const afterRestore = async (res: { safetyBackup: string }) => {
    toast(t('settings.restored', { name: res.safetyBackup }), 'success');
    await qc.invalidateQueries();
  };

  return (
    <Card
      title={t('settings.backup')}
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".db,.sqlite,application/vnd.sqlite3,application/octet-stream"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !window.confirm(t('settings.restoreConfirm'))) return;
              try {
                await afterRestore(await api.upload<{ safetyBackup: string }>('/api/restore', f));
              } catch (err) {
                toast(errorText(err), 'error');
              }
            }}
          />
          <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
            {t('settings.restoreUpload')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<DatabaseBackup className="size-3.5" />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const b = await api.post<BackupInfo>('/api/backups');
                toast(t('toast.backupCreated', { name: b.fileName }), 'success');
                await invalidate('backups');
              } catch (err) {
                toast(errorText(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('settings.createBackup')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">{t('settings.importExportHelp')}</p>
      {data?.length === 0 && <p className="text-sm text-muted">{t('settings.noBackups')}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {data?.map((b) => (
          <li key={b.fileName} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="flex-1 truncate font-mono text-xs">{b.fileName}</span>
            <span className="text-xs text-muted">
              {formatBytes(b.sizeBytes)} · {formatDateTime(b.createdAt)}
            </span>
            <IconButton label={t('settings.download')} icon={<Download className="size-4" />} onClick={() => downloadUrl(`/api/backups/${b.fileName}`)} />
            <IconButton
              label={t('settings.restore')}
              icon={<RotateCcw className="size-4" />}
              onClick={async () => {
                if (!window.confirm(t('settings.restoreConfirm'))) return;
                try {
                  await afterRestore(await api.post<{ safetyBackup: string }>(`/api/backups/${b.fileName}/restore`));
                } catch (err) {
                  toast(errorText(err), 'error');
                }
              }}
            />
            <IconButton
              label={t('common.delete')}
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!window.confirm(t('common.deleteConfirmGeneric'))) return;
                await api.del(`/api/backups/${b.fileName}`);
                await invalidate('backups');
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InfoCard() {
  const { t } = useTranslation();
  const { data } = useInfo();
  if (!data) return null;
  return (
    <Card title={t('settings.info')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">PERSONA</dt>
        <dd>v{data.version}</dd>
        <dt className="text-muted">{t('settings.dataDir')}</dt>
        <dd className="font-mono text-xs break-all">{data.dataDir}</dd>
        <dt className="text-muted">{t('settings.database')}</dt>
        <dd className="font-mono text-xs break-all">{data.databaseFile}</dd>
        <dt className="text-muted">{t('settings.schemaVersion')}</dt>
        <dd>{data.schemaVersion}</dd>
      </dl>
      <p className="mt-3 text-xs text-muted">{t('settings.stats', data.stats)}</p>
    </Card>
  );
}
