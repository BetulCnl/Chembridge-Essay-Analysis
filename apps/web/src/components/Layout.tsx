import { NavLink, Outlet } from 'react-router-dom';
import { useI18n, type Lang } from '../i18n/index.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { dataUrl } from '../lib/data.ts';
import { useTheme, type ThemeChoice } from '../lib/theme.tsx';

const NAV: Array<{ to: string; key: StringKey; end?: boolean }> = [
  { to: '/', key: 'nav.feed', end: true },
  { to: '/matrix', key: 'nav.matrix' },
  { to: '/trends', key: 'nav.trends' },
  { to: '/weekly', key: 'nav.weekly' },
  { to: '/notebook', key: 'nav.notebook' },
  { to: '/models', key: 'nav.models' },
  { to: '/about', key: 'nav.about' },
];

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <path
        d="M20 18h24M26 18v12L16 46a4 4 0 0 0 3.5 6h25a4 4 0 0 0 3.5-6L38 30V18"
        fill="none"
        stroke="var(--accent-text)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="42" r="3" fill="var(--accent-text)" />
      <circle cx="37" cy="44" r="2" fill="var(--accent-text)" />
    </svg>
  );
}

export function Layout() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const themes: ThemeChoice[] = ['light', 'dark', 'system'];
  const langs: Lang[] = ['tr', 'en'];
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
      <header className="site-header">
        <div className="container">
          <div className="header-row">
            <NavLink to="/" className="brand" aria-label="ChemBridge">
              <Logo />
              <span>
                <span className="brand-name">ChemBridge</span>
                <span className="brand-tagline">{t('app.tagline')}</span>
              </span>
            </NavLink>
            <div className="header-tools">
              <div className="segmented" role="group" aria-label={t('lang.label')}>
                {langs.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => setLang(l)}
                    lang={l}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="theme-select">
                {t('theme.label')}
              </label>
              <select
                id="theme-select"
                className="input"
                style={{ width: 'auto', minHeight: 32, padding: '3px 8px', fontSize: '0.85rem' }}
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeChoice)}
              >
                {themes.map((th) => (
                  <option key={th} value={th}>
                    {t(`theme.${th}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav className="nav" aria-label={t('nav.menu')}>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end ?? false}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
        <div className="container page">
          <Outlet />
        </div>
      </main>
      <footer className="site-footer">
        <div className="container">
          <p>
            ChemBridge · {t('app.tagline')} · <a href={dataUrl('feed.xml')}>RSS</a>
          </p>
          <p className="small">{t('about.privacyText')}</p>
        </div>
      </footer>
    </>
  );
}
