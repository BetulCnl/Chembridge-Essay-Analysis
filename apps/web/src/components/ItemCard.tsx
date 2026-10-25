import type { IndexEntry } from '@chembridge/core';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import { sourceName } from '../lib/labels.ts';
import { ChemChip, CsChip, ScoreBadge, TypeLabel } from './common.tsx';

export function ItemCard({ item }: { item: IndexEntry }) {
  const { t, formatDate } = useI18n();
  const headingId = `card-${item.id}`;
  return (
    <article className="card item-card" aria-labelledby={headingId}>
      <div>
        <h3 id={headingId}>
          <Link to={`/item/${item.id}`}>{item.title}</Link>
        </h3>
        <div className="item-meta">
          <span>{item.venue || sourceName(item.source)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.date}>{formatDate(item.date)}</time>
          <span aria-hidden="true">·</span>
          <span>
            <TypeLabel type={item.type} />
          </span>
          {item.source !== item.venue && sourceName(item.source) !== item.venue && (
            <>
              <span aria-hidden="true">·</span>
              <span>{sourceName(item.source)}</span>
            </>
          )}
        </div>
      </div>
      <ScoreBadge score={item.score} />
      <div className="chips">
        {item.chem.map((c) => (
          <ChemChip key={c} id={c} />
        ))}
        {item.cs.map((c) => (
          <CsChip key={c} id={c} />
        ))}
        {item.csInferred.slice(0, item.cs.length ? 1 : 2).map((c) => (
          <CsChip key={c} id={c} potential />
        ))}
        {item.code && <span className="chip chip-flag">{t('common.code')}</span>}
        {item.data && <span className="chip chip-flag">{t('common.data')}</span>}
      </div>
      <div className="card-actions">
        <Link className="btn btn-sm btn-primary" to={`/item/${item.id}#ideas`}>
          {t('common.viewIdeas')}
        </Link>
      </div>
    </article>
  );
}
