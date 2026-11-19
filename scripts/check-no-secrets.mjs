// Échoue si du code client (apps/mobile) référence un secret ou la clé Anthropic.
// Usage : node scripts/check-no-secrets.mjs [dossier-supplémentaire-à-scanner]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps/mobile/src', 'apps/mobile/app.json', ...process.argv.slice(2)];
const forbidden = [
  /sk-ant-[A-Za-z0-9_-]{10,}/,
  /ANTHROPIC_API_KEY/,
  /DEVICE_TOKEN_SECRET/,
  /@anthropic-ai\/sdk/,
  /api\.anthropic\.com/,
];

function walk(path) {
  const st = statSync(path);
  if (st.isFile()) return [path];
  return readdirSync(path).flatMap((name) =>
    name === 'node_modules' ? [] : walk(join(path, name)),
  );
}

const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const re of forbidden) if (re.test(text)) hits.push(`${file}: ${re}`);
  }
}
if (hits.length) {
  console.error('Secrets ou références interdites dans le code client :\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`OK : aucun secret dans ${roots.join(', ')}`);
