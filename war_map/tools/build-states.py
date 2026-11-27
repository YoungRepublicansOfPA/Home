#!/usr/bin/env python3
"""Build the multi-state War Map data from the New York Times 2024 precinct files.

Usage (from the repository root):
  python3 -I war_map/tools/build-states.py DOWNLOAD_DIR [ST ...]

DOWNLOAD_DIR must hold <ST>.geojson.gz files (saved from <ST>-precincts-with-results.geojson.gz)
https://int.nyt.com/newsgraphics/elections/map-data/2024/national/ and the Census
national county list (national_county2020.txt). Writes war_map/states/<st>/index.json and one
GeoJSON file per county. Geometry is simplified (Douglas-Peucker) and rounded for display only.
"""
import gzip, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'states')
STATES = {
    'MD': ('Maryland', '24'), 'DE': ('Delaware', '10'), 'NJ': ('New Jersey', '34'), 'NY': ('New York', '36'),
    'CT': ('Connecticut', '09'), 'RI': ('Rhode Island', '44'), 'MA': ('Massachusetts', '25'),
    'NH': ('New Hampshire', '33'), 'VT': ('Vermont', '50'), 'ME': ('Maine', '23'),
}
# Connecticut's county-equivalents since 2022 are planning regions (Census 2022+ codes).
CT_REGIONS = {'09110': 'Capitol', '09120': 'Greater Bridgeport', '09130': 'Lower Connecticut River Valley',
              '09140': 'Naugatuck Valley', '09150': 'Northeastern Connecticut', '09160': 'Northwest Hills',
              '09170': 'South Central Connecticut', '09180': 'Southeastern Connecticut', '09190': 'Western Connecticut'}
TOWN_STATES = {'CT', 'ME', 'NH', 'RI', 'VT'}   # NYT/AP report these by town, not precinct
TOL = 0.00008                                    # simplification tolerance, degrees (~8 m)
CREDIT = ('2024 Precinct-Level Election Results, The New York Times (town results for CT, ME, NH, RI and VT by '
          'The Associated Press). Redistribution subject to the NYT Computational Use of Data Agreement; see '
          'war_map/data/NYT-LICENSE.txt and NYT-CREDITS.md.')


def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1; L = (dx * dx + dy * dy) ** .5 or 1e-12
        best, idx = 0, -1
        for i in range(a + 1, b):
            x, y = pts[i]; d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
            if d > best: best, idx = d, i
        if best > tol: keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring(r):
    # A closed ring starts and ends on the same point, so simplify its two halves separately.
    mid = len(r) // 2
    r = dp(r[:mid + 1], TOL) + dp(r[mid:], TOL)[1:]
    r = [[round(x, 5), round(y, 5)] for x, y in r]
    out = [r[0]] + [p for i, p in enumerate(r[1:], 1) if p != r[i - 1]]
    if out[0] != out[-1]: out.append(out[0])
    return out if len(out) >= 4 else None


def geom(g):
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    out = []
    for poly in polys:
        rings = [ring(r) for r in poly]
        if rings and rings[0]: out.append([r for r in rings if r])
    if not out: return None
    return {'type': 'Polygon', 'coordinates': out[0]} if len(out) == 1 else {'type': 'MultiPolygon', 'coordinates': out}


def bbox(gs):
    xs, ys = [], []
    for g in gs:
        for poly in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            for x, y in poly[0]: xs.append(x); ys.append(y)
    return [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]


def county_names(path):
    names = {}
    for line in open(path, encoding='latin-1').read().splitlines()[1:]:
        st, sf, cf, _, name, *_ = line.split('|'); names[sf + cf] = name
    names.update({k: v + ' Planning Region' for k, v in CT_REGIONS.items()})
    return names


def build(st, src, names):
    name, fips = STATES[st]
    feats = json.load(gzip.open(os.path.join(src, f'{st}.geojson.gz')))['features']
    by = {}
    for f in feats:
        p = f['properties']; gid = p['GEOID']; cfips = gid[:5]
        g = geom(f['geometry']) if f.get('geometry') else None
        if not g: continue
        label = gid[6:].strip()
        if st == 'CT': label = label.split('-', 1)[-1]           # "110-Marlborough" -> "Marlborough"
        by.setdefault(cfips, []).append({'type': 'Feature', 'geometry': g, 'properties': {
            'id': gid, 'name': label, 'rep': p.get('votes_rep') or 0, 'dem': p.get('votes_dem') or 0,
            'total': p.get('votes_total') or 0, 'official': bool(p.get('official_boundary'))}})
    d = os.path.join(OUT, st.lower()); os.makedirs(d, exist_ok=True)
    counties, tot = [], {'rep': 0, 'dem': 0, 'total': 0, 'units': 0}
    for cf in sorted(by):
        fs = by[cf]; cname = names.get(cf, cf); s = slug(cname)
        json.dump({'type': 'FeatureCollection', 'county': cname, 'features': fs}, open(os.path.join(d, s + '.json'), 'w'), separators=(',', ':'))
        c = {'fips': cf, 'name': cname, 'slug': s, 'bbox': bbox([f['geometry'] for f in fs]), 'units': len(fs),
             **{k: sum(f['properties'][k] for f in fs) for k in ('rep', 'dem', 'total')}}
        counties.append(c)
        for k in ('rep', 'dem', 'total'): tot[k] += c[k]
        tot['units'] += len(fs)
    idx = {'state': st, 'name': name, 'fips': fips, 'unit': 'town' if st in TOWN_STATES else 'precinct',
           'election': 'November 5, 2024 presidential election', 'credit': CREDIT,
           'source': f'https://int.nyt.com/newsgraphics/elections/map-data/2024/national/{st}-precincts-with-results.geojson.gz',
           'bbox': [min(c['bbox'][0] for c in counties), min(c['bbox'][1] for c in counties),
                    max(c['bbox'][2] for c in counties), max(c['bbox'][3] for c in counties)],
           'totals': tot, 'counties': counties}
    json.dump(idx, open(os.path.join(d, 'index.json'), 'w'), indent=1)
    size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
    print(f'{st}: {tot["units"]} units in {len(counties)} counties, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    src = sys.argv[1]; names = county_names(os.path.join(src, 'national_county2020.txt'))
    for st in (sys.argv[2:] or STATES): build(st, src, names)
