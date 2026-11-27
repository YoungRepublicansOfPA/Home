#!/usr/bin/env python3
"""Roll up a state's county committee files into war_map/states/<st>/committee.json.

Usage (from the repository root): python3 -I war_map/tools/build-state-committee.py [st ...]

Each war_map/states/<st>/committee/<county-slug>.json follows the format in
war_map/committee/README.md. This script checks that every file's totals equal the counts of its
seats, then writes `totals` (all counties with a seat list) and a `counties` table into the
state's committee.json, keeping its hand-written `structure` block. Exits non-zero on any error.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUSES = ('filled', 'empty', 'empty_no_filer', 'unknown')
METHODS = ('roster', 'election_results', 'candidate_listing', 'none_found')


def check(path, d):
    errs = []
    for k in ('county', 'checked_at', 'method', 'sources', 'precincts', 'totals'):
        if k not in d: errs.append(f'missing {k}')
    if errs: return errs
    if d['method'] not in METHODS: errs.append(f"bad method {d['method']}")
    if d['method'] != 'none_found' and not d['sources']: errs.append('no sources')
    for s in d['sources']:
        if not s.get('url') or not s.get('as_of'): errs.append('source without url or as_of')
    n = {k: 0 for k in STATUSES}
    for p in d['precincts']:
        for s in p.get('seats', []):
            if s.get('status') not in STATUSES: errs.append(f"bad status in {p.get('name')}")
            else: n[s['status']] += 1
            if 'holder' in s: errs.append('holder names are not collected for this state')
    seats = sum(n.values())
    t = d['totals']
    if t.get('precincts', 0) != len(d['precincts']): errs.append(f"totals.precincts {t.get('precincts')} != {len(d['precincts'])}")
    if t.get('seats', 0) != seats: errs.append(f"totals.seats {t.get('seats')} != {seats}")
    for k in STATUSES:
        if t.get(k, 0) != n[k]: errs.append(f'totals.{k} {t.get(k)} != {n[k]}')
    return errs


def build(st):
    base = os.path.join(ROOT, 'states', st)
    folder = os.path.join(base, 'committee')
    if not os.path.isdir(folder): print(f'{st}: no committee folder'); return True
    index = json.load(open(os.path.join(base, 'index.json')))
    names = {c['slug']: c['name'] for c in index['counties']}
    out_path = os.path.join(base, 'committee.json')
    out = json.load(open(out_path)) if os.path.exists(out_path) else {'state': st.upper()}
    total = {'seats': 0, 'precincts': 0, **{k: 0 for k in STATUSES}}
    rows, ok = [], True
    for f in sorted(os.listdir(folder)):
        if not f.endswith('.json'): continue
        slug = f[:-5]
        d = json.load(open(os.path.join(folder, f)))
        errs = ([f'unknown county slug {slug}'] if slug not in names else []) + check(f, d)
        if errs: ok = False; print(f'{st}/{f}: ' + '; '.join(errs)); continue
        t = d['totals']
        rows.append({'slug': slug, 'name': names[slug], 'method': d['method'], 'election': d.get('election'),
                     'as_of': d.get('as_of'), 'checked_at': d['checked_at'],
                     'totals': {k: t.get(k, 0) for k in ('precincts', 'seats', *STATUSES)},
                     'coverage': d.get('coverage', 'full'), 'coverage_note': d.get('coverage_note')})
        # A partial seat list (e.g. contested districts only) would distort the state's shares.
        if d['precincts'] and d.get('coverage', 'full') == 'full':
            for k in total: total[k] += t.get(k, 0)
    out['counties'] = rows
    out['counties_total'] = len(names)
    out['counties_counted'] = sum(1 for r in rows if r['totals']['seats'] and r['coverage'] == 'full')
    out['totals'] = total if total['seats'] else None
    out['notes'] = ('Totals cover the counties listed in `counties` that have a seat list. Counties without one, or with only a partial list (coverage: partial), are not '
                    'in the totals. Seat status follows war_map/committee/README.md.')
    json.dump(out, open(out_path, 'w'), indent=1)
    print(f"{st}: {len(rows)} county files, {out['counties_counted']} with seats; totals {total}")
    return ok


if __name__ == '__main__':
    states = sys.argv[1:] or sorted(os.listdir(os.path.join(ROOT, 'states')))
    good = all([build(s) for s in states if os.path.isdir(os.path.join(ROOT, 'states', s))])
    sys.exit(0 if good else 1)
