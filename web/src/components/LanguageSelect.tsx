import { AUTO_LANGUAGE, COMMON_LANGUAGE_CODES } from '@persona/shared/client';
import { useTranslation } from 'react-i18next';
import { languageLabel, nativeLanguageLabel } from '../lib/format';
import { Select } from './ui';

const CUSTOM = '__custom__';

/**
 * Selettore di lingua con nomi localizzati (Intl.DisplayNames).
 * L'elenco non è limitante: "Altro codice…" consente qualsiasi codice BCP-47.
 */
export function LanguageSelect({
  value,
  onChange,
  allowAuto,
  allowNone,
  noneLabel,
  autoLabel,
  id,
  className,
  ariaLabel,
}: {
  value: string | null | undefined;
  onChange(v: string | null): void;
  allowAuto?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  autoLabel?: string;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const codes: string[] = [...COMMON_LANGUAGE_CODES];
  if (value && value !== AUTO_LANGUAGE && !codes.includes(value)) codes.push(value);
  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      className={className}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === CUSTOM) {
          const code = window.prompt(t('common.customLanguagePrompt'))?.trim();
          if (code && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) onChange(code);
          return;
        }
        onChange(v === '' ? null : v);
      }}
    >
      {allowNone && <option value="">{noneLabel ?? t('common.none')}</option>}
      {allowAuto && <option value={AUTO_LANGUAGE}>{autoLabel ?? t('chat.languageAuto')}</option>}
      {codes.map((c) => {
        const local = languageLabel(c);
        const native = nativeLanguageLabel(c);
        return (
          <option key={c} value={c}>
            {local}
            {native !== local ? ` · ${native}` : ''} ({c})
          </option>
        );
      })}
      <option value={CUSTOM}>{t('common.customLanguage')}</option>
    </Select>
  );
}
