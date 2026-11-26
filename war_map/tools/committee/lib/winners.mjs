// Reader for an official winners list published as a spreadsheet (.xlsx), such as
// Philadelphia's "2026_PRI_COMMITTEEPEOPLE_WINNERS_REPUBLICAN.xlsx". Only two columns are
// read: the contest (race) and the winner's name. Other columns, such as home addresses,
// are never read or kept.
//
// counties.json `winners`: url, race_column ("A"), name_column ("C"), race_pattern (named
// group `precinct`), seat (label), vote_for (seats per precinct).
// Every listed name is a winner, so each gets one vote; add-holders.mjs then names exactly
// as many seats as the county file counts as filled, and skips a precinct when they differ.
import {execFileSync} from 'node:child_process';

export const pageUrl = c => c.page || c.url;
export const exportUrl = c => c.url;
export function sources(c, {county, election, file, asOf, sha256}) {
  return [{url: c.url, title: `${county} official winners list, ${election} (${file})`, type: 'results', as_of: asOf, sha256}];
}

const unzip = (path, member) => execFileSync('unzip', ['-p', path, member], {maxBuffer: 1 << 28}).toString('utf8');
const unxml = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function read(path, cfg) {
  const shared = [...unzip(path, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unxml(m[1]));
  const sheet = unzip(path, cfg.sheet || 'xl/worksheets/sheet1.xml');
  const re = new RegExp(cfg.race_pattern, 'i');
  const byPrecinct = new Map();
  for (const [, row] of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cell = col => {
      const m = row.match(new RegExp(`<c r="${col}\\d+"([^>]*)>(?:<v>([\\s\\S]*?)</v>|<is>([\\s\\S]*?)</is>)?`));
      if (!m) return '';
      return /t="s"/.test(m[1]) ? shared[+m[2]] : unxml(m[2] ?? m[3] ?? '');
    };
    const race = cell(cfg.race_column || 'A').trim(), m = race.match(re);
    if (!m) continue;
    const precinct = m.groups.precinct.trim(), name = cell(cfg.name_column || 'C').trim();
    if (!name) continue;
    if (!byPrecinct.has(precinct)) byPrecinct.set(precinct, {seat: cfg.seat, precinct, voteFor: cfg.vote_for || 1, choices: []});
    byPrecinct.get(precinct).choices.push({name, votes: 1, ballot: true});
  }
  return {generated: null, contests: [...byPrecinct.values()]};
}
