/**
 * Writes the domain model as JSON Schema (draft 2020-12) so other runtimes (e.g. the optional
 * Java/Spring backend of Option B) can validate the same records.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PUBLIC_SCHEMAS } from '../src/schema.ts';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema');
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(PUBLIC_SCHEMAS)) {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' });
  const file = join(outDir, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify({ title: name, ...json }, null, 2) + '\n');
  console.log(`wrote ${file}`);
}
