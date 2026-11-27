// Anatomy of an Opportunity: a national map of Republican committee-seat coverage.
// Each state's War Map is linked; seat figures appear only where seats are counted from
// official rosters or results (see ../committee/README.md).
'use strict';

const ATLAS = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json';
const ABBR = {'01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY'};
const NORTHEAST = ['MD', 'DE', 'NJ', 'NY', 'CT', 'RI', 'MA', 'NH', 'VT', 'ME'];

// War Maps: ours, and partner organizations' maps.
const MAPS = {
  PA: {url: '../?layer=chairs', by: 'Young Republicans of Pennsylvania', seats: '../committee/summary.json'},
  TX: {url: 'https://yrtx.gop/map/', by: 'Young Republicans of Texas', external: true},
  FL: {url: 'https://www.flcollegegop.com/precinct', by: 'Florida College Republicans', external: true},
};
for (const st of NORTHEAST) MAPS[st] = {url: '../state/?st=' + st.toLowerCase(), by: 'Young Republicans of Pennsylvania', seats: `../states/${st.toLowerCase()}/committee.json`};

const VIEWS = {
  present: {label: 'Share of committee seats documented', ramp: ['#284264', '#159c94'], value: m => m.present / m.seats},
  empty: {label: 'Share of documented seats that are empty', ramp: ['#4a3440', '#ff3b47'], value: m => m.empty / m.present},
  filled: {label: 'Share of documented seats filled by a Republican', ramp: ['#24382c', '#4f9a66'], value: m => m.filled / m.present},
};
const NO_DATA = '#26344d', NO_MAP = '#141f33';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
let view = 'present', states = [];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

function metrics(t) {
  if (!t || !t.seats) return null;
  const empty = (t.empty || 0) + (t.empty_no_filer || 0), filled = t.filled || 0;
  return {seats: t.seats, filled, empty, present: filled + empty, missing: t.unknown || 0};
}

function fillFor(s) {
  if (!s.map) return NO_MAP;
  if (!s.m || !s.m.present) return NO_DATA;
  const v = VIEWS[view];
  return d3.interpolateRgb(v.ramp[0], v.ramp[1])(Math.max(0, Math.min(1, v.value(s.m))));
}

function bar(parts) {
  return h('div', {class: 'bar'}, parts.map(([n, total, color]) => h('span', {style: `width:${100 * n / total || 0}%;background:${color}`})));
}

function statusText(s) {
  if (!s.map) return 'No War Map yet';
  if (s.m) return `${pct(s.m.present, s.m.seats)} documented` + (s.cov && s.cov[0] < s.cov[1] ? ` · ${s.cov[0]} of ${s.cov[1]} counties` : '');
  return s.map.external ? 'Partner map · seats not counted here' : 'Map live · seats not yet documented';
}

function open(s) {
  if (!s.map) return;
  if (s.map.external) window.open(s.map.url, '_blank', 'noopener'); else location.href = s.map.url;
}

function renderNational() {
  const withSeats = states.filter(s => s.m);
  const t = withSeats.reduce((a, s) => ({seats: a.seats + s.m.seats, present: a.present + s.m.present, missing: a.missing + s.m.missing,
    empty: a.empty + s.m.empty, filled: a.filled + s.m.filled}), {seats: 0, present: 0, missing: 0, empty: 0, filled: 0});
  const live = states.filter(s => s.map).length;
  $('national').replaceChildren(
    h('div', {class: 'big'},
      h('div', {}, h('b', {text: `${live}`}), h('small', {text: 'states with a War Map'})),
      h('div', {}, h('b', {text: `${withSeats.length}`}), h('small', {text: 'states with seats counted'})),
      h('div', {}, h('b', {text: fmt(t.empty)}), h('small', {text: 'documented empty seats'}))),
    h('div', {class: 'stat'},
      h('div', {class: 'stat-row'}, h('span', {}, h('strong', {text: pct(t.present, t.seats)}), ' documented'), h('span', {text: `${pct(t.missing, t.seats)} missing`})),
      bar([[t.present, t.seats, '#159c94'], [t.missing, t.seats, '#3a4a66']]),
      h('div', {class: 'stat-row', style: 'margin-top:4px'}, h('span', {text: `${fmt(t.seats)} seats counted so far`}))),
    h('div', {class: 'stat'},
      h('div', {class: 'stat-row'}, h('span', {}, 'Of documented seats: ', h('strong', {text: pct(t.empty, t.present)}), ' empty'), h('span', {text: `${pct(t.filled, t.present)} filled by Republicans`})),
      bar([[t.empty, t.present, '#d9434c'], [t.filled, t.present, '#4f9a66']])));
}

