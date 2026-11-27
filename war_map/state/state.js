// War Map for one state (?st=nj): 2024 presidential results by precinct or town, loaded
// county by county, and the state's Republican committee structure where documented.
'use strict';

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
const COUNTIES = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json';
const SUPPORTED = ['md', 'de', 'nj', 'ny', 'ct', 'ri', 'ma', 'nh', 'vt', 'me'];
const LOAD_ALL = 7000;          // states with fewer units load every county at once (all but New York)
const LOAD_ZOOM = 7.4;          // otherwise counties load once zoomed in this far
const COLORS = {r: ['#e8a29b', '#d4605a', '#a8302f'], d: ['#9cc3e4', '#4f8fc9', '#245f9e'], tie: '#9b7bb5', none: '#5b6676'};
const UNKNOWN_SEAT = '#6b7891';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
const st = (new URLSearchParams(location.search).get('st') || '').toLowerCase();
let info, committee = null, map, layer = 'results', popup;
const loaded = new Map(), features = [];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}
const margin = p => p.total ? (p.rep - p.dem) / p.total : null;
function colorFor(m) {
  if (m == null) return COLORS.none;
  if (m === 0) return COLORS.tie;
  const s = Math.abs(m) >= .3 ? 2 : Math.abs(m) >= .1 ? 1 : 0;
  return (m > 0 ? COLORS.r : COLORS.d)[s];
}
const marginText = m => m == null ? 'Counts unavailable' : m === 0 ? 'Tied' : (m > 0 ? 'Trump +' : 'Harris +') + (Math.abs(m) * 100).toFixed(1);
const unitWord = (n = 2) => info.unit === 'town' ? (n === 1 ? 'town' : 'towns') : (n === 1 ? 'precinct' : 'precincts');

function voteBlock(p) {
  const other = Math.max(0, p.total - p.rep - p.dem);
  return [
    h('div', {class: 'vbar'}, h('span', {style: `width:${100 * p.rep / p.total || 0}%`}), h('span', {style: `width:${100 * p.dem / p.total || 0}%`})),
    h('div', {class: 'vrow'}, h('span', {text: `Trump ${fmt(p.rep)} (${pct(p.rep, p.total)})`}), h('span', {text: `Harris ${fmt(p.dem)} (${pct(p.dem, p.total)})`})),
    h('div', {class: 'kv'}, h('span', {text: 'Margin'}), h('span', {text: marginText(margin(p))}), h('span', {text: 'Other and write-ins'}), h('span', {text: fmt(other)}),
      h('span', {text: 'Total votes'}), h('span', {text: fmt(p.total)}))];
}

function committeeNote() {
  if (committee?.structure) {
    const c = committee.structure;
    return h('div', {class: 'note'}, h('b', {text: 'Republican committee seats'}),
      h('div', {text: c.summary}),
      c.source ? h('div', {}, h('a', {href: c.source, text: c.source_title || 'Official source'}), ` · checked ${committee.checked_at}`) : null,
      h('div', {style: 'margin-top:6px;color:var(--muted)', text: committee.totals ? '' : 'Seat-by-seat status has not been documented yet, so the Empty chairs layer shows every unit as not known.'}));
  }
  return h('div', {class: 'note warn'}, h('b', {text: 'Committee seats not yet documented'}),
    h('div', {text: `Who holds each Republican committee seat in ${info.name} hasn't been collected from official rosters or results yet. The Empty chairs layer shows every ${unitWord(1)} as not known until it is.`}));
}

function renderHome() {
  const list = [...info.counties].sort((a, b) => a.name.localeCompare(b.name));
  $('panel').replaceChildren(
    h('p', {class: 'eyebrow', text: 'War Map'}), h('h2', {text: info.name}),
    h('p', {class: 'lede', text: `${info.election}: ${fmt(info.totals.units)} ${unitWord()} in ${info.counties.length} counties. Zoom in or pick a county to see ${unitWord()}.`}),
    ...voteBlock(info.totals), committeeNote(),
    h('h3', {text: 'Counties'}),
    h('ul', {class: 'clist'}, list.map(c => h('li', {onclick: () => openCounty(c)}, h('span', {text: c.name}), h('small', {text: marginText(margin(c))})))));
}

function renderCounty(c) {
  const units = features.filter(f => f.properties.county === c.slug).sort((a, b) => a.properties.name.localeCompare(b.properties.name, undefined, {numeric: true}));
  $('panel').replaceChildren(
    h('button', {class: 'back', onclick: () => { renderHome(); fitBox(info.bbox); }, text: '← ' + info.name}),
    h('p', {class: 'eyebrow', text: 'County'}), h('h2', {text: c.name}),
    h('p', {class: 'lede', text: `${fmt(c.units)} ${unitWord(c.units)} mapped.`}), ...voteBlock(c),
    h('h3', {text: info.unit === 'town' ? 'Towns' : 'Precincts'}),
    h('ul', {class: 'clist'}, units.map(f => h('li', {onclick: () => openUnit(f)}, h('span', {text: f.properties.name}), h('small', {text: marginText(margin(f.properties))})))));
}

function renderUnit(f) {
  const p = f.properties, c = info.counties.find(x => x.slug === p.county);
  $('panel').replaceChildren(
    h('button', {class: 'back', onclick: () => c ? openCounty(c) : renderHome(), text: '← ' + (c ? c.name : info.name)}),
    h('p', {class: 'eyebrow', text: info.unit === 'town' ? 'Town' : 'Precinct'}), h('h2', {text: p.name}),
    h('p', {class: 'lede', text: `${c ? c.name + ', ' : ''}${info.name} · ${p.official ? 'official boundary' : 'boundary estimated by the publisher'}`}),
    ...voteBlock(p),
    h('div', {class: 'note'}, h('b', {text: 'Committee seats here'}), h('div', {text: 'Not yet documented from an official roster or results.'})));
}

