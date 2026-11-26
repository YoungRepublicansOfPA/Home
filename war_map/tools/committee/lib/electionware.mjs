// Reader for Electionware "Election Summary" reports (ES&S; "Report generated with
// Electionware"), which many Pennsylvania counties post as their official results PDF,
// for example Cambria's "pa_dos_official_summary_text_groups" file.
//
// Layout, as `pdftotext -layout` renders it:
//     REP REPUBLICAN COUNTY COMMITTEE PERSONS ADAMS TOWNSHIP NO.1
//     Vote For 2
//                                   TOTAL ELECTIO ABSENT PROVISI ...
//   CANDIDATE NAME                     97      83      13     1     <- ballot candidate (flush left)
//     Write-In: Some Name               1       1       0     0     <- named write-in
//   Write-In Totals                     5 ...                        <- subtotal, skipped
//     Not Assigned                      0 ...                        <- unnamed write-ins
//   Total Votes Cast / Overvotes / Undervotes / Contest Totals       <- end of contest
// Page headers and footers can fall anywhere and are skipped.
//
// Like the Clarity reader, it never fetches: county sites often refuse scripted requests,
// so a person downloads the PDF and passes its path.
import {execFileSync} from 'node:child_process';

// counties.json can set electionware.contest_pattern: a regular expression with named groups
// `seat` and `precinct`, matched against the trimmed contest title line.
export const DEFAULT_CONTEST = '^REP REPUBLICAN COUNTY (?<seat>COMMITTEE PERSONS?|COMMITTEEMAN|COMMITTEEWOMAN|COMMITTEE MEMBER)\\s+(?<precinct>.+)$';
const SKIP = /^(Summary Results|OFFICIAL RESULTS|\d{4} (General|Municipal) (Primary|Election)|[A-Z][a-z]+ \d{1,2}, \d{4}|[A-Z ]+ COUNTY$|TOTAL\b|N DAY\b|Election Summary - |Report generated with|Write-In Totals|Overvotes|Undervotes)/;
const END = /^(Total Votes Cast|Contest Totals)\b/;
const CHOICE = /^(.*?\S)\s{2,}(\d[\d,]*)(\s+\d[\d,]*)*\s*$/;

export const pageUrl = c => c.page;
export const exportUrl = c => c.url;
export function sources(c, {county, election, file, generated, asOf, sha256}) {
  return [
    {url: c.url, title: `${county} County official results, ${election} (Electionware election summary report${generated ? ' dated ' + generated : ''}, ${file})`, type: 'results', as_of: asOf, sha256},
    ...(c.page ? [{url: c.page, title: `${county} County election office (where the report is posted)`, type: 'results', as_of: asOf}] : [])
  ];
}

// Returns {generated, contests: [{seat, precinct, voteFor, choices: [{name, votes, ballot}]}]}.
export function read(path, cfg = {}) {
  const text = execFileSync('pdftotext', ['-layout', path, '-'], {maxBuffer: 1 << 28}).toString('utf8');
  const re = new RegExp(cfg.contest_pattern || DEFAULT_CONTEST, 'i');
  const m = text.match(/Election Summary - (\d{2})\/(\d{2})\/(\d{4})/);
  const generated = m ? `${m[3]}-${m[1]}-${m[2]}` : null;
  const contests = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\f/g, '');
    const t = line.trim();
    if (!t) continue;
    const head = t.match(re);
    if (head) {
      const seat = head.groups.seat.replace(/\s+/g, '').toLowerCase().replace(/persons$/, 'person');
      cur = {seat: seat[0].toUpperCase() + seat.slice(1), precinct: head.groups.precinct.trim(), voteFor: 1, choices: []};
      contests.push(cur);
      continue;
    }
    if (!cur) continue;
    const vf = t.match(/^Vote For (\d+)$/i);
    if (vf) { cur.voteFor = +vf[1]; continue; }
    if (END.test(t)) {
      // Self-check: the choices read must add up to the report's own total.
      const total = t.match(/^Total Votes Cast\s+(\d[\d,]*)/);
      const sum = cur.choices.reduce((n, c) => n + c.votes, 0);
      if (total && Number(total[1].replace(/,/g, '')) !== sum) throw Error(`Electionware report: contest "${cur.precinct}" choices add up to ${sum}, report says ${total[1]}`);
      cur = null;
      continue;
    }
    if (SKIP.test(t)) continue;
    const c = t.match(CHOICE);
    if (!c) throw Error(`Electionware report: can't read line in contest "${cur.precinct}": ${t.slice(0, 60)}`);
    const label = c[1].trim(), votes = Number(c[2].replace(/,/g, ''));
    const w = label.match(/^Write-In:\s*(.*)$/i);
    if (w) cur.choices.push({name: 'Write-in', votes, ballot: false}); // write-in names are never kept
    else if (/^Not Assigned$/i.test(label)) cur.choices.push({name: 'Write-in (not assigned)', votes, ballot: false});
    else cur.choices.push({name: label, votes, ballot: true});
  }
  return {generated, contests};
}
