const el = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
let loadNumber = 0;

function closePrecincts() {
  loadNumber++;
  el('map').hidden = el('legend').hidden = false;
  el('local').hidden = el('controls').hidden = true;
  el('county').value = '';
  el('name').textContent = 'Pennsylvania';
  el('stats').textContent = '';
  el('profile').hidden = true;
}
el('back').onclick = closePrecincts;

async function localJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(url);
  return response.json();
}

// Use the same local equirectangular projection for both geographic layers.
function featurePath(feature) {
  const {type, coordinates} = feature.geometry;
  const polygons = type === 'Polygon' ? [coordinates] : coordinates;
  return polygons.flatMap(poly => poly.map(ring => ring.map(([lon,lat], i) =>
    (i ? 'L' : 'M') + ((lon + 80) * 760).toFixed(2) + ',' + ((42 - lat) * 1000).toFixed(2)
  ).join('') + 'Z')).join('');
}
function mapPath(feature) {
  const path = document.createElementNS(svgNS,'path');
  path.setAttribute('d',feature.path || featurePath(feature));
  path.setAttribute('fill-rule','evenodd');
  return path;
}
function fit(svg, box) {
  const pad = Math.max(box.width,box.height) * .055 || 1;
  svg.setAttribute('viewBox',[box.x-pad, box.y-pad, box.width+2*pad, box.height+2*pad].join(' '));
}
async function openPrecincts(county) {
  const token = ++loadNumber;
  const slug = county.toLowerCase().replaceAll(' ','-');
  el('local').hidden = false;
  el('map').hidden = el('legend').hidden = el('controls').hidden = el('extent').hidden = true;
  el('detail-mode').hidden = true;
  el('drawing').replaceChildren();
  el('votes').replaceChildren();
  el('local-title').textContent = county + ' County';
  el('key').textContent = 'Loading precinct boundaries and vote counts…';
  try {
    const [precincts, municipalities] = await Promise.all([
      loadReturns(slug), localJSON('municipalities/' + slug + '.geojson')
    ]);
    if (token !== loadNumber) return;
    renderLocal(county, precincts, municipalities.features);
  } catch (error) {
    if (token === loadNumber) el('key').textContent = 'County records could not load. Return to Pennsylvania and select the county to retry.';
  }
}
function renderLocal(county, precincts, municipalities) {
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('aria-label',county + ' County precinct map');
  const group = document.createElementNS(svgNS,'g');
  svg.append(group);
  el('drawing').replaceChildren(svg);
  el('controls').hidden = el('detail-mode').hidden = false;
  const picker = el('precinct'), muni = el('municipality');
  muni.replaceChildren(new Option('Whole county',''));
  picker.replaceChildren(new Option('Choose a precinct',''));
  const munPaths = [];
  const entries = [];
  for (const record of precincts) {
    const path = mapPath(record);
    const {name, trump, harris} = record;
    const lead = trump == null || harris == null ? null : trump-harris;
    const margin = record.total ? Math.abs(lead) / record.total : 0;
    const strength = margin >= .30 ? 2 : margin >= .10 ? 1 : 0;
    const reds = ['#ce918a','#b95e55','#963f3a'];
    const blues = ['#8cb5d0','#518fbb','#316b9c'];
    path.style.fill = lead === null ? '#566377' : lead > 0 ? reds[strength] : lead < 0 ? blues[strength] : '#986d97';
    const title = document.createElementNS(svgNS,'title');
    title.textContent = lead === null ? name : name + ' · Trump ' + trump.toLocaleString('en-US') + ' · Harris ' + harris.toLocaleString('en-US');
    path.append(title);
    group.append(path);
    const i = entries.length;
    entries.push({record,path});
    
    path.onclick = () => { if (![...picker.options].some(option => option.value === String(i))) { listPrecincts(); muni.value = ''; } picker.value = String(i); inspect(i); zoom(path); };
  }
  for (const record of municipalities.sort((a,b) => a.properties.name.localeCompare(b.properties.name))) {
    const path = mapPath(record);
    path.setAttribute('class','boundary');
    group.append(path);
    muni.add(new Option(record.properties.name,String(munPaths.length)));
    const index = munPaths.length;
    path.onclick = () => { muni.value = String(index); muni.onchange(); };
    const title = document.createElementNS(svgNS,'title');
    title.textContent = record.properties.name;
    path.append(title);
    munPaths.push(path);
  }
  const bounds = group.getBBox();
  function municipalMode(enabled) {
    el('pick-muni').setAttribute('aria-pressed', String(enabled));
    el('pick-precinct').setAttribute('aria-pressed', String(!enabled));
    munPaths.forEach(path => {
      path.style.pointerEvents = enabled ? 'all' : 'none';
      path.style.fill = enabled ? '#223952' : 'none';
    });
  }
  el('pick-muni').onclick = () => municipalMode(true);
  el('pick-precinct').onclick = () => municipalMode(false);
  municipalMode(false);
  function listPrecincts(municipality) {
    picker.replaceChildren(new Option('Choose a precinct',''));
    for (const [i, {record}] of entries.entries()) {
      if (!municipality || record.municipality === municipality)
        picker.add(new Option(record.name,String(i)));
    }
  }
  function resetView() {
    fit(svg,bounds);
    el('extent').hidden = true;
    muni.value = '';
    listPrecincts();
  }
  function zoom(path) {
    fit(svg,path.getBBox());
    el('extent').hidden = false;
  }
  function inspect(i) {
    entries.forEach(e => e.path.classList.remove('selected'));
    el('votes').replaceChildren();
    if (i === '') return;
    const {record,path} = entries[Number(i)];
    path.classList.add('selected');
    showVotes(record);
  }
  picker.onchange = () => {
    inspect(picker.value);
    if (picker.value !== '') { municipalMode(false); zoom(entries[Number(picker.value)].path); }
  };
  muni.onchange = () => {
    picker.value = ''; inspect('');
    if (muni.value === '') resetView(); else {
      zoom(munPaths[Number(muni.value)]);
      listPrecincts(municipalities[Number(muni.value)].properties.name);
    }
    municipalMode(false);
  };
  el('extent').onclick = resetView;
  resetView();
  el('key').textContent = '2024 U.S. president · Red: Trump ahead of Harris · Blue: Harris ahead of Trump · Purple: tied · Gray: counts unavailable. Darker shades indicate margins of 10 and 30 percentage points. Light lines mark municipalities.';
}

async function loadReturns(slug) {
  const data = await localJSON('data/' + slug + '.json');
  return data.precincts;
}
function showVotes(record) {
  const panel = el('votes');
  const heading = document.createElement('h3');
  heading.textContent = record.name;
  const description = document.createElement('p');
  description.textContent = record.municipality + ' · U.S. president · November 5, 2024';
  const table = document.createElement('table');
  table.setAttribute('aria-label','Presidential votes in ' + record.name);
  for (const [label, value] of [['Donald Trump',record.trump], ['Kamala Harris',record.harris], ['Other votes combined',record.other], ['Total votes reported',record.total]]) {
    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = value == null ? 'Unavailable' : value.toLocaleString('en-US');
  }
  panel.replaceChildren(heading,description,table);
}
