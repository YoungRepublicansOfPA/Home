// Reader for a county committee roster PDF laid out as a table (Lawrence County's
// "Republican County Committee" roster): a municipality heading on its own line, then for
// each precinct a row "<precinct>   <member>   <address>" and a continuation row
// "               <member>   <address>". VACANT marks an empty seat.
//
// Only the precinct and member name are read. Address columns, and annotations such as
// "(APPT. 1/13/26)", are dropped and never kept.
//
// counties.json `roster`: url, page, seats (members per precinct), skip (regex for page headers
// and officer lines that can appear in the member column), municipality_pattern (optional
// regex a heading must match).
import {execFileSync} from 'node:child_process';

export const pageUrl = c => c.page || c.url;
export const exportUrl = c => c.url;
export function sources(c, {county, file, asOf, sha256}) {
  return [{url: c.url, title: `${county} County Republican County Committee roster (${c.title || file})`, type: 'roster', as_of: asOf, sha256}];
}

const clean = name => name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

export function read(path, cfg) {
  const text = execFileSync('pdftotext', ['-layout', path, '-'], {maxBuffer: 1 << 28}).toString('utf8');
  const skip = new RegExp(cfg.skip || '^(REPUBLICAN COUNTY COMMITTEE|ELECTED |REVISED )', 'i');
  const muniOk = cfg.municipality_pattern ? new RegExp(cfg.municipality_pattern) : /^[A-Z][A-Z .'-]+$/;
  const seats = cfg.seats || 2;
  const contests = [];
  let municipality = null, cur = null, started = false;
  let nameCol = 18; // where member names start; learned from the first precinct row
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\f/g, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    const lead = line.match(/^\s*/)[0].length, indented = lead > 0;
    const parts = line.trim().split(/\s{2,}/);
    if (skip.test(parts[0])) continue;
    // A municipality heading is a lone uppercase name that starts left of the member-name column.
    if (lead < nameCol - 2 && parts.length === 1 && muniOk.test(parts[0]) && !/\b(DIST|WARD|PCT|PRECINCT)\b\.?/i.test(parts[0]) && !/\d/.test(parts[0])) {
      municipality = parts[0].trim(); cur = null; started = true; continue; // municipality heading
    }
    if (!started) continue; // officers and title block before the first municipality
    if (!indented && parts.length >= 2) {
      // precinct row; a precinct named only by its municipality uses that name alone
      const label = parts[0].trim();
      const precinct = /\b(DIST|WARD|PCT|PRECINCT)\b|^\d/i.test(label) ? `${municipality} ${label}` : label;
      nameCol = line.indexOf(parts[1], parts[0].length);
      cur = {seat: 'Member', precinct, voteFor: seats, choices: []};
      contests.push(cur);
      const name = clean(parts[1]);
      if (name && !/^VACANT$/i.test(name)) cur.choices.push({name, votes: 1, ballot: true});
      continue;
    }
    if (indented && lead >= nameCol - 2 && cur && parts.length >= 1) {
      const name = clean(parts[0]);
      if (/^VACANT$/i.test(name)) continue;
      if (!name || /\d/.test(name) || cur.choices.length >= seats) continue; // stray header text or an address-only line
      cur.choices.push({name, votes: 1, ballot: true});
    }
  }
  return {generated: null, contests};
}
