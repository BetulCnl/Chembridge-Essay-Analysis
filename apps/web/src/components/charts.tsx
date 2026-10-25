/**
 * Small SVG charts: a sparkline (one series, 2px line, end marker) and mini bars, both with a
 * hover/focus readout. Text uses text tokens; the mark uses the accent token.
 */
import { useId, useState, type KeyboardEvent } from 'react';

interface SeriesProps {
  values: number[];
  labels: string[];
  ariaLabel: string;
  width?: number;
  height?: number;
}

function Readout({ text }: { text: string | undefined }) {
  return (
    <span
      className="small muted"
      style={{ display: 'block', minHeight: '1.3em', fontVariantNumeric: 'tabular-nums' }}
      aria-live="polite"
    >
      {text ?? ' '}
    </span>
  );
}

function useHover(n: number) {
  const [i, setI] = useState<number | undefined>();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setI((x) => Math.min(n - 1, (x ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, (x ?? n) - 1));
    else return;
    e.preventDefault();
  };
  return { i, setI, onKeyDown };
}

export function Sparkline({ values, labels, ariaLabel, width = 132, height = 30 }: SeriesProps) {
  const id = useId();
  const { i, setI, onKeyDown } = useHover(values.length);
  const max = Math.max(1, ...values);
  const pad = 4;
  const x = (k: number) => pad + (k * (width - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - 2 * pad);
  const points = values.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  const shown = i ?? undefined;
  return (
    <span style={{ display: 'inline-block' }}>
      <svg
        className="sparkline"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setI(undefined)}
        onPointerLeave={() => setI(undefined)}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * width;
          setI(Math.max(0, Math.min(last, Math.round(((rel - pad) / (width - 2 * pad)) * last))));
        }}
      >
        <title id={`${id}-t`}>{ariaLabel}</title>
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {shown !== undefined && (
          <line
            x1={x(shown)}
            x2={x(shown)}
            y1={pad}
            y2={height - pad}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
        )}
        <circle
          cx={x(shown ?? last)}
          cy={y(values[shown ?? last] ?? 0)}
          r={4}
          fill="currentColor"
          stroke="var(--surface)"
          strokeWidth={2}
        />
      </svg>
      <Readout text={shown !== undefined ? `${labels[shown]}: ${values[shown]}` : undefined} />
    </span>
  );
}

export function MiniBars({ values, labels, ariaLabel, width = 150, height = 40 }: SeriesProps) {
  const id = useId();
  const { i, setI, onKeyDown } = useHover(values.length);
  const max = Math.max(1, ...values);
  const gap = 2;
  const bw = (width - gap * (values.length - 1)) / values.length;
  return (
    <span style={{ display: 'inline-block' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setI(undefined)}
        onPointerLeave={() => setI(undefined)}
        style={{ color: 'var(--accent)' }}
      >
        <title id={`${id}-t`}>{ariaLabel}</title>
        {values.map((v, k) => {
          const h = Math.max(v > 0 ? 2 : 0, (v / max) * (height - 2));
          const bx = k * (bw + gap);
          return (
            <g key={k} onPointerEnter={() => setI(k)}>
              <rect x={bx} y={0} width={bw} height={height} fill="transparent" />
              {h > 4 && bw > 8 ? (
                <path
                  d={`M${bx},${height} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`}
                  fill="currentColor"
                  opacity={i === undefined || i === k ? 1 : 0.55}
                />
              ) : (
                <rect
                  x={bx}
                  y={height - h}
                  width={bw}
                  height={h}
                  fill="currentColor"
                  opacity={i === undefined || i === k ? 1 : 0.55}
                />
              )}
            </g>
          );
        })}
        <line
          x1={0}
          x2={width}
          y1={height - 0.5}
          y2={height - 0.5}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
      </svg>
      <Readout text={i !== undefined ? `${labels[i]}: ${values[i]}` : undefined} />
    </span>
  );
}
