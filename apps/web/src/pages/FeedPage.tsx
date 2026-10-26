import type { IndexEntry, Meta } from '@chembridge/core';
import { Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Async, EmptyState } from '../components/common.tsx';
import { ActiveFilters, FilterBar } from '../components/FilterPanel.tsx';
import { ItemCard } from '../components/ItemCard.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadIndex, loadMeta, useAsync } from '../lib/data.ts';
import {
  activeFilterCount,
  applyFilters,
  DEFAULT_FILTERS,
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
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = (f: FeedFilters) => {
    setParams(serializeFilters(f), { replace: true });
    setLimit(PAGE);
  };

  // The query goes into the URL after a short pause in typing; relevance sort follows it.
  const commitQuery = (value: string) => {
    const q = value.trim();
    update({
      ...filters,
      q,
      sort: q ? 'relevance' : filters.sort === 'relevance' ? 'score' : filters.sort,
    });
  };
  const onQuery = (value: string) => {
    setQuery(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => commitQuery(value), 250);
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
      <header className="page-head">
        <h1>{t('feed.title')}</h1>
        <p className="lead">{t('feed.lead', { n: formatNumber(meta.counts.published) })}</p>
      </header>

      <div role="search">
        <label className="search-field">
          <span className="sr-only">{t('feed.searchLabel')}</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={t('feed.search')}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                clearTimeout(typing.current);
                commitQuery(query);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="btn btn-quiet btn-icon btn-sm clear"
              aria-label={t('feed.searchClear')}
              onClick={() => {
                clearTimeout(typing.current);
                setQuery('');
                commitQuery('');
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        <FilterBar filters={filters} onChange={update} rows={rows} sorts={sorts} />
        <ActiveFilters filters={filters} onChange={update} />
      </div>

      <section aria-labelledby="results-heading">
        <div className="results-summary">
          <h2 id="results-heading" className="small" style={{ fontWeight: 500 }} aria-live="polite">
            {searching
              ? t('feed.searching')
              : t('feed.results', { n: formatNumber(results.length) })}
          </h2>
          <span>
            {t('common.updated')}: {formatDate(meta.generatedAt)}
          </span>
        </div>
        {results.length === 0 && !searching ? (
          <EmptyState
            title={t('feed.emptyTitle')}
            icon={<SearchX size={28} strokeWidth={1.5} aria-hidden="true" />}
          >
            <p className="small">{t('feed.empty')}</p>
            {(active > 0 || filters.q) && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setQuery('');
                  update(DEFAULT_FILTERS);
                }}
              >
                {t('feed.clear')}
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            <ol className="result-list" style={{ listStyle: 'none' }}>
              {results.slice(0, limit).map((r) => (
                <ItemCard key={r.id} item={r} prefer={filters.cs} />
              ))}
            </ol>
            {results.length > limit && (
              <div className="load-more">
                <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                  {t('common.showMore')}
                  <span className="muted num">
                    {formatNumber(limit)} / {formatNumber(results.length)}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
