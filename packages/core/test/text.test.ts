import { describe, expect, it } from 'vitest';
import {
  dataDoiLinks,
  excerpt,
  extractArtifactLinks,
  extractKeyphrases,
  stripMarkup,
  toIsoDate,
} from '../src/text.ts';

describe('stripMarkup', () => {
  it('removes JATS and HTML and decodes entities', () => {
    expect(
      stripMarkup(
        '<jats:title>Abstract</jats:title><jats:p>CO&lt;2&gt; &amp; H<sub>2</sub>O</jats:p>',
      ),
    ).toBe('CO<2> & H2O');
  });

  it('removes inline tags that arrive entity-escaped', () => {
    expect(stripMarkup('Evidence for multi-Li&lt;sup&gt;+&lt;/sup&gt; clustering')).toBe(
      'Evidence for multi-Li+ clustering',
    );
  });

  it('drops a leading "Abstract" label', () => {
    expect(stripMarkup('Abstract: We report')).toBe('We report');
  });
});

describe('excerpt', () => {
  it('keeps short text and cuts long text at a sentence end', () => {
    expect(excerpt('Short.', 600)).toBe('Short.');
    const long = 'First sentence is here. ' + 'word '.repeat(200);
    const cut = excerpt(long, 100);
    expect(cut.length).toBeLessThanOrEqual(101);
    expect(cut.endsWith('…') || cut.endsWith('.')).toBe(true);
  });
});

describe('artifact links', () => {
  it('classifies code, data and model hosts', () => {
    const links = extractArtifactLinks(
      'Code: https://github.com/org/repo. Data at https://zenodo.org/records/123, model https://huggingface.co/org/m and https://huggingface.co/datasets/org/d',
    );
    expect(links.map((l) => [l.kind, l.host])).toEqual([
      ['code', 'github.com'],
      ['data', 'zenodo.org'],
      ['model', 'huggingface.co'],
      ['data', 'huggingface.co'],
    ]);
    expect(links[0]!.url).toBe('https://github.com/org/repo');
  });

  it('ignores bare hosts and unrelated sites', () => {
    expect(extractArtifactLinks('see https://github.com/ and https://example.org/x')).toEqual([]);
  });

  it('detects data repository DOIs', () => {
    expect(dataDoiLinks('available at 10.5281/zenodo.1234567.')).toEqual([
      { url: 'https://doi.org/10.5281/zenodo.1234567', kind: 'data', host: 'zenodo.org' },
    ]);
  });
});

describe('keyphrases and dates', () => {
  it('extracts non-stopword runs from the title', () => {
    const k = extractKeyphrases(
      'Graph neural networks for single-atom catalyst screening',
      'single-atom catalyst',
    );
    expect(k).toContain('single-atom catalyst screening');
  });

  it('formats dates in UTC', () => {
    expect(toIsoDate('Sat, 24 Oct 2026 17:00:01 EDT')).toBe('2026-10-24');
    expect(toIsoDate('garbage')).toBeUndefined();
  });
});
