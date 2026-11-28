#!/usr/bin/env python3
"""Import Maryland's official 2026 Republican central committee results.

Usage: python3 -I war_map/tools/import-maryland-committee.py SOURCE_DIR [--dry-run]
SOURCE_DIR contains 1.html through 24.html from the Maryland State Board of Elections:
https://elections.maryland.gov/elections/2026/primary_results/gen_results_2026_by_county_<N>.html
"""
import datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
INDEX = json.loads((ROOT / 'states/md/index.json').read_text())
COUNTIES = {c['name'].lower().replace('saint', 'st.'): c for c in INDEX['counties']}
DISTRICT_ROSTER = {
    'Anne Arundel County': {'At large': 1, **{f'District {i}': 2 for i in range(1, 8)}},
    'Baltimore City': {f'District {i}': 2 for i in (1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 14)},
    'Baltimore County': {f'District {i}': 3 for i in range(1, 10)},
    'Montgomery County': {'At large': 4, 'District 9A': 1,
                          **{f'District {i}': 2 for i in (14, 15, 16, 17, 18, 19, 20, 39)}},
    "Prince George's County": {f'District {i}': 2 for i in (22, 23, 24, 26, 47)},
}
ROSTER_URL = 'https://www.msa.maryland.gov/msa/mdmanual/40party/html/repl.html'


class Results(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.heading = None
        self.heading_text = []
        self.office = None
        self.district = None
        self.contests = []
        self.current = None
        self.in_table = False
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag in ('h1', 'h2', 'h3', 'h4'):
            self.heading, self.heading_text = tag, []
        elif tag == 'table' and self.current:
            self.in_table = True
        elif tag == 'tr' and self.in_table:
            self.row = []
        elif tag == 'td' and self.row is not None:
            self.cell = {'text': '', 'winner': False}
        elif tag == 'img' and self.cell is not None:
            if dict(attrs).get('alt') == 'Winner Selected':
                self.cell['winner'] = True

    def handle_data(self, data):
        if self.heading:
            self.heading_text.append(data)
        if self.cell is not None:
            self.cell['text'] += data

    def handle_endtag(self, tag):
        if tag == self.heading:
            value = ' '.join(''.join(self.heading_text).split())
            if tag == 'h1':
                self.title = value
            elif tag == 'h2':
                self.office = value if value.startswith('Republican Central Committee') else None
                self.district = None
                self.current = None
            elif self.office:
                if value.startswith('District '):
                    self.district = value
                else:
                    match = re.fullmatch(r'Republican Candidates - Vote for (?:up to )?(\d+)', value)
                    if match:
                        label = 'At large' if 'At Large' in self.office else self.district or 'Countywide'
                        self.current = {'name': label, 'seats': int(match[1]), 'candidates': 0, 'winners': 0}
                        self.contests.append(self.current)
            self.heading = None
        elif tag == 'td' and self.cell is not None:
            self.row.append(self.cell)
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.current and len(self.row) > 1 and self.row[1]['text'].strip() == 'Republican':
                self.current['candidates'] += 1
                self.current['winners'] += int(self.row[0]['winner'])
            self.row = None
        elif tag == 'table':
            self.in_table = False


def build(source_dir, dry_run):
    expected = {c['slug'] for c in INDEX['counties']}
    seen = set()
    today = datetime.datetime.now(ZoneInfo('America/New_York')).date().isoformat()
    for number in range(1, 25):
        path = source_dir / f'{number}.html'
        text = path.read_text()
        parser = Results()
        parser.feed(text)
        title = re.fullmatch(r'Official 2026 Gubernatorial Primary Election Results for (.+)', parser.title)
        if not title:
            raise ValueError(f'{path}: not the official 2026 county results')
        name = title[1]
        key = name.lower().replace('saint', 'st.')
        county = COUNTIES.get(key)
        if not county:
            raise ValueError(f'{path}: unknown county {name}')
        seen.add(county['slug'])
        refreshed = re.search(r'Last refreshed:\s*(\d\d)/(\d\d)/(\d{4})', text)
        if not refreshed:
            raise ValueError(f'{path}: no source refresh date')
        as_of = f'{refreshed[3]}-{refreshed[1]}-{refreshed[2]}'
        contests = parser.contests
        if not contests or len({c['name'] for c in contests}) != len(contests):
            raise ValueError(f'{name}: missing or duplicate committee contest')
        if name in DISTRICT_ROSTER:
            actual = {c['name']: c['seats'] for c in contests}
            if actual != DISTRICT_ROSTER[name]:
                raise ValueError(f'{name}: district contests differ from current Maryland State Archives roster: {actual}')
        precincts = []
        for c in contests:
            if c['winners'] > c['seats'] or c['winners'] > c['candidates']:
                raise ValueError(f'{name}/{c["name"]}: more winners than seats or candidates')
            statuses = (['filled'] * c['winners'] +
                        ['unknown'] * min(c['seats'] - c['winners'], c['candidates'] - c['winners']) +
                        ['empty_no_filer'] * max(0, c['seats'] - c['candidates']))
            if len(statuses) != c['seats']:
                raise ValueError(f'{name}/{c["name"]}: seat count mismatch')
            precincts.append({'name': c['name'], 'seats': [{'seat': f'Member {i + 1}', 'status': s}
                                                          for i, s in enumerate(statuses)]})
        totals = {'precincts': len(precincts), 'seats': sum(c['seats'] for c in contests),
                  **{status: sum(seat['status'] == status for p in precincts for seat in p['seats'])
                     for status in ('filled', 'empty', 'empty_no_filer', 'unknown')}}
        multi = any(c['name'] != 'Countywide' for c in contests)
        doc = {
            'county': name, 'checked_at': today, 'method': 'election_results',
            'election': 'June 23, 2026 Gubernatorial Primary Election', 'as_of': as_of,
            'seats_per_precinct': None,
            'sources': [{'url': f'https://elections.maryland.gov/elections/2026/primary_results/gen_results_2026_by_county_{number}.html',
                         'title': f'Maryland State Board of Elections: Official 2026 Gubernatorial Primary Election Results for {name}',
                         'type': 'results', 'as_of': as_of}] +
                       ([{'url': ROSTER_URL, 'title': 'Maryland State Archives: Republican local central committees',
                          'type': 'roster', 'as_of': today}] if name in DISTRICT_ROSTER else []),
            'precincts': precincts, 'totals': totals,
            'coverage': 'full',
            'coverage_note': ('District seat counts and constituencies cross-checked against the Maryland State Archives roster.' if multi else None),
            'notes': 'Filled seats are candidates marked Winner Selected by the official results. Unfilled slots with no filed candidate are empty_no_filer; write-ins or later appointments may fill them. Candidate names are not stored. The listed units are central committee constituencies, not precincts on the presidential map.'
        }
        print(f'{name}: {len(contests)} contests, {totals["seats"]} seats, {totals["filled"]} winners, {doc["coverage"]}')
        if not dry_run:
            folder = ROOT / 'states/md/committee'
            folder.mkdir(exist_ok=True)
            (folder / f'{county["slug"]}.json').write_text(json.dumps(doc, indent=1) + '\n')
    if seen != expected:
        raise ValueError(f'county mismatch: {sorted(expected - seen)}')


if __name__ == '__main__':
    build(Path(sys.argv[1]), '--dry-run' in sys.argv[2:])
