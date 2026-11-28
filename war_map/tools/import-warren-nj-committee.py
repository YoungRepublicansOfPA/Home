#!/usr/bin/env python3
"""Import Warren County NJ's published 2025–2026 Republican committee roster.

Usage: python3 -I war_map/tools/import-warren-nj-committee.py ROSTER.pdf
Requires pdftotext. Names and emails in the source are never retained.
"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.warrencountyvotes.com/home/showpublisheddocument/12405/638947387746770000'
TOWNS = {'Allamuchy', 'Alpha', 'Belvidere', 'Blairstown', 'Franklin', 'Frelinghuysen',
         'Greenwich', 'Hackettstown', 'Hardwick', 'Harmony', 'Hope', 'Independence',
         'Knowlton', 'Liberty', 'Lopatcong', 'Mansfield', 'Oxford', 'Phillipsburg',
         'Pohatcong', 'Washington Borough', 'Washington Township', 'White'}
pdf = Path(sys.argv[1])
text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-'], text=True)
if '2025 - 2026 Warren County Republican County Committee' not in text:
    raise ValueError('Unexpected Warren roster')
lines = text.splitlines()
town = None
precincts = []
for i, line in enumerate(lines):
    heading = re.sub(r'\s+Email$', '', line.strip()).removesuffix(' - continued')
    if heading in TOWNS:
        town = heading
        continue
    m = re.match(r'^District (\d+(?:-\d+)?):\s+(.+)$', line.strip())
    if not m:
        continue
    if town is None or i + 1 >= len(lines) or not lines[i + 1].strip():
        raise ValueError(f'Missing Warren district or second member: {line}')
    statuses = ['empty' if entry.strip().lower().startswith('vacant') else 'filled'
                for entry in (m[2], lines[i + 1])]
    precincts.append({'name': f'{town} District {m[1]}',
                      'seats': [{'seat': f'Member {n}', 'status': status}
                                for n, status in enumerate(statuses, 1)]})

if len(precincts) != 86 or len({p['name'] for p in precincts}) != 86 or len({p['name'].rsplit(' District ', 1)[0] for p in precincts}) != 22:
    raise ValueError('Expected 86 unique districts in 22 municipalities')
statuses = [s['status'] for p in precincts for s in p['seats']]
today = datetime.datetime.now(ZoneInfo('America/New_York')).date().isoformat()
doc = {
    'county': 'Warren County', 'checked_at': today, 'method': 'roster',
    'election': '2025–2026 county committee term', 'as_of': '2025-09-29',
    'seats_per_precinct': 2,
    'sources': [{'url': SOURCE, 'title': 'Warren County Republican County Committee, 2025–2026 roster',
                 'type': 'roster', 'as_of': '2025-09-29', 'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest()}],
    'precincts': precincts,
    'totals': {'precincts': len(precincts), 'seats': len(statuses),
               **{k: statuses.count(k) for k in ('filled', 'empty', 'empty_no_filer', 'unknown')}},
    'coverage': 'full',
    'notes': 'The 2025–2026 county roster, created September 29, 2025, lists two seats per district in 22 municipalities. A listed Vacant seat is empty; a named seat is filled. Later appointments and resignations are not reflected. Names and email addresses are omitted. County totals are not assigned to 2024 presidential map polygons.'
}
out = ROOT / 'states/nj/committee/warren-county.json'
out.write_text(json.dumps(doc, indent=1) + '\n')
print(out, doc['totals'])
