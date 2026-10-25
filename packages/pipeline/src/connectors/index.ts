import { arxivConnector } from './arxiv.ts';
import { biorxivConnector, medrxivConnector } from './biorxiv.ts';
import { chemrxivConnector, crossrefJournalsConnector } from './crossref.ts';
import { europepmcConnector } from './europepmc.ts';
import { rssConnector } from './rss.ts';
import type { Connector } from './types.ts';

/** All collection connectors, in run order. Add new sources here (see docs/ADDING_A_SOURCE.md). */
export const CONNECTORS: Connector[] = [
  arxivConnector,
  chemrxivConnector,
  biorxivConnector,
  medrxivConnector,
  europepmcConnector,
  crossrefJournalsConnector,
  rssConnector,
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}
