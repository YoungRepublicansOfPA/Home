#!/usr/bin/env python3
"""Rebuild Hamilton County NY's 2026 Republican county committee seat list.

Usage: python3 -I war_map/tools/import-hamilton-ny-committee.py PETITIONS.pdf PRIMARY_RESULTS.pdf
Requires pdftotext. Candidate names in the raw report are not copied to output.
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
PETITIONS_URL = 'https://www.hamiltoncountyny.gov/sites/default/files/2025-09/2026%20Petition%20Report%20Final.pdf'
RESULTS_URL = 'https://www.hamiltoncountyny.gov/sites/default/files/Cumulative%20Results-7-1-2026%2002-10-04%20PM.pdf'
OFFICE_URL = 'https://www.hamiltoncountyny.gov/government/board-elections'
TOWNS = ('Arietta', 'Benson', 'Hope', 'Indian Lake', 'Inlet', 'Lake Pleasant', 'Long Lake', 'Morehouse', 'Wells')

def pdf_text(path):
    return subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True)

petitions_pdf, results_pdf = map(Path, sys.argv[1:3])
petitions, results = pdf_text(petitions_pdf), pdf_text(results_pdf)
if ('Hamilton County Board of Elections' not in petitions or
        '4/9/2026 2:12 PM' not in petitions or 'Disposition: VALID' not in petitions):
    raise ValueError('Unexpected Hamilton 2026 valid-petition report')
if '2026 June Primary' not in results or 'County Committee' in results:
    raise ValueError('Unexpected Hamilton 2026 primary report or contested committee race')

counts = {town: 0 for town in TOWNS}
for line in petitions.splitlines():
    m = re.match(r'^\S.*?\s+REP\s+([A-Z ]+)/000/\d{3}-CC(?:-|\s)', line)
    if not m:
        continue
    town = m[1].title()
    if town not in counts:
        raise ValueError(f'Unexpected committee town {town}')
    counts[town] += 1
if sum(counts.values()) != 15 or any(n > 2 for n in counts.values()):
    raise ValueError(f'Expected 15 valid Republican filings, at most two per town: {counts}')

units = [{'name': town, 'seats': [{'seat': f'Member {i + 1}',
                                  'status': 'filled' if i < counts[town] else 'empty_no_filer'}
                                 for i in range(2)]}
         for town in TOWNS]
statuses = [s['status'] for p in units for s in p['seats']]
today = datetime.datetime.now(ZoneInfo('America/New_York')).date().isoformat()
doc = {
    'county': 'Hamilton County', 'checked_at': today, 'method': 'candidate_listing',
    'election': 'June 23, 2026 Primary', 'as_of': '2026-07-01', 'seats_per_precinct': 2,
    'sources': [
        {'url': OFFICE_URL, 'title': 'Hamilton County Board of Elections: two Republican committee seats per town and 2026 election information', 'type': 'rules', 'as_of': today},
        {'url': 'https://www.nysenate.gov/legislation/laws/ELN/6-160', 'title': 'New York Election Law § 6-160(2): uncontested designees deemed elected without balloting', 'type': 'rules', 'as_of': today},
        {'url': PETITIONS_URL, 'title': 'Hamilton County BOE Ultimate Candidate Report, valid designating petitions, April 9, 2026', 'type': 'candidate_listing', 'as_of': '2026-04-09', 'sha256': hashlib.sha256(petitions_pdf.read_bytes()).hexdigest()},
        {'url': RESULTS_URL, 'title': 'Hamilton County BOE June 23, 2026 Primary Results, run July 1 (no contested committee races)', 'type': 'results', 'as_of': '2026-07-01', 'sha256': hashlib.sha256(results_pdf.read_bytes()).hexdigest()}
    ],
    'precincts': units,
    'totals': {'precincts': len(units), 'seats': len(statuses),
               **{s: statuses.count(s) for s in ('filled', 'empty', 'empty_no_filer', 'unknown')}},
    'coverage': 'full',
    'notes': 'The county election office says each of nine towns has two Republican committee seats. Its valid-petition report lists 15 Republican county committee filings and no town has more than two. The posted primary results have no committee contest; under NY Election Law § 6-160(2), uncontested designees are deemed elected. Remaining seats are empty_no_filer, not confirmed current vacancies: later write-ins or appointments are not reflected. Committee units are towns, although filings identify election districts within them; the 2024 presidential map has 11 voting districts, so these seats are shown in county totals only. Candidate names are omitted.'
}
out = ROOT / 'states/ny/committee/hamilton-county.json'
out.write_text(json.dumps(doc, indent=1) + '\n')
print(out, doc['totals'])
