(() => {
  const input = el('place-input'), filter = el('place-type');
  const list = el('place-results'), status = el('place-status');
  let index, version = 0;
  function normalize(s) {
    return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\btwp\b/g,'township').replace(/\bboro\b/g,'borough')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }
  async function records() {
    const source = await localJSON('place-index.json');
    const rows = [];
    for (const [county,{places,precincts}] of Object.entries(source)) {
      function add(type,name,municipality,id) {
        const context = [municipality,county+' County'].filter(Boolean).join(' · ');
        rows.push({type,name,county,id,context,key:normalize(name),text:normalize(name+' '+context)});
      }
      places.forEach(name=>add('Municipality',name,'',null));
      precincts.forEach(([name,municipality,id])=>add('Precinct',name,municipality,id));
    }
    return rows;
  }
  async function select(row) {
    const token = ++version;
    list.replaceChildren();
    status.textContent = 'Opening '+row.name+'…';
    try {
      const entries = await window.selectMapCounty(row.county);
      if (token !== version) return;
      if (!entries) throw Error();
      if (row.type === 'Precinct') {
        const target = entries.find(e=>e.record.id===row.id);
        if (!target) throw Error();
        target.path.onclick();
      } else {
        const picker = el('municipality');
        const option = [...picker.options].find(o=>o.text===row.name);
        if (!option) throw Error();
        picker.value = option.value;
        picker.onchange();
      }
      status.textContent = row.name+' · '+row.county+' County';
      const heading = el('local-title');
      heading.tabIndex = -1;
      heading.focus();
      heading.scrollIntoView({block:'start'});
    } catch {
      status.textContent = 'Could not open this place. Search again or use the county selector.';
    }
  }
  async function search() {
    const token = ++version, q = normalize(input.value);
    list.replaceChildren(); status.textContent = '';
    if (q.length < 2) return;
    status.textContent = 'Searching Pennsylvania…';
    try {
      index ||= records().catch(error=>{index=null; throw error;});
      const rows = await index;
      if (token !== version) return;
      const words = q.split(' ');
      const rank = r => r.key===q ? 0 : r.key.startsWith(q) ? 1 : r.key.includes(q) ? 2 : 3;
      const matches = rows.filter(r=>(!filter.value || r.type===filter.value) && words.every(w=>r.text.includes(w)))
        .sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name)||a.county.localeCompare(b.county));
      status.textContent = matches.length > 30 ? 'Showing 30 of '+matches.length+' matches. Add a place or county name to narrow the list.' :
        matches.length ? matches.length+' matches' : 'No matches. Try a shorter name or change the place type.';
      for (const row of matches.slice(0,30)) {
        const item = document.createElement('li'), button = document.createElement('button'), detail = document.createElement('small');
        button.type='button';button.textContent=row.name;detail.textContent=row.type+' · '+row.context;
        button.append(detail);button.onclick=()=>select(row);item.append(button);list.append(item);
      }
    } catch {
      if (version===token) status.textContent='Search could not load. Edit the search to retry.';
    }
  }
  input.oninput = filter.onchange = search;
  input.onkeydown = event => {
    if (event.key==='ArrowDown' && list.firstChild) {event.preventDefault();list.querySelector('button').focus();}
  };
})();
