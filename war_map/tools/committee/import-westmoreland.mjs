// Import Westmoreland's official 2026 committee results and winner certification.
// Usage: node war_map/tools/committee/import-westmoreland.mjs --summary PATH --cert PATH [--dry-run]
// Raw PDFs stay in .cache; only winning ballot names enter the public county file.
import {readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {read as readReport} from './lib/textreport.mjs';
import {matchPrecincts} from './lib/match.mjs';
import {validate, countTotals} from './lib/validate.mjs';

const args = process.argv.slice(2);
const arg = key => args[args.indexOf(key) + 1];
if (!args.includes('--summary') || !args.includes('--cert')) throw Error('Provide --summary and --cert official PDF paths');
const summaryPath = arg('--summary'), certPath = arg('--cert');
const dryRun = args.includes('--dry-run');
const root = new URL('../../', import.meta.url).pathname;
const summaryUrl = 'https://www.westmorelandcountypa.gov/DocumentCenter/View/35896/Official-Results';
const certUrl = 'https://www.westmorelandcountypa.gov/DocumentCenter/View/35893/Certification-of-The-Republican-Ballot-Results-2026-General-Primary';
const config = {
  contest_pattern: '^(?<precinct>.+?) (?<seat>REPUBLICAN COUNTY(?: COMMITTEE)?)$',
  end: '^Total Votes Cast\\s+[\\d,]',
  merge_page_continuations: true,
  validate_contest_total: true
};
const contests = readReport(summaryPath, config).contests;
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const xmlDir = mkdtempSync(join(tmpdir(), 'westmoreland-cert-'));
let xml;
try {
  const prefix = join(xmlDir, 'cert');
  execFileSync('pdftohtml', ['-xml', '-hidden', '-i', certPath, prefix], {stdio: 'ignore'});
  xml = readFileSync(prefix + '.xml', 'utf8');
} finally { rmSync(xmlDir, {recursive: true, force: true}); }

const colors = new Map([...xml.matchAll(/<fontspec\s+id="(\d+)"[^>]*color="(#[0-9a-fA-F]{6})"/g)]
  .map(m => [m[1], m[2].toLowerCase()]));
if (![...colors.values()].includes('#00af50')) throw Error('Certification winner color missing');
const decode = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const certified = new Map();
let current = null;
for (const m of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
  const attrs = m[1], value = decode(m[2]).trim();
  const heading = value.match(/^(.+) REPUBLICAN COUNTY COMMITTEE$/);
  if (heading) { current = heading[1]; if (!certified.has(current)) certified.set(current, []); continue; }
  const font = attrs.match(/\bfont="(\d+)"/)?.[1];
  const left = +(attrs.match(/\bleft="(\d+)"/)?.[1] || 9999);
  if (current && colors.get(font) === '#00af50' && left < 800 && value && !/^Green = Winner$/i.test(value))
    certified.get(current).push(value);
}
const reportNames = new Set(contests.map(c => c.precinct));
if (contests.length !== 306 || reportNames.size !== 306 || certified.size !== 306 ||
    [...certified.keys()].some(name => !reportNames.has(name)))
  throw Error(`Contest reconciliation failed: report ${contests.length}, certification ${certified.size}`);

const mapFile = JSON.parse(readFileSync(join(root, 'data/westmoreland.json')));
const mapPrecincts = mapFile.precincts.map(({id, name, municipality}) => ({id, name, municipality}));
const {ids, unmatched} = matchPrecincts(contests.map(c => c.precinct), mapPrecincts);
const mapAliases = {
  'ALLEGHENY TOWNSHIP NO 1 SHEARERS': 'Allegheny X 1',
  'ALLEGHENY TOWNSHIP NO 2 MCKEES': 'Allegheny X 2',
  'ALLEGHENY TOWNSHIP NO 3 SOBERS': 'Allegheny X 3',
  'ALLEGHENY TOWNSHIP NO 4 STEWARTS': 'Allegheny X 4',
  'ALLEGHENY TOWNSHIP NO 5 BELLVUE': 'Allegheny X 5',
  'HEMPFIELD TOWNSHIP NO 1 FOXHILL': 'Hempfield X Foxhill',
  'HEMPFIELD TOWNSHIP NO 2 ALWINE': 'Hempfield X Alwine',
  'HEMPFIELD TOWNSHIP NO 3 MAPLEWOOD': 'Hempfield X Maplewood',
  'HEMPFIELD TOWNSHIP NO 4 CARBON': 'Hempfield X Carbon',
  'HEMPFIELD TOWNSHIP NO 5 WENDEL-HERMINIE': 'Hempfield X Wendel Herm',
  'HEMPFIELD TOWNSHIP NO 6 LUXOR': 'Hempfield X Luxor',
  'HEMPFIELD TOWNSHIP NO 7 HANNASTOWN': 'Hempfield X Hannastown',
  'HEMPFIELD TOWNSHIP NO 8 BOVARD': 'Hempfield X Bovard',
  'HEMPFIELD TOWNSHIP LINCOLN HEIGHTS EAST': 'Hempfield X Lincoln Heights',
  'HEMPFIELD TOWNSHIP MIDDLETOWN': 'Hempfield X Middletown (Usc 12)',
  'MOUNT PLEASANT TOWNSHIP WESTMORELAND HOMESTEAD': 'Mt. Pleasant X Westmoreland',
  'UNITY TOWNSHIP PLEASANT UNITY': 'Unity X Pleasant Unity (Cong. 13)',
  'WASHINGTON TOWNSHIP OAKLAND CROSS ROADS': 'Washington X Oakland X Roads'
};
const byMapName = new Map(mapPrecincts.map(p => [p.name, p.id]));
const usedMapIds = new Set(ids.values());
if (unmatched.length !== Object.keys(mapAliases).length || unmatched.some(name => !mapAliases[name]))
  throw Error('Map aliases do not cover exactly the unmatched precincts');
for (const [sourceName, mapName] of Object.entries(mapAliases)) {
  const id = byMapName.get(mapName);
  if (!id || usedMapIds.has(id)) throw Error(`Map alias is missing or duplicate: ${sourceName}`);
  ids.set(sourceName, id); usedMapIds.add(id);
}
if (ids.size !== mapPrecincts.length) throw Error(`Mapped ${ids.size} of ${mapPrecincts.length} precincts`);
const precincts = contests.map(c => {
  const winners = certified.get(c.precinct);
  if (winners.length > c.voteFor) throw Error(`${c.precinct}: ${winners.length} winners for ${c.voteFor} seats`);
  const voted = c.choices.reduce((sum, choice) => sum + choice.votes, 0);
  const seats = winners.map(w => ({status: 'filled', ...(!/^Write-In:/i.test(w) ? {holder: w} : {})}));
  while (seats.length < c.voteFor) seats.push({status: voted ? 'unknown' : 'empty'});
  return {name: c.precinct, ...(ids.has(c.precinct) ? {map_id: ids.get(c.precinct)} : {}),
    seats: seats.map((s, i) => ({seat: `Member ${i + 1}`, ...s}))};
});
const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const doc = {
  county: 'Westmoreland', checked_at: today, method: 'election_results',
  election: 'May 19, 2026 General Primary', as_of: '2026-06-08', seats_per_precinct: null,
  sources: [
    {url: summaryUrl, title: 'Westmoreland County Official Summary Results Report, 2026 General Primary (June 8, 2026)', type: 'results', as_of: '2026-06-08', sha256: sha(summaryPath)},
    {url: certUrl, title: 'Westmoreland County Official Republican Ballot Results, winners marked in green (June 8, 2026)', type: 'results', as_of: '2026-06-08', sha256: sha(certPath)}
  ],
  precincts, totals: countTotals(precincts),
  notes: 'All 306 Republican county committee contests in the official 2026 report were reconciled with the winner certification. Green-marked winners are filled; names of write-in winners are omitted. A seat with no winner is empty only when the report shows no votes, otherwise unknown. The PDF repeats two contest headings across page breaks and wraps one title; those sections were merged before each contest was checked against its printed total. Eighteen source precinct names were matched to uniquely corresponding map labels using the aliases in import-westmoreland.mjs. Appointments after certification are not captured.'
};
const {errors, warnings} = validate(doc, {mapPrecincts});
if (errors.length) throw Error(errors.join('; '));
console.log('Westmoreland', doc.totals, `${ids.size} mapped, no unmatched precincts`);
for (const warning of warnings) console.log('warning:', warning);
if (!dryRun) {
  const cache = join(root, 'tools/committee/.cache/westmoreland');
  mkdirSync(cache, {recursive: true});
  copyFileSync(summaryPath, join(cache, '2026-primary-official-results.pdf'));
  copyFileSync(certPath, join(cache, '2026-primary-republican-certification.pdf'));
  writeFileSync(join(root, 'committee/westmoreland.json'), JSON.stringify(doc, null, 1) + '\n');
  execFileSync('node', [join(root, 'tools/build-committee-summary.mjs')], {stdio: 'inherit'});
}
