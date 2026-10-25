import { XMLParser } from 'fast-xml-parser';

const ARRAY_TAGS = new Set([
  'entry',
  'item',
  'author',
  'link',
  'category',
  'dc:creator',
  'dc:subject',
]);

/** Parser shared by Atom (arXiv), RSS 2.0 and RSS 1.0/RDF feeds. */
export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: false,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Returns the text of a node that may be a string, `{ '#text': ... }` or an array of those. */
export function text(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object' && '#text' in node)
    return text((node as Record<string, unknown>)['#text']);
  return undefined;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}
