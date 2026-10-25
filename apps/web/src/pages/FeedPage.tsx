import type { IndexEntry, Meta } from '@chembridge/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Async } from '../components/common.tsx';
import { FilterPanel } from '../components/FilterPanel.tsx';
import { ItemCard } from '../components/ItemCard.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadIndex, loadMeta, useAsync } from '../lib/data.ts';
import {
  activeFilterCount,
  applyFilters,
  parseFilters,
  serializeFilters,
  type FeedFilters,
  type SortKey,
} from '../lib/filters.ts';
import { searchIds } from '../lib/search.ts';

const PAGE = 30;
const NO_HITS = new Map<string, number>();

export default function FeedPage() {
  const state = useAsync(() => Promise.all([loadIndex(), loadMeta()]), []);
  return <Async state={state}>{([rows, meta]) => <Feed rows={rows} meta={meta} />}</Async>;
}

function Feed({ rows, meta }: { rows: IndexEntry[]; meta: Meta }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [query, setQuery] = useState(filters.q);
  const [found, setFound] = useState<{ q: string; hits: Map<string, number> } | undefined>();
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = (f: FeedFilters) => {
    setParams(serializeFilters(f), { replace: true });
    setLimit(PAGE);
  };

  // The query goes into the URL after a short pause in typing; relevance sort follows it.
  const onQuery = (value: string) => {
    setQuery(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => {
      const q = value.trim();
      update({
        ...filters,
        q,
        sort: q ? 'relevance' : filters.sort === 'relevance' ? 'score' : filters.sort,
      });
    }, 250);
  };
  useEffect(() => () => clearTimeout(typing.current), []);

  // The search index is only downloaded and built when a query is present.
  useEffect(() => {
    if (!filters.q) return;
    let alive = true;
    const q = filters.q;
    searchIds(q).then(
      (hits) => alive && setFound({ q, hits }),
      () => alive && setFound({ q, hits: new Map() }),
    );
    return () => {
      alive = false;
    };
  }, [filters.q]);

  const hits = filters.q ? (found?.q === filters.q ? found.hits : NO_HITS) : undefined;
  const searching = Boolean(filters.q) && found?.q !== filters.q;
  const results = useMemo(() => applyFilters(rows, filters, hits), [rows, filters, hits]);
  const active = activeFilterCount(filters);
  const sorts: SortKey[] = filters.q ? ['relevance', 'score', 'date'] : ['score', 'date'];

  return (
    <>
      <div className="section-title">
        <h1>{t('feed.title')}</h1>
        <p className="muted small">
          {t('common.items', { n: formatNumber(meta.counts.published) })} · {t('common.updated')}:{' '}
          {formatDate(meta.generatedAt)}
        </p>
      </div>
      <div className="feed-layout">
        <FilterPanel
          id="feed-filters"
          filters={filters}
          onChange={update}
          rows={rows}
          hidden={!showFilters}
        />
        <section aria-labelledby="results-heading">
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">{t('feed.searchLabel')}</span>
              <input
                className="input"
                type="search"
                placeholder={t('feed.search')}
                value={query}
                onChange={(e) => onQuery(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn filters-toggle"
              aria-expanded={showFilters}
              aria-controls="feed-filters"
              onClick={() => setShowFilters((s) => !s)}
            >
              {showFilters ? t('feed.filters.hide') : t('feed.filters.show')}
              {active > 0 && ` (${active})`}
            </button>
            <label className="field" style={{ margin: 0 }}>
              <span className="sr-only">{t('feed.sort')}</span>
              <select
                className="input"
                value={filters.sort}
                onChange={(e) => update({ ...filters, sort: e.target.value as SortKey })}
              >
                {sorts.map((s) => (
                  <option key={s} value={s}>
                    {t('feed.sort')}: {t(`feed.sort.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h2 id="results-heading" className="small muted" aria-live="polite">
            {searching
              ? t('feed.searching')
              : t('feed.results', { n: formatNumber(results.length) })}
          </h2>
          {results.length === 0 && !searching ? (
            <div className="notice">
              <p>{t('feed.empty')}</p>
              {active > 0 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => update({ ...parseFilters(new URLSearchParams()), q: filters.q })}
                >
                  {t('feed.clear')}
                </button>
              )}
            </div>
          ) : (
            <>
              {results.slice(0, limit).map((r) => (
                <ItemCard key={r.id} item={r} />
              ))}
              {results.length > limit && (
                <p style={{ textAlign: 'center', marginTop: 16 }}>
                  <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                    {t('common.showMore')} ({formatNumber(results.length - limit)})
                  </button>
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
