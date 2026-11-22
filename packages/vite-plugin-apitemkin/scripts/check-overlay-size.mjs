// Fails the publish gate when the overlay bundle exceeds its budget.
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LIMIT = 153600; // bytes, minified JS+CSS (owner decision 2026-11-22: 150 kB)
const file = fileURLToPath(new URL('../dist/devtools.client.js', import.meta.url));
const size = statSync(file).size;

console.log(`devtools.client.js: ${size} bytes (limit ${LIMIT})`);
if (size > LIMIT) {
  console.error(`apitemkin: overlay bundle is ${size - LIMIT} bytes over budget`);
  process.exit(1);
}
