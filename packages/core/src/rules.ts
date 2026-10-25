/**
 * Typed access to the rule files in `packages/core/rules/`. The JSON files are the shared,
 * language-neutral definition; this module only types and compiles them.
 */
import ideasJson from '../rules/ideas.json';
import scoringJson from '../rules/scoring.json';
import taxonomyJson from '../rules/taxonomy.json';
import type { I18nText } from './schema.ts';

export interface Term {
  re: string;
  w: number;
  cs?: boolean;
}

export interface Dataset {
  name: string;
  url?: string;
}

export interface ChemNode {
  id: string;
  label: I18nText;
  short: I18nText;
  terms: Term[];
  hints: Record<string, number>;
  defaultCs: string[];
  datasets: Dataset[];
  venues: string[];
  stack: string[];
}

export interface CsNode {
  id: string;
  label: I18nText;
  short: I18nText;
  points: number;
  terms: Term[];
  stack: string[];
  venues: string[];
  baselines: string[];
}

export interface Taxonomy {
  version: number;
  minChemConfidence: number;
  minChemConfidenceNonChemSource: number;
  /** Distinct chemistry terms required for records from non-chemistry sources (unless one is in the title). */
  minChemTermsNonChemSource: number;
  chem: ChemNode[];
  cs: CsNode[];
}

export interface PointRule {
  id: string;
  label: I18nText;
  re: string;
  points: number;
  cs?: boolean;
}

export interface PenaltyRule extends PointRule {
  field: 'title' | 'abstract';
}

export interface ScoringRules {
  version: number;
  titleMultiplier: number;
  components: {
    csTechniques: {
      max: number;
      label: I18nText;
      crossListBonus: number;
      crossListLabel: I18nText;
    };
    dataIntensity: { max: number; label: I18nText; rules: PointRule[] };
    openArtifacts: {
      max: number;
      label: I18nText;
      linkPoints: Record<'code' | 'data' | 'model', number>;
      linkLabels: Record<'code' | 'data' | 'model', I18nText>;
      githubSignalPoints: number;
      githubSignalLabel: I18nText;
      rules: PointRule[];
    };
    problemType: { max: number; label: I18nText; rules: PointRule[] };
  };
  penalties: PenaltyRule[];
  inference: { maxInferred: number; rules: Array<{ when: string; cs: string[]; w?: number }> };
}

export type IdeaMode = 'existing' | 'inferred' | 'any';

export interface IdeaTemplate {
  id: string;
  priority: number;
  difficulty: number;
  appliesTo: {
    cs?: string[];
    mode: IdeaMode;
    chemBonus?: string[];
    signalsAny?: string[];
  };
  title: I18nText;
  summary: I18nText;
  researchQuestion: I18nText;
  method: I18nText[];
  evaluation: I18nText;
}

export interface IdeaRules {
  version: number;
  direction: 'academic';
  metrics: Record<string, I18nText>;
  whyNow: Record<string, I18nText>;
  joiners: { and: I18nText };
  templates: IdeaTemplate[];
}

export const TAXONOMY = taxonomyJson as unknown as Taxonomy;
export const SCORING = scoringJson as unknown as ScoringRules;
export const IDEAS = ideasJson as unknown as IdeaRules;

export interface Rules {
  taxonomy: Taxonomy;
  scoring: ScoringRules;
  ideas: IdeaRules;
}

export const DEFAULT_RULES: Rules = { taxonomy: TAXONOMY, scoring: SCORING, ideas: IDEAS };

/** Combined version of all rule files; changes whenever any of them is bumped. */
export function rulesVersion(r: Rules = DEFAULT_RULES): number {
  return r.taxonomy.version * 10000 + r.scoring.version * 100 + r.ideas.version;
}

const chemById = new Map<string, ChemNode>();
const csById = new Map<string, CsNode>();
for (const c of TAXONOMY.chem) chemById.set(c.id, c);
for (const c of TAXONOMY.cs) csById.set(c.id, c);

export function chemNode(id: string): ChemNode | undefined {
  return chemById.get(id);
}

export function csNode(id: string): CsNode | undefined {
  return csById.get(id);
}

const regexCache = new Map<string, RegExp>();

export function compileTerm(re: string, caseSensitive = false): RegExp {
  const key = (caseSensitive ? 'c:' : 'i:') + re;
  let compiled = regexCache.get(key);
  if (!compiled) {
    compiled = new RegExp(re, caseSensitive ? '' : 'i');
    regexCache.set(key, compiled);
  }
  return compiled;
}

/** Every label a rule id can have, for UIs that render score reasons. */
export function ruleLabel(id: string, r: Rules = DEFAULT_RULES): I18nText | undefined {
  const cs = r.taxonomy.cs.find((c) => c.id === id);
  if (cs) return cs.label;
  const comps = r.scoring.components;
  for (const rule of [
    ...comps.dataIntensity.rules,
    ...comps.openArtifacts.rules,
    ...comps.problemType.rules,
    ...r.scoring.penalties,
  ]) {
    if (rule.id === id) return rule.label;
  }
  if (id === 'crossList') return comps.csTechniques.crossListLabel;
  if (id === 'github') return comps.openArtifacts.githubSignalLabel;
  if (id === 'artifact.code') return comps.openArtifacts.linkLabels.code;
  if (id === 'artifact.data') return comps.openArtifacts.linkLabels.data;
  if (id === 'artifact.model') return comps.openArtifacts.linkLabels.model;
  return undefined;
}
