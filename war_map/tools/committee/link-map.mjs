// Sets precincts[].map_id in every county committee file (or the counties named),
// linking each precinct to the map's record in war_map/data/<county>.json when the
// match is unambiguous (lib/match.mjs). Nothing else in the files changes.
// Then rebuilds committee/summary.json.
//
// Usage (from the repository root):
//   node war_map/tools/committee/link-map.mjs [county ...] [--dry-run]
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {matchPrecincts} from './lib/match.mjs';
import {validate} from './lib/validate.mjs';

const here = new URL('.', import.meta.url).pathname;
const mapDir = join(here, '../..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const want = new Set(args.filter(a => !a.startsWith('--')).map(a => a.toLowerCase()));
const files = readdirSync(join(mapDir, 'committee')).filter(f => f.endsWith('.json') && f !== 'summary.json')
  .filter(f => !want.size || want.has(f.slice(0, -5)));

let total = 0, linked = 0, failed = false;
for (const f of files.sort()) {
  const path = join(mapDir, 'committee', f), text = readFileSync(path, 'utf8');
  const doc = JSON.parse(text);
  const mapFile = join(mapDir, 'data', f);
  if (!existsSync(mapFile)) { console.log(`${doc.county}: no map file, skipped`); continue; }
  const mapPrecincts = JSON.parse(readFileSync(mapFile)).precincts.map(({id, name, municipality}) => ({id, name, municipality}));
  const {ids, unmatched} = matchPrecincts(doc.precincts.map(p => p.name), mapPrecincts);
  // Rebuild each precinct with map_id right after name, so the files read naturally.
  doc.precincts = doc.precincts.map(({name, map_id, seats, ...rest}) => ({name, ...(ids.has(name) ? {map_id: ids.get(name)} : {}), ...rest, seats}));
  const {errors} = validate(doc, {mapPrecincts});
  total += doc.precincts.length; linked += ids.size;
  console.log(`${doc.county.padEnd(15)} ${String(ids.size).padStart(5)} of ${String(doc.precincts.length).padEnd(5)} linked` +
    (unmatched.length ? `  unmatched e.g. ${unmatched.slice(0, 2).join('; ')}` : ''));
  if (errors.length) { failed = true; for (const e of errors) console.error('  error: ' + e); continue; }
  const indent = (text.match(/\n( +)"/) || [, '  '])[1].length;
  if (!dryRun) writeFileSync(path, JSON.stringify(doc, null, indent) + '\n');
}
console.log(`linked ${linked} of ${total} committee precincts to the map${dryRun ? ' (dry run: nothing written)' : ''}`);
if (failed) process.exit(1);
if (!dryRun) execFileSync('node', [join(here, '../build-committee-summary.mjs')], {stdio: 'inherit'});
