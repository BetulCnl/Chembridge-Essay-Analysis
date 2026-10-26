import { BookmarkPlus, Download, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/common.tsx';
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
      <header className="page-head page-head-row">
        <div>
          <h1>{t('notebook.title')}</h1>
          <p className="lead">{t('notebook.intro')}</p>
        </div>
        <div className="btn-row">
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
            <Download size={14} aria-hidden="true" />
            {t('notebook.export')}
          </button>
          <label className="btn btn-sm">
            <Upload size={14} aria-hidden="true" />
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
      </header>
      {!storageAvailable() && (
        <p className="notice notice-warn" style={{ marginBottom: 16 }}>
          {t('notebook.storageWarning')}
        </p>
      )}
      {message && (
        <p
          className={`notice ${message.ok ? 'notice-ok' : 'notice-warn'}`}
          role="status"
          style={{ marginBottom: 16 }}
        >
          {message.text}
        </p>
      )}
      {entries.length === 0 ? (
        <EmptyState
          title={t('notebook.emptyTitle')}
          icon={<BookmarkPlus size={28} strokeWidth={1.5} aria-hidden="true" />}
        >
          <p className="small">{t('notebook.empty')}</p>
          <Link className="btn btn-sm btn-primary" to="/">
            {t('notebook.browse')}
          </Link>
        </EmptyState>
      ) : (
        <>
          <div
            className="segmented"
            role="group"
            aria-label={t('notebook.status')}
            style={{ marginBottom: 16 }}
          >
            {(['all', ...STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
              >
                {s === 'all' ? t('common.all') : t(`notebook.status.${s}`)}{' '}
                <span className="num muted">
                  {s === 'all' ? entries.length : entries.filter((e) => e.status === s).length}
                </span>
              </button>
            ))}
          </div>
          {shown.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </>
      )}
    </>
  );
}

function Entry({ entry }: { entry: NotebookEntry }) {
  const { t, pick, formatDate } = useI18n();
  const [note, setNote] = useState(entry.note);
  const idea = entry.idea;
  return (
    <article className="card note" aria-labelledby={`n-${entry.id}`}>
      <div className="note-head">
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <p className="idea-kicker" style={{ marginBottom: 4 }}>
            {pick(chemShort(idea.cell.chem))} × {pick(csShort(idea.cell.cs))}
            {idea.layer !== 'A' && <span>· {t('idea.layer', { l: idea.layer })}</span>}
          </p>
          <h2 id={`n-${entry.id}`}>{pick(idea.title)}</h2>
          <p className="note-source">
            <Link to={`/item/${entry.itemId}#ideas`}>{entry.itemTitle}</Link> ·{' '}
            {t('notebook.savedAt', { date: formatDate(entry.savedAt) })}
          </p>
        </div>
        <label>
          <span className="sr-only">{t('notebook.status')}</span>
          <select
            className="input status-select"
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
      <div className="note-body">
        <p>{pick(idea.summary)}</p>
        {pick(idea.researchQuestion) && (
          <div className="idea-rq">
            <strong>{t('idea.rq')}</strong>
            {pick(idea.researchQuestion)}
          </div>
        )}
      </div>
      <label className="field" style={{ marginTop: 14 }}>
        <span className="field-label">{t('notebook.note')}</span>
        <textarea
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== entry.note && notebook.update(entry.id, { note })}
        />
      </label>
      <div className="note-foot">
        <span />
        <button
          type="button"
          className="btn btn-sm btn-quiet btn-danger"
          onClick={() => window.confirm(t('notebook.deleteConfirm')) && notebook.remove(entry.id)}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('common.delete')}
        </button>
      </div>
    </article>
  );
}
