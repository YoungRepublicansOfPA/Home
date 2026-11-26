// Adds seat-holder names to a county committee file whose seat statuses were already
// checked, without changing any status. Use it when a full re-import (run.mjs) would
// lose information, for example when the Summary CSV leaves out write-in rows (York)
// or the county file applies its own documented rules (Crawford, Delaware).
//
// For each precinct, the seats already marked filled get the names of the top ballot
// candidates by votes, one name per filled seat. A precinct is skipped and reported,
// never guessed, when its filled seats don't line up with the export: no matching
// contest, fewer ballot candidates with votes than filled seats, or a tie at the cutoff.
//
// Usage (from the repository root):
//   node war_map/tools/committee/add-holders.mjs <county> --file <export> [--dry-run]
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {basename, join, resolve} from 'node:path';
import {validate} from './lib/validate.mjs';
import {matchPrecincts} from './lib/match.mjs';
import * as clarity from './lib/clarity.mjs';
import * as electionware from './lib/electionware.mjs';
import * as textreport from './lib/textreport.mjs';
import * as winners from './lib/winners.mjs';
import * as roster from './lib/roster.mjs';
import * as htmllines from './lib/htmllines.mjs';

const here = new URL('.', import.meta.url).pathname;
const mapDir = join(here, '../..');
const READERS = {clarity, electionware, textreport, winners, roster, htmllines};
const fail = msg => { console.error('error: ' + msg); process.exit(1); };
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const fileArg = argv[argv.indexOf('--file') + 1];
const want = (argv.find(a => !a.startsWith('--') && a !== fileArg) || '').toLowerCase();
if (!want || !argv.includes('--file') || !fileArg) fail('usage: add-holders.mjs <county> --file <export> [--dry-run]');

const manifest = JSON.parse(readFileSync(join(here, 'counties.json')));
const entry = manifest.counties.find(c => c.slug === want || c.county.toLowerCase() === want);
if (!entry) fail(`no county "${want}" in counties.json`);
const reader = READERS[entry.platform];
if (!reader) fail(`${entry.county} uses platform "${entry.platform}", which has no reader yet`);
const cfg = entry[entry.platform];
if (!cfg.version) fail(`${entry.county}: set ${entry.platform}.version in counties.json`);
if (!existsSync(fileArg)) fail(`no such file ${fileArg}`);

// Fingerprinted copy of the raw export, as run.mjs does.
const raw = readFileSync(fileArg);
const sha256 = createHash('sha256').update(raw).digest('hex');
const cacheDir = join(here, '.cache', entry.slug);
mkdirSync(cacheDir, {recursive: true});
const prefix = `${cfg.election_id}-${cfg.version}-`;
const cached = join(cacheDir, basename(fileArg).startsWith(prefix) ? basename(fileArg) : prefix + basename(fileArg));
if (resolve(fileArg) !== cached) copyFileSync(fileArg, cached);

const {generated, contests} = reader.read(cached, cfg);
if (!contests.length) fail('no Republican committee contests found; check clarity.contest_pattern and clarity.party');
const outFile = join(mapDir, 'committee', entry.slug + '.json');
const doc = JSON.parse(readFileSync(outFile));

const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
const seatKey = s => norm(s).replace(/[\s\d]+$/, '').replace(/\s+/g, ''); // "Committeeperson 1" -> "committeeperson"
// Some reports print each contest twice (a summary, then precinct sections). Identical copies
// are merged; copies that disagree make that contest unusable, so its precinct is skipped.
const byPrecinct = new Map(), conflicted = new Set();
const sig = c => JSON.stringify(c.choices.map(x => [x.name, x.votes, x.ballot]));
for (const c of contests) {
  const k = norm(c.precinct);
  if (!byPrecinct.has(k)) byPrecinct.set(k, []);
  const same = byPrecinct.get(k).find(x => x.seat === c.seat);
  if (same) { if (sig(same) !== sig(c)) conflicted.add(k); continue; }
  byPrecinct.get(k).push(c);
}

// Precinct names in the export that differ from the county file ("CHERRY" vs "Cherry Township")
// are matched one-to-one with the same matcher used for the map; ambiguous ones stay unmatched.
const exportNames = [...byPrecinct.keys()].map(k => ({id: k, name: byPrecinct.get(k)[0].precinct}));
const fileNames = doc.precincts.map(p => p.name).filter(n => !byPrecinct.has(norm(n)));
const {ids: fuzzy} = matchPrecincts(fileNames, exportNames.filter(e => !doc.precincts.some(p => norm(p.name) === e.id)));

