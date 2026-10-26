import type { IndexEntry } from '@chembridge/core';
import { Code2, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import { sourceName } from '../lib/labels.ts';
import { ChemChip, CsChip, ScoreBadge, TypeLabel } from './common.tsx';

/**
 * One row of a result list (render inside <ol className="result-list">). The whole row is
 * clickable through the title link. `prefer` lists method ids to show first among the
 * potential ones.
 */
export function ItemCard({ item, prefer = [] }: { item: IndexEntry; prefer?: string[] }) {
  const { t, formatDate } = useI18n();
  const headingId = `card-${item.id}`;
  const venue = item.venue || sourceName(item.source);
  // Potential methods the user filtered for come first, so they are always visible.
  const potential = [...item.csInferred]
    .sort((a, b) => Number(prefer.includes(b)) - Number(prefer.includes(a)))
    .slice(0, item.cs.length ? 1 : 2);
  return (
    <li>
      <article className="result" aria-labelledby={headingId}>
        <div>
          <h3 className="result-title" id={headingId}>
            <Link to={`/item/${item.id}`}>{item.title}</Link>
          </h3>
          <p className="result-meta">
            <span>{venue}</span>
            <span className="sep" aria-hidden="true">
              ·
            </span>
            <time dateTime={item.date}>{formatDate(item.date)}</time>
            <span className="sep" aria-hidden="true">
              ·
            </span>
            <TypeLabel type={item.type} />
          </p>
        </div>
        <div className="result-score">
          <ScoreBadge score={item.score} />
        </div>
        <div className="result-tags">
          {item.chem.slice(0, 2).map((c) => (
            <ChemChip key={c} id={c} />
          ))}
          {item.cs.slice(0, 3).map((c) => (
            <CsChip key={c} id={c} />
          ))}
          {potential.map((c) => (
            <CsChip key={c} id={c} potential />
          ))}
          {item.code && (
            <span className="tag tag-flag">
              <Code2 size={14} aria-hidden="true" />
              {t('common.code')}
            </span>
          )}
          {item.data && (
            <span className="tag tag-flag">
              <Database size={13} aria-hidden="true" />
              {t('common.data')}
            </span>
          )}
        </div>
      </article>
    </li>
  );
}
