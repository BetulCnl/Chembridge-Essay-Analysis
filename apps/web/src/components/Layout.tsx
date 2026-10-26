import {
  Bookmark,
  Compass,
  Grid3x3,
  Info,
  Rss,
  Settings2,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n, type Lang } from '../i18n/index.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { dataUrl } from '../lib/data.ts';
import { useNotebook } from '../lib/notebook.ts';
import { useTheme, type ThemeChoice } from '../lib/theme.tsx';
import { Popover } from './common.tsx';

interface NavItem {
  to: string;
  key: StringKey;
  icon: LucideIcon;
  /** Extra path prefixes that keep this item highlighted (e.g. item pages under Discover). */
  also?: string[];
}

const NAV: NavItem[] = [
  { to: '/', key: 'nav.feed', icon: Compass, also: ['/item/'] },
  { to: '/matrix', key: 'nav.matrix', icon: Grid3x3 },
  { to: '/trends', key: 'nav.trends', icon: TrendingUp, also: ['/weekly'] },
  { to: '/notebook', key: 'nav.notebook', icon: Bookmark },
];

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--text)" />
      <path
        d="M12.5 8.5h7M14 8.5v6l-4.6 8a1.6 1.6 0 0 0 1.4 2.4h10.4a1.6 1.6 0 0 0 1.4-2.4L18 14.5v-6"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.8 20.5h8.4" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function isActive(item: NavItem, path: string): boolean {
  if (item.to === '/') return path === '/' || (item.also ?? []).some((p) => path.startsWith(p));
  return path.startsWith(item.to) || (item.also ?? []).some((p) => path.startsWith(p));
}

function SettingsMenu() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const themes: ThemeChoice[] = ['system', 'light', 'dark'];
  const langs: Lang[] = ['tr', 'en'];
  return (
    <Popover
      label={t('nav.settings')}
      triggerClass="btn btn-quiet btn-icon"
      align="end"
      trigger={
        <>
          <Settings2 size={18} aria-hidden="true" />
          <span className="sr-only">{t('nav.settings')}</span>
        </>
      }
    >
      {(close) => (
        <>
          <div className="popover-section">
            <p className="popover-title" id="lang-label">
              {t('lang.label')}
            </p>
            <div className="segmented segmented-full" role="group" aria-labelledby="lang-label">
              {langs.map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                >
                  {l === 'tr' ? 'Türkçe' : 'English'}
                </button>
              ))}
            </div>
            <p className="popover-title" id="theme-label" style={{ marginTop: 14 }}>
              {t('theme.label')}
            </p>
            <div className="segmented segmented-full" role="group" aria-labelledby="theme-label">
              {themes.map((th) => (
                <button
                  key={th}
                  type="button"
                  aria-pressed={theme === th}
                  onClick={() => setTheme(th)}
                >
                  {t(`theme.${th}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="popover-section">
            <NavLink className="menu-link" to="/models" onClick={close}>
              <Sparkles size={16} aria-hidden="true" /> {t('nav.models')}
            </NavLink>
            <NavLink className="menu-link" to="/about" onClick={close}>
              <Info size={16} aria-hidden="true" /> {t('nav.about')}
            </NavLink>
            <a className="menu-link" href={dataUrl('feed.xml')}>
              <Rss size={16} aria-hidden="true" /> RSS
            </a>
          </div>
        </>
      )}
    </Popover>
  );
}

export function Layout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const saved = useNotebook().length;

  const links = (variant: 'top' | 'tab') =>
    NAV.map((n) => {
      const Icon = n.icon;
      const active = isActive(n, pathname);
      return (
        <NavLink
          key={n.to}
          to={n.to}
          className={active ? 'active' : ''}
          aria-current={active ? 'page' : undefined}
        >
          <Icon size={variant === 'tab' ? 20 : 16} strokeWidth={1.75} aria-hidden="true" />
          <span>{t(n.key)}</span>
          {n.to === '/notebook' && saved > 0 && (
            <span className="count-badge" aria-label={t('notebook.count', { n: saved })}>
              {saved}
            </span>
          )}
        </NavLink>
      );
    });

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        {t('app.skip')}
      </a>
      <header className="app-header">
        <div className="container header-inner">
          <NavLink to="/" className="brand" aria-label={`ChemBridge — ${t('app.tagline')}`}>
            <Logo />
            <span>ChemBridge</span>
          </NavLink>
          <nav className="primary-nav" aria-label={t('nav.menu')}>
            {links('top')}
          </nav>
          <div className="header-actions">
            <SettingsMenu />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="container page">
          <Outlet />
        </div>
      </main>
      <footer className="site-footer">
        <div className="container">
          <span>ChemBridge · {t('app.tagline')}</span>
          <span>
            <NavLink to="/about">{t('nav.about')}</NavLink> ·{' '}
            <NavLink to="/models">{t('nav.models')}</NavLink> ·{' '}
            <a href={dataUrl('feed.xml')}>RSS</a>
          </span>
        </div>
      </footer>
      <nav className="tabbar" aria-label={t('nav.menu')}>
        {links('tab')}
      </nav>
    </>
  );
}
