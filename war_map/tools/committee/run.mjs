// Rebuilds one county's Republican committee file from an official results export.
//
// Usage (from the repository root):
//   node war_map/tools/committee/run.mjs <county> --file <export> [--as-of YYYY-MM-DD] [--dry-run]
//
// The export is copied into war_map/tools/committee/.cache/ (git-ignored: it
// holds losing candidates' names, which committee files must not). The county file
// records the export's URL, date and SHA-256 so the numbers can be traced.
// Then war_map/committee/summary.json is rebuilt.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {basename, join, resolve} from 'node:path';
import {seats} from './lib/rules.mjs';
import {matchPrecincts} from './lib/match.mjs';
import {validate, countTotals} from './lib/validate.mjs';
import * as clarity from './lib/clarity.mjs';
import * as electionware from './lib/electionware.mjs';
import * as textreport from './lib/textreport.mjs';
import * as winners from './lib/winners.mjs';
import * as roster from './lib/roster.mjs';

const here = new URL('.', import.meta.url).pathname;
const mapDir = join(here, '../..');
const READERS = {clarity, electionware, textreport, winners, roster};

function args(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}
const fail = msg => { console.error('error: ' + msg); process.exit(1); };
const today = () => new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});

const a = args(process.argv.slice(2));
const want = (a._[0] || '').toLowerCase();
if (!want || !a.file) fail('usage: run.mjs <county> --file <export> [--as-of YYYY-MM-DD] [--dry-run]');
const manifest = JSON.parse(readFileSync(join(here, 'counties.json')));
const entry = manifest.counties.find(c => c.slug === want || c.county.toLowerCase() === want);
if (!entry) fail(`no county "${a._[0]}" in counties.json`);
const reader = READERS[entry.platform];
if (!reader) fail(`${entry.county} uses platform "${entry.platform}", which has no reader yet (have: ${Object.keys(READERS).join(', ')})`);
const cfg = entry[entry.platform];
if (entry.platform === 'clarity' && !cfg.version) fail(`${entry.county}: set clarity.version in counties.json (the number in the export's URL)`);
if (!existsSync(a.file)) fail(`no such file ${a.file}`);

// 1. Keep a fingerprinted copy of the raw export.
const raw = readFileSync(a.file);
const sha256 = createHash('sha256').update(raw).digest('hex');
const cacheDir = join(here, '.cache', entry.slug);
mkdirSync(cacheDir, {recursive: true});
const prefix = `${cfg.election_id || 'export'}-${cfg.version || 'x'}-`;
const cached = join(cacheDir, basename(a.file).startsWith(prefix) ? basename(a.file) : prefix + basename(a.file));
if (resolve(a.file) !== cached) copyFileSync(a.file, cached);

// 2. Read contests and turn them into seat statuses.
const {generated, contests} = reader.read(cached, cfg);
if (!contests.length) fail('no Republican committee contests found in the export; check contest_pattern');
const precincts = new Map();
for (const c of contests) {
  if (!precincts.has(c.precinct)) precincts.set(c.precinct, []);
  const won = seats(c);
  won.forEach((s, i) => precincts.get(c.precinct).push({seat: won.length > 1 ? `${c.seat} ${i + 1}` : c.seat, ...s}));
}
const seatOrder = s => /woman/i.test(s.seat) ? 1 : 0;
const mapFile = join(mapDir, 'data', entry.slug + '.json');
const mapPrecincts = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile)).precincts.map(({id, name, municipality}) => ({id, name, municipality})) : null;
const {ids: mapIds} = mapPrecincts ? matchPrecincts([...precincts.keys()], mapPrecincts) : {ids: new Map()};
const precinctList = [...precincts].map(([name, list]) => ({name, ...(mapIds.has(name) ? {map_id: mapIds.get(name)} : {}),
  seats: list.sort((x, y) => seatOrder(x) - seatOrder(y))}));
const seatCounts = new Set(precinctList.map(p => p.seats.length));

// 3. Assemble the county file.
const asOf = a['as-of'] || generated || today();
const totals = countTotals(precinctList);
const doc = {
  county: entry.county,
  checked_at: today(),
  method: 'election_results',
  election: entry.election,
  as_of: asOf,
  seats_per_precinct: seatCounts.size === 1 ? [...seatCounts][0] : null,
  sources: reader.sources(cfg, {county: entry.county, election: entry.election, file: basename(cached).replace(prefix, ''), generated, asOf, sha256}),
  precincts: precinctList,
  totals,
  notes: [
    `Built by war_map/tools/committee/run.mjs from the official ${entry.election} results for every Republican county committee contest (${contests.length} contests).`,
    'A seat is filled when a named candidate had the most votes, and holder is that winner\'s name as printed in the results; empty when no candidate was on the ballot and no write-in votes were cast; unknown when only write-in votes were cast (public results don\'t name write-in winners, who may also have declined) or when the result was tied or a named candidate had zero votes.',
    'Appointments made since the election are not counted.',
    entry.notes || ''
  ].filter(Boolean).join(' ')
};

// 4. Check it.
const {errors, warnings} = validate(doc, {mapPrecincts});

// 5. Report, compared with the file it replaces.
const outFile = join(mapDir, 'committee', entry.slug + '.json');
const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile)) : null;
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '-';
const line = (label, t, method) => `  ${label.padEnd(7)} ${String(method).padEnd(18)} precincts ${t.precincts}  seats ${t.seats}  filled ${t.filled}  empty ${t.empty}  no-filer ${t.empty_no_filer || 0}  unknown ${t.unknown}  (empty share ${pct(t.empty + (t.empty_no_filer || 0), t.seats)})`;
console.log(`${entry.county}: ${contests.length} contests read from ${basename(a.file)} (sha256 ${sha256.slice(0, 12)}..., generated ${generated || 'unknown'})`);
if (prev) console.log(line('before', prev.totals, prev.method));
console.log(line('after', totals, doc.method));
for (const w of warnings) console.log('  warning: ' + w);
if (errors.length) { for (const e of errors) console.error('  error: ' + e); process.exit(1); }

if (a.dryRun) { console.log('dry run: nothing written'); process.exit(0); }
writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n');
console.log('wrote ' + outFile.replace(mapDir + '/', 'war_map/'));
execFileSync('node', [join(here, '../build-committee-summary.mjs')], {stdio: 'inherit'});
