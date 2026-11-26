// Reader for an official results web page saved as HTML (Monroe County's
// "ElectionResults/Committee?party=Republican" page). The page's text, one item per line, runs:
//   MEMBER OF REPUBLICAN COUNTY COMMITTEE 01-1 Barrett One     <- contest title
//   Vote for not more than 2 Candidates                         <- seats
//   CANDIDATE NAME / 51 / 24.29%                                 <- choice, votes, share
//   Write-in / 5 / 2.38%
//   Total / 210                                                  <- end of contest
//
// counties.json `htmllines`: url, contest_pattern (named groups `seat`, `precinct`), title.
import {readFileSync} from 'node:fs';

export const pageUrl = c => c.url;
export const exportUrl = c => c.url;
export function sources(c, {county, election, asOf, sha256}) {
  return [{url: c.url, title: `${county} County official results page, ${election} (${c.title || 'committee results'}; saved copy)`, type: 'results', as_of: asOf, sha256}];
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

export function read(path, cfg) {
  const html = readFileSync(path, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
  const lines = decode(html.replace(/<[^>]+>/g, '\n')).split('\n').map(s => s.trim()).filter(Boolean);
  const re = new RegExp(cfg.contest_pattern, 'i');
  const contests = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    const head = t.match(re);
    if (head) {
      const seat = head.groups.seat.replace(/\s+/g, '').toLowerCase();
      cur = {seat: seat[0].toUpperCase() + seat.slice(1), precinct: head.groups.precinct.trim(), voteFor: 1, choices: []};
      contests.push(cur);
      continue;
    }
    if (!cur) continue;
    const vf = t.match(/^Vote for not more than (\d+)/i) || t.match(/^Vote for (\d+)/i);
    if (vf) { cur.voteFor = +vf[1]; continue; }
    if (/^Total$/i.test(t)) { cur = null; continue; }
    // A choice is a text line followed by a whole number of votes.
    if (/^[\d,]+$/.test(lines[i + 1] || '') && !/^[\d,.%]+$/.test(t) && !/^Precincts Reported/i.test(t)) {
      const votes = Number(lines[i + 1].replace(/,/g, ''));
      if (/^write[\s-]?ins?\b/i.test(t)) cur.choices.push({name: 'Write-in', votes, ballot: false});
      else cur.choices.push({name: t, votes, ballot: true});
      i++;
    }
  }
  return {generated: null, contests};
}
