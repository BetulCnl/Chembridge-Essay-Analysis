import MiniSearch from 'minisearch';
import { loadSearchDocs, type SearchDoc } from './data.ts';

let index: Promise<MiniSearch<SearchDoc>> | undefined;

/** Builds the in-browser full-text index on first use (search.json is only fetched then). */
export function getSearchIndex(): Promise<MiniSearch<SearchDoc>> {
  index ??= loadSearchDocs().then((docs) => {
    const ms = new MiniSearch<SearchDoc>({
      fields: ['title', 'keywords', 'authors', 'text'],
      idField: 'id',
      searchOptions: {
        boost: { title: 3, keywords: 2, authors: 1.5 },
        prefix: true,
        fuzzy: 0.15,
        combineWith: 'AND',
      },
    });
    ms.addAll(docs);
    return ms;
  });
  index.catch(() => (index = undefined));
  return index;
}

/** id → relevance score for a query. */
export async function searchIds(query: string): Promise<Map<string, number>> {
  const ms = await getSearchIndex();
  return new Map(ms.search(query).map((r) => [String(r.id), r.score]));
}
