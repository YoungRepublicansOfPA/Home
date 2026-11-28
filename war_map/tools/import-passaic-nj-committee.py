#!/usr/bin/env python3
"""Import Passaic County's certified 2025 Republican committee roster PDF.

Usage: python3 -I war_map/tools/import-passaic-nj-committee.py ROSTER.pdf
Requires pdftotext. No member names, addresses, slogans or emails are retained.
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
SOURCE = 'https://www.passaiccountynj.org/home/showpublisheddocument/8559/639104623738730000'
pdf = Path(sys.argv[1])
text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-'], text=True)
if 'PASSAIC COUNTY REPUBLICAN COUNTY COMMITTEE: Certified Results from June 10, 2025 Primary Election' not in text:
    raise ValueError('Unexpected Passaic roster')
row = re.compile(r'^(.+?)\s{2,}Members of the County Committee Republican(?:\s+(.+))?$')
districts = {}
for line in text.splitlines():
    m = row.match(line)
    if not m:
        continue
    name, member = m[1].strip(), (m[2] or '').strip()
    if not re.search(r'\bDistrict \d+$', name):
        raise ValueError(f'Unexpected district label: {name}')
    status = 'unknown' if not member else 'empty' if member.startswith('VACANT') else 'filled'
    districts.setdefault(name, []).append({'seat': f'Member {len(districts.get(name, [])) + 1}', 'status': status})

if len(districts) != 279 or any(len(seats) != 2 for seats in districts.values()):
    raise ValueError('Expected 279 unique districts with two county committee seats each')
precincts = [{'name': name, 'seats': seats} for name, seats in districts.items()]
statuses = [s['status'] for p in precincts for s in p['seats']]
if statuses.count('unknown') != 1:
    raise ValueError('Expected one blank, unresolved roster row')
today = datetime.datetime.now(ZoneInfo('America/New_York')).date().isoformat()
doc = {
    'county': 'Passaic County', 'checked_at': today, 'method': 'roster',
    'election': 'June 10, 2025 Primary Election', 'as_of': '2025-06-10',
    'seats_per_precinct': 2,
    'sources': [{'url': SOURCE, 'title': 'Passaic County Republican County Committee: Certified Results from June 10, 2025 Primary Election',
                 'type': 'roster', 'as_of': '2025-06-10', 'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest()}],
    'precincts': precincts,
    'totals': {'precincts': len(precincts), 'seats': len(statuses),
               **{k: statuses.count(k) for k in ('filled', 'empty', 'empty_no_filer', 'unknown')}},
    'coverage': 'full',
    'notes': 'Certified municipal-clerk list from the 2025 primary. A listed VACANT row is empty; a named row is filled. One district row has no member or vacancy marker, so its status is unknown. Later appointments and resignations are not reflected. Names and contact details are omitted. The 2024 presidential map has 283 units rather than the roster\'s 279 districts, so these seats appear in county totals only.'
}
out = ROOT / 'states/nj/committee/passaic-county.json'
out.write_text(json.dumps(doc, indent=1) + '\n')
print(out, doc['totals'])
