// Reader for Clarity / Scytl election-night results sites
// (results.enr.clarityelections.com). Input is the "Download Summary CSV"
// export (summary.zip, or the summary.csv inside it) from the results page.
//
// Clarity refuses scripted and headless requests (HTTP 403), so this reader
// never fetches anything: a person downloads the export and passes its path.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseCsv} from './csv.mjs';
import {isWriteIn} from './rules.mjs';

// Contest names differ by county, so counties.json can set clarity.contest_pattern:
// a regular expression with named groups `seat` and `precinct`, matched against the
// contest name without its "(Vote For N)" suffix. The default fits Allegheny:
//   "REP County Committeeman Aleppo (Vote For 1)" -> seat "Committeeman", precinct "Aleppo"
export const DEFAULT_CONTEST = '^REP\\s+County\\s+(?<seat>Committeeman|Committeewoman|Committee\\s*person|Committee\\s*member)\\s+(?<precinct>.+)$';

export const exportUrl = c => `https://results.enr.clarityelections.com/${c.site}/${c.election_id}/${c.version}/reports/summary.zip`;
export const pageUrl = c => `https://results.enr.clarityelections.com/${c.site}/${c.election_id}/`;

function readExport(path) {
  if (!/\.zip$/i.test(path)) return {csv: readFileSync(path, 'utf8'), generated: null};
  const csv = execFileSync('unzip', ['-p', path, 'summary.csv'], {maxBuffer: 1 << 28}).toString('utf8');
  // zipinfo -T prints the member's timestamp as yyyymmdd.hhmmss
  const info = execFileSync('unzip', ['-Z', '-T', path, 'summary.csv']).toString();
  const m = info.match(/\b(\d{4})(\d{2})(\d{2})\.\d{6}\b/);
  return {csv, generated: m ? `${m[1]}-${m[2]}-${m[3]}` : null};
}

// Returns {generated, contests: [{seat, precinct, voteFor, choices: [{name, votes, ballot}]}]}
// in the order the export lists them. `ballot` is true for a candidate printed on the
// ballot; write-ins (named or not) are false. Choice names stay in memory only.
//
// cfg.party (e.g. "REP"): rows from another party are dropped, and a choice with a blank
// party in a contest that has party-labelled choices is a write-in (York and Crawford list
// named write-in recipients that way).
export function read(path, cfg = {}) {
  const {csv, generated} = readExport(path);
  const re = new RegExp(cfg.contest_pattern || DEFAULT_CONTEST, 'i');
  const contests = [];
  let current = null, currentName = null;
  for (const r of parseCsv(csv)) {
    const full = r['contest name'].trim();
    const party = (r['party name'] || '').trim();
    if (cfg.party && party && party !== cfg.party) continue;
    const vf = full.match(/\s*\(Vote For (\d+)\)\s*$/i);
    const m = full.replace(/\s*\(Vote For \d+\)\s*$/i, '').match(re);
    if (!m) { currentName = null; continue; }
    const name = r['choice name'].trim();
    // A new contest starts when the name changes, or when a choice repeats: two contests
    // can share a name (Delaware 2024 lists two "Committeewoman, Chadds Ford Township").
    if (full !== currentName || current.choices.some(c => c.name === name)) {
      const g = m.groups || {seat: m[1], precinct: m[2]};
      const seat = g.seat.replace(/\s+/g, '').toLowerCase();
      const dup = contests.filter(c => c.full === full).length;
      current = {full, seat: seat[0].toUpperCase() + seat.slice(1), precinct: g.precinct.trim() + (dup ? ` (contest ${dup + 1})` : ''),
        voteFor: vf ? +vf[1] : 1, choices: []};
      contests.push(current);
      currentName = full;
    }
    current.choices.push({name, votes: Number(r['total votes']) || 0, party});
  }
  for (const c of contests) {
    const partied = c.choices.some(x => x.party);
    for (const x of c.choices) x.ballot = !isWriteIn(x.name) && !(cfg.party && partied && !x.party);
    for (const x of c.choices) delete x.party;
    delete c.full;
  }
  return {generated, contests};
}
