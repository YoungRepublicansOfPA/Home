// Builds war_map/committee/summary.json from the per-county committee files.
// Usage (from the repository root): node war_map/tools/build-committee-summary.mjs
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
const dir = new URL('../committee/', import.meta.url).pathname;
const counties = {};
const total = {seats: 0, filled: 0, empty: 0, empty_no_filer: 0, unknown: 0};
for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'summary.json').sort()) {
  const d = JSON.parse(readFileSync(join(dir, file)));
  const t = d.totals;
  for (const k of Object.keys(total)) total[k] += t[k] || 0;
  counties[d.county] = {
    method: d.method, election: d.election || null, as_of: d.as_of || null, checked_at: d.checked_at,
    precincts: t.precincts, seats: t.seats, filled: t.filled, empty: t.empty,
    empty_no_filer: t.empty_no_filer || 0, unknown: t.unknown,
    sources: (d.sources || []).map(s => ({url: s.url, title: s.title, type: s.type})), file
  };
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify({built_from: 'war_map/committee/*.json', total, counties}, null, 1) + '\n');
console.log(Object.keys(counties).length + ' counties', total);
