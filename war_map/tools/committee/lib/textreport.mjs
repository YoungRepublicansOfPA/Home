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
//   seat_labels      {"M": "Committeeman"} when the title uses a short seat label.
//   label_column     index of the name among the text columns, when other columns precede the votes.
//
// Which number is the total is found by arithmetic: a choice line's total is the column equal
// to the sum of the others (first in Bucks and Chester, last in Montgomery), or its only number.
// A line inside a contest that has numbers but can't be read stops the run, so a candidate is
// never silently dropped. Write-in tallies are kept as unnamed write-ins; their names are not kept.
import {execFileSync} from 'node:child_process';

const SKIP = /^(Report generated with|Precinct Summary|Summary Results|Result Book|OFFICIAL RESULTS|UNOFFICIAL RESULTS|Statement of Votes Cast|All Precincts|Total Ballots Cast|Choice\s{2,}|Times Cast|Precincts Reported|Registered Voters|Ballots Cast|Voter Turnout|Unresolved Write-In|Write-In Totals|Overvotes|Undervotes|Election Summary - |Page \d+ of \d+|.*\sPage \d+$|\d{4} (General|Primary|Municipal)|Last Updated)/i;
// Page furniture: any line with a written-out date ("May 19, 2026") or a run header.
const FURNITURE = /\s\d+ of \d+$|\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b|^Jurisdiction Wide\b/;
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
      // seat_labels maps short source labels to the county file's, e.g. Lycoming's (M)/(F).
      const g = head.groups, seat = (cfg.seat_labels?.[g.seat.trim()] || g.seat).replace(/\s+/g, '').toLowerCase();
      const precinct = aliases[g.precinct.trim().toUpperCase()] || g.precinct.trim();
      // Some long contests repeat their title after a page break, before the total line.
      if (cfg.merge_page_continuations && cur?.precinct === precinct && cur?.seat.toLowerCase() === seat) continue;
      cur = {seat: seat[0].toUpperCase() + seat.slice(1), precinct, voteFor: g.n ? +g.n : 1, choices: []};
      contests.push(cur);
      continue;
    }
    // A seat-count line can look like a title ending "(Vote for 2)", so read it first.
    // Luzerne wraps long titles: "(REP) (Vote for 2)" or "for 2)" on the next line.
    // Erie wraps "(Vote for" / "2)", so a lone "2)" is the seat count too.
    const vf = t.match(/^(?:\((?:REP|DEM)\)\s*)?\(?(?:Vote )?For (\d+)\)?$/i) || t.match(/^(\d+)\)$/);
    if (vf) { if (cur) cur.voteFor = +vf[1]; continue; }
    if (any && any.test(t)) { cur = null; continue; }
    if (!cur) continue;
    if (end.test(t)) {
      if (cfg.validate_contest_total) {
        const reported = Number((t.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
        const counted = cur.choices.reduce((sum, choice) => sum + choice.votes, 0);
        if (counted !== reported) throw Error(`text report: ${cur.precinct} choices sum to ${counted}, reported total is ${reported}`);
      }
      cur = null; continue;
    }
    if (SKIP.test(t) || FURNITURE.test(t) || !/\d/.test(t)) continue; // column headers, wrapped titles, page furniture
    // Drop percentage columns ("62    100.00%    54    8" in Lackawanna) before finding the total.
    const m = t.replace(/\s+[\d.]+%/g, '').match(/^(.*?\S)\s{2,}((?:[\d,]+\s+)*[\d,]+)$/);
    if (!m) {
      // Only a line shaped like a vote line (a wide gap, then numbers) must be readable;
      // anything else here is a section heading or page text.
      if (/\S\s{2,}[\d,]+(\s|$)/.test(t)) throw Error(`text report: can't read line in "${cur.precinct}" ${cur.seat}: ${t.slice(0, 70)}`);
      continue;
    }
    // A party column after the name: "NAME    REP" is a ballot candidate; any other code
    // ("WRITE-IN" in Luzerne, "DEM") marks a write-in or another party's line.
    const cols = m[1].split(/\s{2,}/);
    let party = cols.length > 1 && /^[A-Z][A-Z-]{1,9}$/.test(cols.at(-1)) ? cols.pop() : null;
    // label_column: when the report prints more columns before the votes (Sullivan prints the
    // precinct), only that column is the name.
    let label = (cfg.label_column != null ? cols[cfg.label_column] || '' : cols.join(' ')).replace(/\s+(REP|DEM)$/, '').trim();
    // A long name can wrap around its vote line: "CATHERINE ZHOU" / "REP  111 ... 133" / "MATTHEWS".
    // When the vote line carries only a party code, rebuild the name from the adjacent text lines.
    if (/^(REP|DEM)$/.test(label)) {
      const before = lines[i - 1]?.trim(), after = lines[i + 1]?.trim();
      if (!textOnly(before)) throw Error(`text report: vote line without a name in "${cur.precinct}": ${t.slice(0, 60)}`);
      label = before + (textOnly(after) ? ' ' + after : '');
      rebuilt.push(`${cur.precinct}: ${label}`);
    }
    const votes = total(m[2].split(/\s+/).map(x => Number(x.replace(/,/g, ''))), t);
    if (WRITE_IN.test(label) || (party && party !== (cfg.party || 'REP'))) cur.choices.push({name: 'Write-in', votes, ballot: false});
    else cur.choices.push({name: label, votes, ballot: true});
  }
  const date = text.match(/(?:Election Summary - |Last Updated: )(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = text.match(/Final, [^\n]*?\s(\d{4}-\d{2}-\d{2})\s*\n/); // Bucks: "... Final, May 19, 2026      2026-06-09"
  if (rebuilt.length) console.log(`  rebuilt ${rebuilt.length} wrapped candidate names: ` + rebuilt.join('; '));
  return {generated: date ? `${date[3]}-${date[1]}-${date[2]}` : iso ? iso[1] : null, contests};
}