function renderList() {
  const order = [...states].sort((a, b) => (!!b.map - !!a.map) || ((b.m?.present || 0) - (a.m?.present || 0)) || a.name.localeCompare(b.name));
  $('state-list').replaceChildren(...order.map(s => {
    const li = h('li', {tabindex: s.map ? '0' : '-1', 'data-st': s.st, onclick: () => open(s), onkeydown: e => { if (e.key === 'Enter') open(s); },
      onmouseenter: () => highlight(s.st), onmouseleave: () => highlight(null)},
      h('span', {class: 'nm'}, s.name, s.map ? h('span', {class: 'pill ' + (s.map.external ? 'ext' : 'live'), text: s.map.external ? 'Partner' : 'Live'}) : null),
      h('span', {class: 'st', text: statusText(s)}),
      s.m ? bar([[s.m.empty, s.m.seats, '#d9434c'], [s.m.filled, s.m.seats, '#4f9a66'], [s.m.missing, s.m.seats, '#3a4a66']]) : null);
    if (!s.map) li.style.cursor = 'default';
    return li;
  }));
}

function renderLegend() {
  const v = VIEWS[view];
  $('legend').replaceChildren(
    h('span', {class: 'ramp'}, '0%', h('span', {style: `background:linear-gradient(90deg,${v.ramp[0]},${v.ramp[1]})`}), '100%'),
    h('span', {text: v.label}),
    h('span', {}, h('i', {style: 'background:' + NO_DATA}), 'War Map, seats not counted'),
    h('span', {}, h('i', {style: 'background:' + NO_MAP}), 'No War Map yet'));
}

function tipHTML(s) {
  const lines = [`<b>${s.name}</b>`];
  if (s.m) {
    lines.push(`${fmt(s.m.seats)} committee seats counted` + (s.cov && s.cov[0] < s.cov[1] ? ` in ${s.cov[0]} of ${s.cov[1]} counties` : ''),
      `<span class="muted">Documented</span> ${pct(s.m.present, s.m.seats)} · <span class="muted">missing</span> ${pct(s.m.missing, s.m.seats)}`,
      `<span class="muted">Of documented:</span> ${pct(s.m.empty, s.m.present)} empty · ${pct(s.m.filled, s.m.present)} filled`);
  } else lines.push(`<span class="muted">${statusText(s)}</span>`);
  if (s.map) lines.push(`<span class="muted">${s.map.external ? s.map.by + ' · opens their map' : 'Click to open the War Map'}</span>`);
  return lines.join('<br>');
}

function highlight(st) {
  d3.selectAll('#usmap .state').classed('on', d => d.st === st);
  document.querySelectorAll('#state-list li').forEach(li => li.classList.toggle('on', li.dataset.st === st));
}

function draw(us) {
  const svg = d3.select('#usmap'), box = $('usmap').getBoundingClientRect();
  const W = box.width || 960, H = box.height || 600;
  const feats = topojson.feature(us, us.objects.states).features.filter(f => ABBR[f.id]);
  const proj = d3.geoAlbersUsa().fitExtent([[24, 70], [W - 24, H - 70]], {type: 'FeatureCollection', features: feats});
  const path = d3.geoPath(proj), tip = $('tip');
  svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove();
  const byId = Object.fromEntries(states.map(s => [s.fips, s]));
  svg.append('g').selectAll('path').data(feats.map(f => Object.assign(f, byId[f.id]))).join('path')
    .attr('class', d => 'state' + (d.map ? '' : ' nomap')).attr('d', path).attr('fill', fillFor)
    .attr('role', d => d.map ? 'link' : null).attr('aria-label', d => `${d.name}: ${statusText(d)}`)
    .on('mousemove', (e, d) => {
      const r = $('usmap').getBoundingClientRect();
      tip.innerHTML = tipHTML(d); tip.hidden = false;
      const x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
      tip.style.left = Math.min(x, r.width - 300) + 'px'; tip.style.top = Math.min(y, r.height - 140) + 'px';
      highlight(d.st);
    })
    .on('mouseleave', () => { tip.hidden = true; highlight(null); })
    .on('click', (e, d) => open(d));
  svg.append('g').selectAll('text').data(feats).join('text')
    .attr('class', d => 'label' + (d.map ? '' : ' dim'))
    .attr('transform', d => { const c = path.centroid(d); return isNaN(c[0]) ? 'translate(-99,-99)' : `translate(${c})`; })
    .attr('dy', '.35em').text(d => d.st);
}

function setView(v) {
  view = v;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  d3.selectAll('#usmap .state').attr('fill', fillFor);
  renderLegend();
}

async function main() {
  const us = await (await fetch(ATLAS)).json();
  const names = Object.fromEntries(us.objects.states.geometries.map(g => [g.id, g.properties.name]));
  states = Object.entries(ABBR).filter(([f]) => f !== '11').map(([fips, st]) => ({fips, st, name: names[fips], map: MAPS[st] || null, m: null}));
  await Promise.all(states.filter(s => s.map?.seats).map(async s => {
    try {
      const j = await (await fetch(s.map.seats)).json();
      s.m = metrics(j.total || j.totals);
      if (s.m && j.counties_total) s.cov = [j.counties_counted, j.counties_total];
    } catch { s.m = null; }
  }));
  renderNational(); renderList(); renderLegend(); draw(us);
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => draw(us), 150); });
}
main().catch(err => { $('national').textContent = 'The map could not load: ' + err.message; });
