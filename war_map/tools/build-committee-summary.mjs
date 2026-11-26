// Builds war_map/committee/summary.json from the per-county committee files and
// war_map/tools/committee/counties.json (election cycles).
// Usage (from the repository root): node war_map/tools/build-committee-summary.mjs
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
const dir = new URL('../committee/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(new URL('committee/counties.json', import.meta.url)));
const cycleOf = Object.fromEntries(manifest.counties.map(c => [c.county, c.cycle_years]));

// Election schedule rules (checked 2026-11-25). The Department of State publishes the
// official calendar for each election year; these dates are computed from current law.
const SCHEDULE = {
  checked_at: '2026-11-25',
  rule: 'Committee seats are elected at the general primary: the third Tuesday of May in even-numbered years, or the fourth Tuesday of April in presidential years. Nomination petitions circulate from the 13th Tuesday through the 10th Tuesday before the primary. Vacancies between elections are filled under county party rules, usually by appointment.',
  default_cycle_years: 4,
  sources: [
    {url: 'https://www.pa.gov/agencies/vote/elections/types-of-elections', title: 'Pennsylvania Department of State: Types of Elections (primary dates)'},
    {url: 'https://www.pa.gov/content/dam/copapwp-pagov/en/dos/programs/voting-and-elections/running-for-office/2026/2026-general-election-calendar.pdf', title: 'Department of State 2026 election calendar (petition period ended March 10, 2026, the 10th Tuesday before the May 19 primary)'},
    {url: 'https://www.palegis.us/statutes/unconsolidated/law-information/view-statute?txtType=PDF&SessYr=2019&ActNum=0077.&SessInd=0', title: 'Pennsylvania Election Code as amended by Act 77 of 2019 (petition circulation period)'}
  ]
};
const iso = d => d.toISOString().slice(0, 10);
function nthTuesday(year, month, n) { // month 0-based
  const d = new Date(Date.UTC(year, month, 1));
  d.setUTCDate(1 + (2 - d.getUTCDay() + 7) % 7 + 7 * (n - 1));
  return d;
}
const primaryDate = year => year % 4 === 0 ? nthTuesday(year, 3, 4) : nthTuesday(year, 4, 3);
const weeksBefore = (d, w) => new Date(d.getTime() - w * 7 * 864e5);
function nextElection(d) {
  const confirmed = cycleOf[d.county] != null;
  const cycle = cycleOf[d.county] || SCHEDULE.default_cycle_years;
  const last = Number((d.election || '').match(/\b(20\d\d)\b/)?.[1]) || null;
  // Without a dated election on record, assume the county's seats were last elected in 2026 (gubernatorial year).
  const year = (last || 2026) + cycle;
  const p = primaryDate(year);
  return {year, date: iso(p), petitions_from: iso(weeksBefore(p, 13)), petitions_to: iso(weeksBefore(p, 10)),
    cycle_years: cycle, cycle_confirmed: confirmed, last_election_year: last};
}
// Sanity check against the published 2026 calendar.
if (iso(primaryDate(2026)) !== '2026-05-19' || iso(weeksBefore(primaryDate(2026), 10)) !== '2026-03-10') throw Error('schedule rule no longer matches the 2026 calendar');

const counties = {};
const total = {seats: 0, filled: 0, empty: 0, empty_no_filer: 0, unknown: 0, named: 0, precincts: 0, mapped: 0};
for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'summary.json').sort()) {
  const d = JSON.parse(readFileSync(join(dir, file)));
  const t = d.totals;
  const named = d.precincts.reduce((n, p) => n + p.seats.filter(s => s.holder).length, 0);
  const mapped = d.precincts.filter(p => p.map_id).length;
  for (const k of ['seats', 'filled', 'empty', 'empty_no_filer', 'unknown', 'precincts']) total[k] += t[k] || 0;
  total.named += named; total.mapped += mapped;
  counties[d.county] = {
    method: d.method, election: d.election || null, as_of: d.as_of || null, checked_at: d.checked_at,
    precincts: t.precincts, seats: t.seats, filled: t.filled, empty: t.empty,
    empty_no_filer: t.empty_no_filer || 0, unknown: t.unknown, named, mapped,
    next_election: nextElection(d),
    sources: (d.sources || []).map(s => ({url: s.url, title: s.title, type: s.type})), file
  };
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify({built_from: 'war_map/committee/*.json', schedule: SCHEDULE, total, counties}, null, 1) + '\n');
console.log(Object.keys(counties).length + ' counties', total);
