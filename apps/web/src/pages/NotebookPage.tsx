import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import { chemShort, csShort } from '../lib/labels.ts';
import {
  downloadText,
  notebook,
  useNotebook,
  type NotebookEntry,
  type NoteStatus,
} from '../lib/notebook.ts';
import { storageAvailable } from '../lib/storage.ts';

const STATUSES: NoteStatus[] = ['idea', 'exploring', 'archived'];

export default function NotebookPage() {
  const { t } = useI18n();
  const entries = useNotebook();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<NoteStatus | 'all'>('all');
  const shown = filter === 'all' ? entries : entries.filter((e) => e.status === filter);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = notebook.importJson(await file.text());
      setMessage({ ok: true, text: t('notebook.imported', { n }) });
    } catch {
      setMessage({ ok: false, text: t('notebook.importError') });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <div className="section-title">
        <h1>{t('notebook.title')}</h1>
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={!entries.length}
            onClick={() =>
              downloadText(
                `chembridge-notebook-${new Date().toISOString().slice(0, 10)}.json`,
                notebook.exportJson(),
              )
            }
          >
            {t('notebook.export')}
          </button>
          <label className="btn btn-sm">
            {t('notebook.import')}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>
      <p className="muted">{t('notebook.intro')}</p>
      {!storageAvailable() && (
        <p className="notice notice-warn small">{t('notebook.storageWarning')}</p>
      )}
      {message && (
        <p className={`notice small ${message.ok ? '' : 'notice-warn'}`} role="status">
          {message.text}
        </p>
      )}
      {entries.length > 0 && (
        <div
          className="segmented"
          role="group"
          aria-label={t('notebook.status')}
          style={{ marginBottom: 12 }}
        >
          {(['all', ...STATUSES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === 'all' ? t('common.all') : t(`notebook.status.${s}`)} (
              {s === 'all' ? entries.length : entries.filter((e) => e.status === s).length})
            </button>
          ))}
        </div>
      )}
      {entries.length === 0 ? (
        <p className="notice">{t('notebook.empty')}</p>
      ) : (
        shown.map((e) => <Entry key={e.id} entry={e} />)
      )}
    </>
  );
}

function Entry({ entry }: { entry: NotebookEntry }) {
  const { t, pick, formatDate } = useI18n();
  const [note, setNote] = useState(entry.note);
  const idea = entry.idea;
  return (
    <article className="card note-entry" aria-labelledby={`n-${entry.id}`}>
      <div className="note-head">
        <div>
          <div className="chips" style={{ marginBottom: 6 }}>
            <span className="chip">{t('idea.layer', { l: idea.layer })}</span>
            <span className="chip chip-chem">
              {pick(chemShort(idea.cell.chem))} × {pick(csShort(idea.cell.cs))}
            </span>
          </div>
          <h2 id={`n-${entry.id}`} style={{ fontSize: '1.05rem' }}>
            {pick(idea.title)}
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            <Link to={`/item/${entry.itemId}`}>{entry.itemTitle}</Link> ·{' '}
            {t('notebook.savedAt', { date: formatDate(entry.savedAt) })}
          </p>
        </div>
        <label className="field" style={{ minWidth: 160 }}>
          <span>{t('notebook.status')}</span>
          <select
            className="input"
            value={entry.status}
            onChange={(e) => notebook.update(entry.id, { status: e.target.value as NoteStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`notebook.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>{pick(idea.summary)}</p>
      {pick(idea.researchQuestion) && (
        <p className="small">
          <strong>{t('idea.rq')}:</strong> {pick(idea.researchQuestion)}
        </p>
      )}
      <label className="field">
        <span>{t('notebook.note')}</span>
        <textarea
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== entry.note && notebook.update(entry.id, { note })}
        />
      </label>
      <div className="card-actions">
        <Link className="btn btn-sm" to={`/item/${entry.itemId}#ideas`}>
          {t('notebook.openItem')}
        </Link>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => window.confirm(t('notebook.deleteConfirm')) && notebook.remove(entry.id)}
        >
          {t('common.delete')}
        </button>
      </div>
    </article>
  );
}
