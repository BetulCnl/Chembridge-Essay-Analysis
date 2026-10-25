/**
 * Prompt construction and output parsing for Layer B (local model) and Layer C (user's own
 * key). Small local models often produce imperfect JSON, so parsing is deliberately forgiving.
 */
import { chemNode, csNode } from './rules.ts';
import type { I18nText, Idea } from './schema.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PromptItem {
  id: string;
  title: string;
  venue: string;
  publishedAt: string;
  abstractExcerpt: string;
  chem: Array<{ id: string }>;
  cs: Array<{ id: string; inferred: boolean }>;
  problemTypes: string[];
  signals: string[];
}

export function buildIdeaPrompt(item: PromptItem, seeds: Idea[], lang: 'tr' | 'en'): ChatMessage[] {
  const language = lang === 'tr' ? 'Turkish' : 'English';
  const chem = item.chem.map((c) => chemNode(c.id)?.label.en ?? c.id).join(', ') || 'chemistry';
  const used = item.cs.filter((c) => !c.inferred).map((c) => csNode(c.id)?.label.en ?? c.id);
  const potential = item.cs.filter((c) => c.inferred).map((c) => csNode(c.id)?.label.en ?? c.id);
  const seedTitles = seeds.map((s) => `- ${s.title.en}`).join('\n');
  const system =
    'You are a research advisor at the intersection of chemistry and computer science. ' +
    'You propose concrete, feasible academic research projects for a software engineer with access to free tools and public data. ' +
    'Never invent datasets, papers or results; name only well-known public resources. Answer with JSON only.';
  const user = [
    `Development: "${item.title}" (${item.venue}, ${item.publishedAt})`,
    item.abstractExcerpt ? `Abstract excerpt: ${item.abstractExcerpt}` : '',
    `Chemistry sub-fields: ${chem}`,
    used.length
      ? `CS techniques already used: ${used.join(', ')}`
      : 'CS techniques already used: none',
    potential.length ? `Potential CS techniques: ${potential.join(', ')}` : '',
    item.problemTypes.length ? `Problem types: ${item.problemTypes.join(', ')}` : '',
    '',
    'Template-based ideas already shown to the user (do NOT repeat them):',
    seedTitles || '- (none)',
    '',
    `Propose 3 NEW, more creative academic research ideas. Write all text in ${language}.`,
    'Return a JSON array of 3 objects with exactly these keys:',
    '{"title": string, "summary": string (2-3 sentences), "researchQuestion": string, "method": [string, string, string], ' +
      '"evaluation": string, "difficulty": integer 1-5, "requiredData": [string], "stack": [string], "whyNow": [string]}',
  ]
    .filter((l) => l !== '')
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function extractJsonArray(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const slice = body.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // Common small-model glitches: trailing commas, smart quotes.
      try {
        return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'));
      } catch {
        /* fall through */
      }
    }
  }
  const objStart = body.indexOf('{');
  const objEnd = body.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const obj = JSON.parse(body.slice(objStart, objEnd + 1)) as Record<string, unknown>;
      return Array.isArray(obj.ideas) ? obj.ideas : [obj];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown) =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === 'string' && v ? [v] : [];
const same = (s: string): I18nText => ({ tr: s, en: s });

/** Turns model output into ideas; returns undefined when nothing usable was found. */
export function parseGeneratedIdeas(
  text: string,
  item: PromptItem,
  layer: 'B' | 'C',
): Idea[] | undefined {
  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed)) return undefined;
  const chem = item.chem[0]?.id ?? 'general';
  const cs = item.cs[0];
  const ideas: Idea[] = [];
  parsed.slice(0, 5).forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const o = raw as Record<string, unknown>;
    const title = str(o.title);
    const summary = str(o.summary);
    if (!title || !summary) return;
    const difficulty = Math.max(1, Math.min(5, Math.round(Number(o.difficulty) || 3)));
    ideas.push({
      id: `${item.id}:${layer}:${Date.now().toString(36)}:${i}`,
      itemId: item.id,
      templateId: `model-${layer}`,
      direction: 'academic',
      layer,
      cell: { chem, cs: cs?.id ?? 'ml', inferred: cs?.inferred ?? true },
      title: same(title),
      summary: same(summary),
      researchQuestion: same(str(o.researchQuestion)),
      method: strs(o.method).slice(0, 6).map(same),
      evaluation: same(str(o.evaluation)),
      difficulty,
      requiredData: strs(o.requiredData)
        .slice(0, 5)
        .map((name) => ({ name })),
      stack: strs(o.stack).slice(0, 6),
      whyNow: strs(o.whyNow).slice(0, 3).map(same),
      venues: [],
      similar: [],
    });
  });
  return ideas.length ? ideas : undefined;
}
