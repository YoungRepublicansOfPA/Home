async function start() {
  const get = async path => {
    const response = await fetch('../' + path);
    if (!response.ok) throw Error(path);
    return response;
  };
  const [svg, data] = await Promise.all([
    get('county-map.svg').then(r => r.text()),
    get('map-data.json').then(r => r.json())
  ]);
  const byId = id => document.getElementById(id);
  byId('map').innerHTML = svg;
  const select = byId('county');
  const paths = [...document.querySelectorAll('path[data-county]')];
  const shades = ['#284264', '#35678b', '#297c95', '#218e96', '#159c94'];
  const thresholds = [50000, 100000, 250000, 500000];
  const compact = new Intl.NumberFormat('en', {notation:'compact',maximumFractionDigits:1});
  let layer = 'population';
  for (const path of paths) {
    const name = path.dataset.county;
    select.add(new Option(name, name));
    path.onclick = () => choose(name);
    const box = path.getBBox();
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('x', box.x + box.width / 2);
    label.setAttribute('y', box.y + box.height / 2);
    label.setAttribute('text-anchor','middle');
    label.dataset.label = name;
    path.ownerSVGElement.append(label);
  }
  function choose(name) {
    select.value = name;
    if (!name) { closePrecincts(); return; }
    openPrecincts(name);
    const county = data.counties[name];
    byId('name').textContent = name + ' County';
    byId('stats').textContent = county.population.toLocaleString('en-US') + ' residents · Governing majority: ' + (county.party_control || 'unverified');
    byId('profile').hidden = false;
    byId('profile').href = '../#county-' + name.toLowerCase().replaceAll(' ', '-');
    paths.forEach(p => p.classList.toggle('selected',p.dataset.county === name));
  }
  function draw() {
    const pop = layer === 'population';
    for (const path of paths) {
      const county = data.counties[path.dataset.county];
      path.style.fill = pop ? shades[thresholds.filter(n => county.population >= n).length] :
        ({Republican:'#b05151', Democratic:'#407db4'}[county.party_control] || '#455467');
      const label = document.querySelector('[data-label="' + path.dataset.county + '"]');
      label.textContent = pop ? compact.format(county.population) : (county.party_control || '')[0] || '';
    }
    byId('legend').textContent = pop ? 'Population in 2025 · Dark blue to teal: under 50k / 50k–99k / 100k–249k / 250k–499k / 500k and up.' : 'County governing majority · R red · D blue · Gray unverified. Records checked ' + data.checked_at + '.';
  }
  select.onchange = () => choose(select.value);
  document.querySelectorAll('[data-layer]').forEach(button => button.onclick = () => {
    closePrecincts();
    layer = button.dataset.layer;
    document.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    draw();
  });
  byId('name').textContent = 'Pennsylvania';
  byId('profile').hidden = true;
  draw();
}
start().catch(() => { document.getElementById('legend').textContent = 'County data could not load. Reload to try again.'; });
