// Builds war_map/counties.geojson: county outlines dissolved from the PennDOT
// municipal boundaries, with 2024 presidential totals summed from data/*.json.
// Usage (from the repository root, with mapshaper installed):
//   node war_map/tools/build-counties.mjs path/to/mapshaper
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const mapshaper = process.argv[2] || 'mapshaper';
const root = new URL('../', import.meta.url).pathname;
const counties = Object.keys(JSON.parse(readFileSync(join(root, '../map-data.json'))).counties);
const slug = name => name.toLowerCase().replaceAll(' ', '-');

const features = [];
for (const county of counties) {
  const geo = JSON.parse(readFileSync(join(root, 'municipalities', slug(county) + '.geojson')));
  for (const f of geo.features) features.push({type: 'Feature', properties: {county}, geometry: f.geometry});
}
const dir = mkdtempSync(join(tmpdir(), 'counties-'));
const merged = join(dir, 'municipalities.json'), out = join(dir, 'counties.json');
writeFileSync(merged, JSON.stringify({type: 'FeatureCollection', features}));
execFileSync(mapshaper, ['-i', merged, 'snap', '-dissolve2', 'county', '-simplify', 'visvalingam', '3%', 'keep-shapes',
  '-clean', '-o', 'precision=0.00001', 'format=geojson', out], {stdio: 'inherit'});

const geo = JSON.parse(readFileSync(out));
for (const f of geo.features) {
  const {precincts} = JSON.parse(readFileSync(join(root, 'data', slug(f.properties.county) + '.json')));
  const sum = key => precincts.reduce((n, p) => n + (p[key] || 0), 0);
  Object.assign(f.properties, {
    precincts: precincts.length,
    trump: sum('trump'), harris: sum('harris'), total: sum('total'),
    trump_led: precincts.filter(p => p.trump > p.harris).length,
    harris_led: precincts.filter(p => p.harris > p.trump).length
  });
}
geo.features.sort((a, b) => a.properties.county.localeCompare(b.properties.county));
writeFileSync(join(root, 'counties.geojson'), JSON.stringify(geo));
console.log(geo.features.length + ' counties written');
