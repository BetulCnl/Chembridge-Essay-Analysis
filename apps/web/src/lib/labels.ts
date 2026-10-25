import { chemNode, csNode, ruleLabel, TAXONOMY, type I18nText } from '@chembridge/core';

export const CHEM_IDS = TAXONOMY.chem.map((c) => c.id);
export const CS_IDS = TAXONOMY.cs.map((c) => c.id);

export function chemLabel(id: string): I18nText {
  return chemNode(id)?.label ?? { tr: id, en: id };
}

export function chemShort(id: string): I18nText {
  return chemNode(id)?.short ?? { tr: id, en: id };
}

export function csLabel(id: string): I18nText {
  return csNode(id)?.label ?? { tr: id, en: id };
}

export function csShort(id: string): I18nText {
  return csNode(id)?.short ?? { tr: id, en: id };
}

export function reasonLabel(id: string): I18nText {
  return ruleLabel(id) ?? { tr: id, en: id };
}

const SOURCE_NAMES: Record<string, string> = {
  arxiv: 'arXiv',
  chemrxiv: 'ChemRxiv',
  biorxiv: 'bioRxiv',
  medrxiv: 'medRxiv',
  europepmc: 'Europe PMC',
  'crossref-journals': 'Crossref (journals)',
  'rss:nchem': 'Nature Chemistry',
  'rss:nmat': 'Nature Materials',
  'rss:natcomputsci': 'Nature Computational Science',
  'rss:npjcompumats': 'npj Computational Materials',
  'rss:cen': 'C&EN',
  'rss:physorg-chem': 'Phys.org',
  'rss:sciencedaily-chem': 'ScienceDaily',
  rss: 'RSS',
  openalex: 'OpenAlex',
  semanticscholar: 'Semantic Scholar',
  pubchem: 'PubChem',
  github: 'GitHub',
  hn: 'Hacker News',
};

export function sourceName(id: string): string {
  return SOURCE_NAMES[id] ?? id;
}

/** Sources are grouped in filters: all RSS feeds count as one "news & journals (RSS)" group. */
export function sourceGroup(id: string): string {
  return id.startsWith('rss:') ? 'rss' : id;
}
