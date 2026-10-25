import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Loading } from './components/common.tsx';
import { Layout } from './components/Layout.tsx';
import { I18nProvider } from './i18n/index.tsx';
import { ThemeProvider } from './lib/theme.tsx';
import FeedPage from './pages/FeedPage.tsx';

const ItemPage = lazy(() => import('./pages/ItemPage.tsx'));
const MatrixPage = lazy(() => import('./pages/MatrixPage.tsx'));
const TrendsPage = lazy(() => import('./pages/TrendsPage.tsx'));
const WeeklyPage = lazy(() => import('./pages/WeeklyPage.tsx'));
const NotebookPage = lazy(() => import('./pages/NotebookPage.tsx'));
const ModelsPage = lazy(() => import('./pages/ModelsPage.tsx'));
const AboutPage = lazy(() => import('./pages/AboutPage.tsx'));

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        {/* HashRouter: GitHub Pages / Cloudflare Pages serve one index.html without rewrites. */}
        <HashRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<FeedPage />} />
                <Route path="item/:id" element={<ItemPage />} />
                <Route path="matrix" element={<MatrixPage />} />
                <Route path="trends" element={<TrendsPage />} />
                <Route path="weekly" element={<WeeklyPage />} />
                <Route path="weekly/:week" element={<WeeklyPage />} />
                <Route path="notebook" element={<NotebookPage />} />
                <Route path="models" element={<ModelsPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="*" element={<FeedPage />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
