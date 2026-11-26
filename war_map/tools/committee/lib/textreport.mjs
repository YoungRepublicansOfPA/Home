// Reader for official results PDFs laid out as text: a contest title, then one line per
// choice with vote columns. Counties use different software (ReportLab in Bucks, Enhanced
// Voting in Lancaster, Electionware in Chester, a custom report in Montgomery), so the
// layout is described in counties.json under `textreport`:
//
//   contest_pattern  regex with named groups `seat` and `precinct` (and optionally `n`, seats
//                    elected), matched against the trimmed title line. Republican contests only.
//   any_contest      regex for any contest title, Republican or not; it ends the current contest.
//   end              regex for a line that ends a contest (default: a Total / Total Votes / Total Votes Cast
//                    line followed by numbers). end and any_contest are case-sensitive.
//   precinct_aliases {"SOURCE SPELLING": "name in the county file"} for misspelled titles.
//
// Which number is the total is found by arithmetic: a choice line's total is the column equal
// to the sum of the others (first in Bucks and Chester, last in Montgomery), or its only number.
// A line inside a contest that has numbers but can't be read stops the run, so a candidate is
// never silently dropped. Write-in tallies are kept as unnamed write-ins; their names are not kept.
import {execFileSync} from 'node:child_process';

const SKIP = /^(Statement of Votes Cast|All Precincts|Total Ballots Cast|Choice\s{2,}|Times Cast|Precincts Reported|Registered Voters|Ballots Cast|Voter Turnout|Unresolved Write-In|Write-In Totals|Overvotes|Undervotes|Election Summary - |Page \d+ of \d+|.*\sPage \d+$|\d{4} (General|Primary|Municipal)|Last Updated)/i;
// Page furniture: any line with a written-out date ("May 19, 2026") or a run header.
const FURNITURE = /\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b|^Jurisdiction Wide\b/;
const WRITE_IN = /^(write[\s-]?ins?\b|write-in:|scattered\b|not assigned\b|uncertified\b)/i;
const DEFAULT_END = '^(Total|Total Votes|Total Votes Cast|Contest Totals)\\s+[\\d,]';

export const pageUrl = c => c.page || c.url;
export const exportUrl = c => c.url;
export function sources(c, {county, election, file, generated, asOf, sha256}) {
  return [{url: c.url, title: `${county} County official results, ${election} (${c.title || 'results report'}${generated ? ', ' + generated : ''}; ${file})`, type: 'results', as_of: asOf, sha256},
    ...(c.page ? [{url: c.page, title: `${county} County election results page`, type: 'results', as_of: asOf}] : [])];
}

function total(nums, line) {
  if (nums.length === 1) return nums[0];
  const sum = a => a.reduce((s, x) => s + x, 0);
  if (nums[0] === sum(nums.slice(1))) return nums[0];
  if (nums.at(-1) === sum(nums.slice(0, -1))) return nums.at(-1);
  throw Error(`text report: no total column in "${line.slice(0, 70)}"`);
}

export function read(path, cfg = {}) {
  const text = execFileSync('pdftotext', ['-layout', path, '-'], {maxBuffer: 1 << 29}).toString('utf8');
  const re = new RegExp(cfg.contest_pattern, 'i');
  // Case-sensitive on purpose: a column header "TOTAL" must not end a contest.
  const any = cfg.any_contest ? new RegExp(cfg.any_contest) : null;
  const end = new RegExp(cfg.end || DEFAULT_END);
  const aliases = Object.fromEntries(Object.entries(cfg.precinct_aliases || {}).map(([k, v]) => [k.toUpperCase(), v]));
  const contests = [];
  let cur = null;
  const lines = text.split('\n'), rebuilt = [];
  const textOnly = s => s && !/\d/.test(s) && !SKIP.test(s) && !FURNITURE.test(s) && !re.test(s) && !/^(Candidate|Write-in|Vote For)\b/i.test(s);
  for (const [i, raw] of lines.entries()) {
    const t = raw.replace(/\f/g, '').trim();
    if (!t) continue;
    const head = t.match(re);
    if (head) {
      const g = head.groups, seat = g.seat.replace(/\s+/g, '').toLowerCase();
      const precinct = aliases[g.precinct.trim().toUpperCase()] || g.precinct.trim();
      cur = {seat: seat[0].toUpperCase() + seat.slice(1), precinct, voteFor: g.n ? +g.n : 1, choices: []};
      contests.push(cur);
      continue;
    }
    if (any && any.test(t)) { cur = null; continue; }
    if (!cur) continue;
    const vf = t.match(/^Vote For (\d+)$/i);
    if (vf) { cur.voteFor = +vf[1]; continue; }
    if (end.test(t)) { cur = null; continue; }
    if (SKIP.test(t) || FURNITURE.test(t) || !/\d/.test(t)) continue; // column headers, wrapped titles, page furniture
    const m = t.match(/^(.*?\S)\s{2,}((?:[\d,]+\s+)*[\d,]+)$/);
    if (!m) throw Error(`text report: can't read line in "${cur.precinct}" ${cur.seat}: ${t.slice(0, 70)}`);
    let label = m[1].replace(/\s+(REP|DEM)$/, '').trim();
    // A long name can wrap around its vote line: "CATHERINE ZHOU" / "REP  111 ... 133" / "MATTHEWS".
    // When the vote line carries only a party code, rebuild the name from the adjacent text lines.
    if (/^(REP|DEM)$/.test(label)) {
      const before = lines[i - 1]?.trim(), after = lines[i + 1]?.trim();
      if (!textOnly(before)) throw Error(`text report: vote line without a name in "${cur.precinct}": ${t.slice(0, 60)}`);
      label = before + (textOnly(after) ? ' ' + after : '');
      rebuilt.push(`${cur.precinct}: ${label}`);
    }
    const votes = total(m[2].split(/\s+/).map(x => Number(x.replace(/,/g, ''))), t);
    if (WRITE_IN.test(label)) cur.choices.push({name: 'Write-in', votes, ballot: false});
    else cur.choices.push({name: label, votes, ballot: true});
  }
  const date = text.match(/(?:Election Summary - |Last Updated: )(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = text.match(/Final, [^\n]*?\s(\d{4}-\d{2}-\d{2})\s*\n/); // Bucks: "... Final, May 19, 2026      2026-06-09"
  if (rebuilt.length) console.log(`  rebuilt ${rebuilt.length} wrapped candidate names: ` + rebuilt.join('; '));
  return {generated: date ? `${date[3]}-${date[1]}-${date[2]}` : iso ? iso[1] : null, contests};
}
