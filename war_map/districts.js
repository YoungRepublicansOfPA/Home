const chambers = {house:'PA House', senate:'PA Senate', congress:'U.S. House'};
const files = new Map();
let districtView = 0;
function districtFile(name) {
  if (!files.has(name)) files.set(name,localJSON('districts/' + name).catch(error => {
    files.delete(name);
    throw error;
  }));
  return files.get(name);
}
function leaveDistrictMap() {
  districtView++;
  el('district-map').hidden = true;
  document.querySelectorAll('[data-layer]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.layer === window.countyLayer)));
  el('members').replaceChildren();
  document.querySelectorAll('[data-district]').forEach(b => b.setAttribute('aria-pressed','false'));
}
function memberItem(kind, district, roster) {
  const li = document.createElement('li');
  li.append(chambers[kind] + (district == null ? ' · Boundary unresolved' : ' · District ' + district + ' · '));
  const member = roster[kind][district];
  if (member) {
    const link = document.createElement('a');
    link.href = member.url;
    link.textContent = member.name + ' (' + member.party + ')';
    li.append(link);
  }
  return li;
}
function showMembers(rows, roster) {
  const heading = document.createElement('h3');
  heading.textContent = 'Elected representatives';
  const list = document.createElement('ul');
  list.append(...rows.map(([k,d]) => memberItem(k,d,roster)));
  const date = document.createElement('small');
  date.textContent = 'Serving members · November 24, 2026';
  el('members').replaceChildren(heading,list,date);
}
async function districtLayer(kind) {
  closePrecincts();
  const token = districtView;
  document.querySelectorAll('[data-layer], [data-district]').forEach(b =>
    b.setAttribute('aria-pressed',String(b.dataset.district === kind)));
  el('map').hidden = true;
  el('district-map').hidden = false;
  el('district-map').replaceChildren();
  el('legend').textContent = 'Loading ' + chambers[kind] + ' districts…';
  try {
    const [geo,roster] = await Promise.all([districtFile(kind+'.geojson'),districtFile('members.json')]);
    if (districtView !== token) return;
    const svg = document.createElementNS(svgNS,'svg');
    svg.setAttribute('aria-label',chambers[kind]+' district boundaries');
    const select = document.createElement('select');
    select.setAttribute('aria-label','Inspect a '+chambers[kind]+' district');
    select.add(new Option('Choose a district',''));
    const paths = new Map();
    for (const f of [...geo.features].sort((a,b)=>a.properties.district-b.properties.district)) {
      const d = f.properties.district;
      const path = mapPath(f);
      const title = document.createElementNS(svgNS,'title');
      title.textContent = 'District ' + d + ' · ' + (roster[kind][d]?.name || 'Roster unavailable');
      path.append(title);
      path.style.fill = roster[kind][d]?.party === 'Republican' ? '#ad5450' :
        roster[kind][d]?.party === 'Democratic' ? '#4a85b3' : '#59687a';
      path.onclick = () => { select.value = String(d); select.onchange(); };
      select.add(new Option(title.textContent,String(d)));
      paths.set(String(d),path);
      svg.append(path);
    }
    el('district-map').append(svg,select);
    const full = svg.getBBox();
    fit(svg,full);
    select.onchange = () => {
      paths.forEach((p,d)=>p.classList.toggle('selected',d===select.value));
      if (!select.value) { fit(svg,full); el('members').replaceChildren(); return; }
      fit(svg,paths.get(select.value).getBBox());
      showMembers([[kind,select.value]],roster);
    };
    el('legend').textContent = chambers[kind]+' · '+paths.size+' districts · Red: Republican member · Blue: Democratic member. Choose a district to zoom and inspect its seat.';
  } catch {
    if (districtView === token) el('legend').textContent = 'District records could not load. Select the layer to retry.';
  }
}
document.querySelectorAll('[data-district]').forEach(b=>b.onclick=()=>districtLayer(b.dataset.district));

const pointTest = document.createElement('canvas').getContext('2d');
function contains(path,x,y) {
  return pointTest.isPointInPath(new Path2D(path),x,y,'evenodd');
}
window.locatePaAddress = async function(lon,lat,label,signal) {
  const x = (lon + 80)*760, y = (42-lat)*1000;
  const token = districtView;
  const extents = await districtFile('county-extents.json');
  const candidates = Object.entries(extents).filter(([, [cx,cy,w,h]]) =>
    x>=cx && x<=cx+w && y>=cy && y<=cy+h);
  const matches = (await Promise.all(candidates.map(async ([county]) => {
    const records = await loadReturns(county.toLowerCase());
    return records.filter(r=>contains(r.path,x,y)).map(r=>({county,id:r.id}));
  }))).flat();
  if (signal?.aborted || token !== districtView) throw Error('Map selection changed. Search again.');
  if (matches.length !== 1) return false;
  const {county,id} = matches[0];
  const entries = await window.selectMapCounty(county);
  const selected = entries?.find(e=>e.record.id===id);
  if (signal?.aborted || !selected) throw Error('The county selection changed. Search again.');
  selected.path.onclick();
  const request = districtView;
  const kinds = Object.keys(chambers);
  const [roster,...geos] = await Promise.all([districtFile('members.json'),...kinds.map(k=>districtFile(k+'.geojson'))]);
  if (signal?.aborted || request !== districtView || !selected.path.classList.contains('selected')) throw Error('Map selection changed. Search again.');
  const rows = geos.map((g,i)=>{
    const hits = g.features.filter(f=>contains(featurePath(f),x,y));
    return [kinds[i], hits.length===1 ? hits[0].properties.district : null];
  });
  showMembers(rows,roster);
  return {county,precinct:selected.record.name};
};
