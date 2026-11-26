// Reader for Clarity / Scytl election-night results sites
// (results.enr.clarityelections.com). Input is the "Download Summary CSV"
// export (summary.zip, or the summary.csv inside it) from the results page.
//
// Clarity refuses scripted and headless requests (HTTP 403), so this reader
// never fetches anything: a person downloads the export and passes its path.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseCsv} from './csv.mjs';

// "REP County Committeeman Aleppo (Vote For 1)" -> seat "Committeeman", precinct "Aleppo", voteFor 1
export const DEFAULT_CONTEST = '^REP\\s+County\\s+(Committeeman|Committeewoman|Committee\\s*person|Committee\\s*member)\\s+(.+?)\\s*\\(Vote For (\\d+)\\)$';

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

// Returns {generated, contests: [{seat, precinct, voteFor, choices: [{name, votes}]}]}
// in the order the export lists them. Choice names stay in memory only.
export function read(path, cfg = {}) {
  const {csv, generated} = readExport(path);
  const re = new RegExp(cfg.contest_pattern || DEFAULT_CONTEST, 'i');
  const byName = new Map();
  for (const r of parseCsv(csv)) {
    const m = r['contest name'].trim().match(re);
    if (!m) continue;
    let c = byName.get(r['contest name']);
    if (!c) {
      const seat = m[1].replace(/\s+/g, '').toLowerCase(); // "Committee person" -> "committeeperson"
      c = {seat: seat[0].toUpperCase() + seat.slice(1), precinct: m[2].trim(), voteFor: +m[3], choices: []};
      byName.set(r['contest name'], c);
    }
    c.choices.push({name: r['choice name'], votes: Number(r['total votes']) || 0});
  }
  return {generated, contests: [...byName.values()]};
}
