import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { I18nText } from '@chembridge/core';
import { readStorage, writeStorage } from '../lib/storage.ts';
import { en, tr, type StringKey } from './strings.ts';

export type Lang = 'tr' | 'en';

const DICTS: Record<Lang, Record<StringKey, string>> = { tr, en };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Picks the current language from a bilingual rule/idea text. */
  pick: (text: I18nText | undefined) => string;
  formatDate: (iso: string) => string;
  formatNumber: (n: number) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  const saved = readStorage('chembridge.lang');
  if (saved === 'tr' || saved === 'en') return saved;
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'tr';
  return nav.startsWith('tr') ? 'tr' : 'en';
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children, lang: forced }: { children: ReactNode; lang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(forced ?? initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeStorage('chembridge.lang', l);
  }, []);
  const value = useMemo<I18n>(() => {
    const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
    const dateFmt = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const numFmt = new Intl.NumberFormat(locale);
    return {
      lang,
      setLang,
      t: (key, vars) => interpolate(DICTS[lang][key] ?? key, vars),
      pick: (text) => (text ? text[lang] : ''),
      formatDate: (iso) => {
        const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
        return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
      },
      formatNumber: (n) => numFmt.format(n),
    };
  }, [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
