#!/usr/bin/env python3
"""Import Sussex County NJ's official Republican committee roster PDF.

Usage: python3 -I war_map/tools/import-sussex-nj-committee.py ROSTER.pdf
Requires pdftotext. Only vacancy status is published; names/contact details in
the original roster are intentionally excluded from the output.
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
SOURCE = 'https://www.sussex.nj.us/DocumentCenter/View/4341/2026-May-18-Official-GOP-CC-PDF'
pdf = Path(sys.argv[1])
text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-'], text=True)
if 'UPDATED: 05/18/2026' not in text or 'Republican County Committee Membership' not in text:
    raise ValueError('Unexpected Sussex roster version')
header = re.compile(r'^([A-Z][A-Z -]+-\d{2}-\d{2})\s*$')
member = re.compile(r'^\s*(\d+)\s+REP\s+(.+?)\s*$')
precincts = []
for line in text.splitlines():
    h = header.match(line)
    if h:
        precincts.append({'name': h[1], 'seats': []})
        continue
    m = member.match(line)
    if not m:
        continue
    if not precincts:
        raise ValueError('Member before a precinct header')
    district = int(precincts[-1]['name'][-2:])
    if int(m[1]) != district:
        raise ValueError(f'District mismatch: {precincts[-1]["name"]}: {line}')
    status = 'empty' if re.match(r'VACANCY\b', m[2]) else 'filled'
    precincts[-1]['seats'].append({'seat': f'Member {len(precincts[-1]["seats"]) + 1}', 'status': status})

if len(precincts) != 119 or len({p['name'] for p in precincts}) != 119 or any(len(p['seats']) != 2 for p in precincts):
    raise ValueError('Roster must have 119 unique districts with two county committee seats each')
statuses = [s['status'] for p in precincts for s in p['seats']]
today = datetime.datetime.now(ZoneInfo('America/New_York')).date().isoformat()
doc = {
    'county': 'Sussex County', 'checked_at': today, 'method': 'roster',
    'election': 'June 10, 2025 Primary Election', 'as_of': '2026-05-18',
    'seats_per_precinct': 2,
    'sources': [{'url': SOURCE, 'title': 'Sussex County Republican County Committee Membership, updated May 18, 2026',
                 'type': 'roster', 'as_of': '2026-05-18', 'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest()}],
    'precincts': precincts,
    'totals': {'precincts': len(precincts), 'seats': len(statuses),
               **{k: statuses.count(k) for k in ('filled', 'empty', 'empty_no_filer', 'unknown')}},
    'coverage': 'full',
    'notes': 'The county roster lists two county committee seats in each of 119 districts. VACANCY is empty; a listed member is filled. The roster was updated May 18, 2026; later changes are not reflected. Member names and contact details are omitted. The 2024 presidential map has 118 units, so the roster districts are shown in county totals only and are not assigned to map polygons.'
}
out = ROOT / 'states/nj/committee/sussex-county.json'
out.write_text(json.dumps(doc, indent=1) + '\n')
print(out, doc['totals'])
