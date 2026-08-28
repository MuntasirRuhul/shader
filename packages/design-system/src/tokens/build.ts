import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitTokensCss } from './emit';
import { tokens } from './tokens';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, 'generated', 'tokens.css');

try {
  const css = emitTokensCss(tokens);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, css, 'utf8');
  console.log(`Wrote ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
