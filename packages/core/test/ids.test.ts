import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  canonicalKey,
  developmentId,
  findDoi,
  normalizeArxivId,
  normalizeDoi,
  normalizeTitle,
  titleKey,
} from '../src/ids.ts';

describe('normalizeDoi', () => {
  it('strips resolver prefixes, case and trailing punctuation', () => {
    expect(normalizeDoi('https://doi.org/10.1021/JACS.6B01234.')).toBe('10.1021/jacs.6b01234');
    expect(normalizeDoi('doi:10.1038/s41557-026-02269-5')).toBe('10.1038/s41557-026-02269-5');
    expect(normalizeDoi('https://doi.org/10.1002%2Fanie.202600001')).toBe('10.1002/anie.202600001');
  });

  it('folds both ChemRxiv version styles into one DOI', () => {
    expect(normalizeDoi('10.26434/chemrxiv.15010256/v2')).toBe('10.26434/chemrxiv.15010256');
    expect(normalizeDoi('10.26434/chemrxiv-2024-abc12-v3')).toBe('10.26434/chemrxiv-2024-abc12');
  });

  it('returns undefined for non-DOIs', () => {
    expect(normalizeDoi('not a doi')).toBeUndefined();
    expect(normalizeDoi(undefined)).toBeUndefined();
  });

  it('finds DOIs in free text', () => {
    expect(findDoi('Nature Chemistry, Published online; doi:10.1038/s41557-026-02269-5</a>')).toBe(
      '10.1038/s41557-026-02269-5',
    );
  });
});

describe('normalizeArxivId', () => {
  it('handles abs URLs, versions and arXiv DOIs', () => {
    expect(normalizeArxivId('http://arxiv.org/abs/2610.01234v2')).toBe('2610.01234');
    expect(normalizeArxivId('10.48550/arXiv.2610.01234')).toBe('2610.01234');
    expect(normalizeArxivId('hep-th/9901001v1')).toBe('hep-th/9901001');
  });
});

describe('titles', () => {
  it('normalizes accents, markup and punctuation', () => {
    expect(normalizeTitle('Café: <i>Li</i>-ion  “Batteries”!')).toBe('cafe li ion batteries');
  });

  it('refuses generic short titles as dedup keys', () => {
    expect(titleKey('Editorial')).toBeUndefined();
    expect(titleKey('Graph neural networks for catalyst screening')).toBe(
      'graph neural networks for catalyst screening',
    );
  });
});

describe('ids', () => {
  it('prefers a version-of-record DOI, then arXiv id, then title', () => {
    expect(canonicalKey({ doi: '10.1/x', arxivId: '2601.00001', title: 't', url: 'u' })).toBe(
      'doi:10.1/x',
    );
    expect(canonicalKey({ doi: '10.48550/arxiv.2601.00001', title: 't', url: 'u' })).toBe(
      'arxiv:2601.00001',
    );
    expect(canonicalKey({ title: 'A sufficiently long title for a key', url: 'u' })).toBe(
      'title:a sufficiently long title for a key',
    );
  });

  it('is stable and URL-safe', () => {
    const id = developmentId({ doi: '10.1021/jacs.6b01234', title: 'x', url: 'y' });
    expect(id).toMatch(/^[0-9a-z]+$/);
    expect(developmentId({ doi: '10.1021/jacs.6b01234', title: 'other', url: 'z' })).toBe(id);
  });

  it('buckets deterministically', () => {
    const b = bucketOf('abc', 64);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(64);
    expect(bucketOf('abc', 64)).toBe(b);
  });
});
