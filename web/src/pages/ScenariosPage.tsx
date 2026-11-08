import type { ScenarioDetail } from '@persona/shared';
import { Orbit, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useInvalidate, useScenarios } from '../api/hooks';
import { Badge, Button, EmptyState, ErrorBox, Input, PageHeader, Spinner, useErrorText } from '../components/ui';
import { formatRelative } from '../lib/format';
import { useUi } from '../stores/ui';

export function ScenariosPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useScenarios();
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useUi((s) => s.toast);
  const errorText = useErrorText();

  const create = async () => {
    if (!title.trim()) return;
    try {
      const s = await api.post<ScenarioDetail>('/api/scenarios', { title: title.trim() });
      await invalidate('scenarios');
      toast(t('scenarios.created'), 'success');
      navigate(`/scenarios/${s.id}`);
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('scenarios.title')}
        subtitle={t('scenarios.subtitle')}
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('scenarios.fields.title')} aria-label={t('scenarios.fields.title')} />
            <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!title.trim()}>
              {t('scenarios.new')}
            </Button>
          </form>
        }
      />
      <div className="px-6 py-4">
        <p className="mb-4 max-w-3xl text-sm text-muted">{t('scenarios.isolationNote')}</p>
        {isLoading && <Spinner />}
        {error && <ErrorBox error={error} />}
        {data?.length === 0 && <EmptyState>{t('scenarios.empty')}</EmptyState>}
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {data?.map((s) => (
            <li key={s.id}>
              <Link to={`/scenarios/${s.id}`} className="flex h-full flex-col gap-2 rounded-lg border border-border bg-panel p-4 hover:bg-panel-2/50">
                <div className="flex items-center gap-2">
                  <Orbit className="size-4 text-narration" aria-hidden />
                  <span className="font-semibold">{s.title}</span>
                  {s.status === 'archived' && <Badge>{t('enums.scenarioStatus.archived')}</Badge>}
                </div>
                {(s.description || s.setting) && <p className="line-clamp-2 text-sm text-muted">{s.description ?? s.setting}</p>}
                <div className="mt-auto flex flex-wrap gap-1">
                  {s.participantNames.map((n) => (
                    <Badge key={n}>{n}</Badge>
                  ))}
                </div>
                <div className="text-xs text-muted">
                  {t('scenarios.participants', { count: s.participantCount })} · {t('scenarios.sessions', { count: s.conversationCount })} · {formatRelative(s.updatedAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