function fitBox(b) { map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {padding: {top: 70, bottom: 60, left: innerWidth > 900 ? 400 : 20, right: 30}, maxZoom: 12}); }
function openCounty(c) { fitBox(c.bbox); loadCounty(c).then(() => renderCounty(c)); }
function openUnit(f) {
  const b = bboxOf(f.geometry); fitBox(b); renderUnit(f);
  map.setFilter('units-hi', ['==', ['get', 'id'], f.properties.id]);
}
function bboxOf(g) {
  let a = [180, 90, -180, -90];
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of poly[0]) a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)];
  return a;
}

async function loadCounty(c) {
  if (!loaded.has(c.slug)) loaded.set(c.slug, fetch(`../states/${st}/${c.slug}.json`).then(r => r.json()).then(fc => {
    for (const f of fc.features) { f.properties.county = c.slug; f.properties.fill = colorFor(margin(f.properties)); features.push(f); }
    map.getSource('units').setData({type: 'FeatureCollection', features});
  }));
  return loaded.get(c.slug);
}
function loadVisible() {
  if (info.totals.units > LOAD_ALL && map.getZoom() < LOAD_ZOOM) return;
  const b = map.getBounds();
  for (const c of info.counties) if (c.bbox[2] >= b.getWest() && c.bbox[0] <= b.getEast() && c.bbox[3] >= b.getSouth() && c.bbox[1] <= b.getNorth()) loadCounty(c);
}

function applyLayer() {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === layer)));
  map.setPaintProperty('units-fill', 'fill-color', layer === 'results' ? ['get', 'fill'] : UNKNOWN_SEAT);
  map.setPaintProperty('units-fill', 'fill-opacity', layer === 'results' ? .78 : .55);
  $('legend').replaceChildren(...(layer === 'results'
    ? [h('span', {}, h('i', {style: 'background:' + COLORS.r[2]}), 'Trump 30+'), h('span', {}, h('i', {style: 'background:' + COLORS.r[1]}), '10–30'), h('span', {}, h('i', {style: 'background:' + COLORS.r[0]}), '0–10'),
       h('span', {}, h('i', {style: 'background:' + COLORS.d[0]}), 'Harris 0–10'), h('span', {}, h('i', {style: 'background:' + COLORS.d[1]}), '10–30'), h('span', {}, h('i', {style: 'background:' + COLORS.d[2]}), '30+'),
       info.totals.units > LOAD_ALL ? h('span', {style: 'color:var(--muted)', text: `Zoom in to load ${unitWord()}`}) : null]
    : [h('span', {}, h('i', {style: 'background:' + UNKNOWN_SEAT}), 'Not known: committee seats not yet documented')]));
}

async function main() {
  if (!SUPPORTED.includes(st)) { location.replace('../anatomy/'); return; }
  info = await (await fetch(`../states/${st}/index.json`)).json();
  try { committee = await (await fetch(`../states/${st}/committee.json`)).json(); } catch { committee = null; }
  document.title = `${info.name} War Map | Young Republicans of Pennsylvania`;
  $('title').textContent = `${info.name} War Map`;
  $('credit').textContent = info.credit;
  renderHome();
  map = new maplibregl.Map({container: 'map', style: STYLE, bounds: [[info.bbox[0], info.bbox[1]], [info.bbox[2], info.bbox[3]]],
    fitBoundsOptions: {padding: {top: 70, bottom: 60, left: innerWidth > 900 ? 400 : 20, right: 30}}, attributionControl: {compact: true}});
  map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
  popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
  map.on('load', async () => {
    const empty = {type: 'FeatureCollection', features: []};
    map.addSource('units', {type: 'geojson', data: empty, tolerance: .3});
    map.addLayer({id: 'units-fill', type: 'fill', source: 'units', paint: {'fill-color': ['get', 'fill'], 'fill-opacity': .78}});
    map.addLayer({id: 'units-line', type: 'line', source: 'units', minzoom: 8, paint: {'line-color': '#0a1424', 'line-width': .4, 'line-opacity': .7}});
    map.addLayer({id: 'units-hi', type: 'line', source: 'units', filter: ['==', ['get', 'id'], ''], paint: {'line-color': '#fff', 'line-width': 2.4}});
    applyLayer();
    if (info.totals.units <= LOAD_ALL) info.counties.forEach(loadCounty); else loadVisible();
    try {
      const us = await (await fetch(COUNTIES)).json();
      const cs = topojson.feature(us, us.objects.counties).features.filter(f => String(f.id).startsWith(info.fips));
      map.addSource('counties', {type: 'geojson', data: {type: 'FeatureCollection', features: cs}});
      map.addLayer({id: 'county-line', type: 'line', source: 'counties', paint: {'line-color': '#c9d4e6', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, .6, 10, 1.6], 'line-opacity': .7}});
    } catch { /* county outlines are decoration only */ }
  });
  map.on('moveend', loadVisible);
  map.on('mousemove', 'units-fill', e => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b><br>${layer === 'results' ? marginText(margin(p)) + ` · ${fmt(p.total)} votes` : 'Committee seats: not known'}`).addTo(map);
  });
  map.on('mouseleave', 'units-fill', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
  map.on('click', 'units-fill', e => openUnit(features.find(f => f.properties.id === e.features[0].properties.id)));
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { layer = b.dataset.layer; applyLayer(); }));
}
main().catch(err => { $('panel').textContent = 'The map could not load: ' + err.message; });
