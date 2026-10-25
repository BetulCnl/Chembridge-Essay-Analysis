# Test fixtures

Recorded from the live APIs with `pnpm pipeline fixtures:record` on 2026-10-24 and trimmed to a few
items (see `src/stages/probe.ts` for the exact requests):

`arxiv.xml`, `crossref-chemrxiv.json`, `crossref-journal.json`, `biorxiv.json`, `europepmc.json`,
`openalex.json`, `pubchem.json`, `hn.json`, `rss-*.xml`.

**Hand-written** (the live endpoints could not be recorded from the development environment):

- `semanticscholar.json` — the anonymous shared pool answered `429 Too Many Requests` during
  recording. The file follows the documented `POST /graph/v1/paper/batch` response shape
  (array aligned with the requested ids, `null` for unknown ids).
- `github.json` — the development sandbox only allows repository-scoped GitHub API calls. The file
  follows the documented `GET /search/repositories` response shape; repository names are fictitious.

Re-record (and replace the hand-written files) with `pnpm pipeline fixtures:record` from a machine
that can reach both services; the tests only rely on documented fields.