let named = 0, skipped = [], cleared = 0;
for (const p of doc.precincts) {
  for (const s of p.seats) if (s.holder) { delete s.holder; cleared++; }
  const filled = p.seats.filter(s => s.status === 'filled');
  if (!filled.length) continue;
  const found = byPrecinct.get(norm(p.name)) || byPrecinct.get(fuzzy.get(p.name));
  if (!found) { skipped.push(`${p.name}: no contest in the export`); continue; }
  if (conflicted.has(norm(found[0].precinct))) { skipped.push(`${p.name}: the export prints this contest twice with different results`); continue; }
  // Which contest covers which seats: one contest for all seats (vote for N), or one per seat label.
  // A single contest electing every seat (York, Crawford: vote for 2) covers them all;
  // otherwise each contest covers the seats with its own label (Committeeman, Committeewoman).
  const groups = found.length === 1 && found[0].voteFor >= p.seats.length ? [[found[0], p.seats]]
    : found.map(c => [c, p.seats.filter(s => seatKey(s.seat) === seatKey(c.seat))]);
  const covered = new Set(groups.flatMap(([, seats]) => seats));
  for (const s of p.seats) if (s.status === 'filled' && !covered.has(s)) skipped.push(`${p.name} ${s.seat}: no contest for this seat in the export`);
  if (groups.some(([c, seats]) => seats.length > c.voteFor)) { skipped.push(`${p.name}: seats don't line up with ${found.length} contests`); continue; }
  const plan = [];
  let ok = true;
  for (const [c, seats] of groups) {
    const k = seats.filter(s => s.status === 'filled').length;
    if (!k) continue;
    const ballot = c.choices.filter(x => x.ballot && x.votes > 0).sort((a, b) => b.votes - a.votes);
    if (ballot.length < k) { ok = false; skipped.push(`${p.name} ${c.seat}: ${k} filled seats but ${ballot.length} ballot candidates with votes`); break; }
    if (ballot[k] && ballot[k].votes === ballot[k - 1].votes) { ok = false; skipped.push(`${p.name} ${c.seat}: tie at the cutoff`); break; }
    seats.filter(s => s.status === 'filled').forEach((s, i) => plan.push([s, ballot[i].name]));
  }
  if (!ok) continue;
  for (const [s, name] of plan) { if (!s.holder) named++; s.holder = name; }
}

// Record the evidence for the names.
const src = {url: reader.exportUrl(cfg), title: `Official results export, used for holder names (${basename(cached).replace(prefix, '')}${generated ? ', generated ' + generated : ''})`, type: 'results', as_of: generated || doc.as_of, sha256};
doc.sources = [...doc.sources.filter(x => !(x.sha256 && x.url === src.url)), src];
const note = ' Holder names come from the official results export: on each seat already counted as filled, the winning ballot candidate as printed (named write-ins are never used).';
if (!doc.notes.includes('Holder names come from')) doc.notes += note;

const mapPath = join(mapDir, 'data', entry.slug + '.json');
const mapPrecincts = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath)).precincts.map(({id, name}) => ({id, name})) : null;
const {errors} = validate(doc, {mapPrecincts});
const filledTotal = doc.precincts.reduce((n, p) => n + p.seats.filter(s => s.status === 'filled').length, 0);
console.log(`${entry.county}: ${contests.length} contests read (sha256 ${sha256.slice(0, 12)}..., generated ${generated || 'unknown'})`);
console.log(`  named ${named} of ${filledTotal} filled seats${cleared ? ` (replacing ${cleared} earlier names)` : ''}; statuses unchanged`);
for (const s of skipped.slice(0, 12)) console.log('  skipped: ' + s);
if (skipped.length > 12) console.log(`  ... ${skipped.length - 12} more skipped`);
if (errors.length) { for (const e of errors) console.error('  error: ' + e); process.exit(1); }
if (dryRun) { console.log('dry run: nothing written'); process.exit(0); }
const indent = (readFileSync(outFile, 'utf8').match(/\n( +)"/) || [, '  '])[1].length;
writeFileSync(outFile, JSON.stringify(doc, null, indent) + '\n');
console.log('wrote ' + outFile.replace(mapDir + '/', 'war_map/'));
execFileSync('node', [join(here, '../build-committee-summary.mjs')], {stdio: 'inherit'});
