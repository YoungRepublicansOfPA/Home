(async function renderCountyExplorer() {
  const section = document.getElementById('county-spending');
  if (!section) return;
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  section.append(element('h2', 'County spending explorer'));
  const heading = element('label', 'Choose a Pennsylvania county ');
  const select = element('select');
  heading.append(select);
  const grid = element('div');
  grid.className = 'county-spending-grid';
  const map = element('div');
  const panel = element('div');
  panel.setAttribute('aria-live', 'polite');
  grid.append(map, panel);
  section.append(heading, grid);
  const download = element('a', 'Download county energy assistance figures (JSON)');
  download.href = 'welfare-files/county-energy.json';
  download.download = 'county-energy.json';
  section.append(download);
  const style = element('style', `
    .county-spending-grid {display:grid;grid-template-columns:minmax(0,3fr) minmax(12rem,2fr);gap:1rem;margin:1rem 0}
    .county-spending-grid svg {width:100%;height:auto}
    .county-spending-grid path {fill:#cfdee7;stroke:white;stroke-width:1.4;cursor:pointer}
    .county-spending-grid path[aria-pressed=true] {fill:#206589}
    .county-spending-grid path:hover,.county-spending-grid path:focus {fill:#b98242}
    .county-spending-grid h3 {margin:0}
    @media(max-width:620px){.county-spending-grid{grid-template-columns:1fr}}
  `);
  section.append(style);
  try {
    const json = await fetch('welfare-files/county-energy.json');
    if (!json.ok) throw Error('Missing county figures');
    const report = await json.json();
    const awards = await (await fetch('welfare-files/housing.json')).json();
    const data = Object.fromEntries(report.counties.map(row => [row.county, row]));
    const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0});
    function showRecord(row, output, create) {
      output.append(create('p', 'LIHEAP cash and crisis assistance · ' + report.period));
      output.append(create('strong', dollars.format(row.total_usd) + ' combined'));
      output.append(create('p', 'Cash assistance ' + dollars.format(row.cash_usd) + ' · Crisis assistance ' + dollars.format(row.crisis_usd)));
      const source = create('a', 'Read the original county table');
      source.href = report.source_url;
      output.append(source);
    }
    const names = Object.keys(data).sort();
    if (!names.length) throw Error('No county records');
    const shapes = new Map();
    function show(name) {
      select.value = name;
      for (const [key, path] of shapes) path.setAttribute('aria-pressed', String(key === name));
      panel.replaceChildren(element('h3', name + ' County'));
      const relevant = awards.filter(row => row.counties.split(' ').includes(name));
      const local = relevant.filter(row => row.counties === name);
      panel.append(element('p', '2025/2026 PHARE housing awards listed only for this county: ' + dollars.format(local.reduce((sum, row) => sum + row.amount, 0))));
      const details = element('details');
      details.append(element('summary', 'View ' + relevant.length + ' housing projects and recipients'));
      for (const row of relevant) {
        details.append(element('p', row.recipient + ' · ' + dollars.format(row.amount) + ' · ' + row.project + ' · Service area: ' + row.counties));
      }
      panel.append(details);
      showRecord(data[name], panel, element);
    }
    for (const name of names) {
      const option = element('option', name);
      select.append(option);
    }
    select.addEventListener('change', () => show(select.value));
    show(names[0]);
    const response = await fetch('county-map.svg');
    if (!response.ok) throw Error('County boundaries unavailable');
    const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
    svg.setAttribute('role','group');
    svg.setAttribute('aria-label','Select a Pennsylvania county to view spending');
    for (const path of svg.querySelectorAll('path[data-county]')) {
      const name = path.dataset.county;
      if (!data[name]) continue;
      shapes.set(name, path);
      path.setAttribute('role','button');
      path.setAttribute('tabindex','0');
      path.setAttribute('aria-label', name + ' County');
      path.setAttribute('aria-pressed',String(name === select.value));
      for (const event of ['pointerenter','focus','click']) path.addEventListener(event, () => show(name));
      path.addEventListener('keydown', event => {
        if (['Enter',' '].includes(event.key)) {event.preventDefault(); show(name);}
      });
    }
    map.replaceChildren(svg);
  } catch {
    map.textContent = 'The interactive map could not load. County records are available in the download below.';
  }
})();
