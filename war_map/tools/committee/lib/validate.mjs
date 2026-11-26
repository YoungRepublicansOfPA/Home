// Checks a county committee file before it is written. Errors stop the run;
// warnings are printed in the report.
export const STATUSES = ['filled', 'empty', 'empty_no_filer', 'unknown'];
const TOP_KEYS = new Set(['county', 'checked_at', 'method', 'election', 'as_of', 'seats_per_precinct', 'sources', 'precincts', 'totals', 'notes']);
const SOURCE_KEYS = new Set(['url', 'title', 'type', 'as_of', 'sha256']);
const METHODS = ['roster', 'election_results', 'candidate_listing', 'none_found'];

export function countTotals(precincts) {
  const t = {precincts: precincts.length, seats: 0, filled: 0, empty: 0, empty_no_filer: 0, unknown: 0};
  for (const p of precincts) for (const s of p.seats) { t.seats++; t[s.status]++; }
  return t;
}

// mapPrecincts: [{id, name}] from ../data/<county>.json, or null.
export function validate(doc, {mapPrecincts = null} = {}) {
  const errors = [], warnings = [];
  for (const k of Object.keys(doc)) if (!TOP_KEYS.has(k)) errors.push(`unexpected field "${k}"`);
  if (!METHODS.includes(doc.method)) errors.push(`bad method ${doc.method}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.checked_at || '')) errors.push('checked_at must be YYYY-MM-DD');
  if (!doc.sources?.length) errors.push('no sources');
  for (const s of doc.sources || []) {
    if (!/^https?:\/\//.test(s.url)) errors.push(`source without a web URL: ${s.title}`);
    for (const k of Object.keys(s)) if (!SOURCE_KEYS.has(k)) errors.push(`unexpected source field "${k}"`);
  }
  const seen = new Set();
  for (const p of doc.precincts) {
    // Privacy: precincts hold {name, map_id?, seats}; seats hold {seat, status, holder?}.
    // Nothing else is allowed, and a name only on a filled seat (README, "Names").
    for (const k of Object.keys(p)) if (!['name', 'map_id', 'seats'].includes(k)) errors.push(`precinct ${p.name}: unexpected field "${k}"`);
    if (p.map_id != null && typeof p.map_id !== 'string') errors.push(`precinct ${p.name}: map_id must be a string`);
    for (const s of p.seats) {
      for (const k of Object.keys(s)) if (!['seat', 'status', 'holder'].includes(k)) errors.push(`precinct ${p.name}: unexpected seat field "${k}"`);
      if (!STATUSES.includes(s.status)) errors.push(`precinct ${p.name}: bad status ${s.status}`);
      if (s.holder != null && (s.status !== 'filled' || typeof s.holder !== 'string' || !s.holder.trim() || /write[\s-]?in/i.test(s.holder)))
        errors.push(`precinct ${p.name}: holder is allowed only as a named winner on a filled seat`);
    }
    if (seen.has(p.name)) errors.push(`duplicate precinct ${p.name}`);
    seen.add(p.name);
    if (doc.seats_per_precinct && p.seats.length !== doc.seats_per_precinct) warnings.push(`precinct ${p.name} has ${p.seats.length} seats, expected ${doc.seats_per_precinct}`);
  }
  // A county with no public record may list no precincts; its totals then give the precinct count, every seat unknown.
  const noRecord = doc.method === 'none_found' && !doc.precincts.length;
  const t = countTotals(doc.precincts);
  if (noRecord) { if (doc.totals.seats !== doc.totals.unknown) errors.push('none_found totals must count every seat as unknown'); }
  else for (const k of Object.keys(t)) if (doc.totals[k] !== t[k]) errors.push(`totals.${k} is ${doc.totals[k]}, precincts add up to ${t[k]}`);
  if (mapPrecincts) {
    if (!noRecord && mapPrecincts.length !== doc.precincts.length) warnings.push(`${doc.precincts.length} precincts here, ${mapPrecincts.length} on the map`);
    const ids = new Set(mapPrecincts.map(p => p.id)), seenIds = new Set();
    for (const p of doc.precincts) if (p.map_id) {
      if (!ids.has(p.map_id)) errors.push(`precinct ${p.name}: map_id ${p.map_id} is not on the map`);
      if (seenIds.has(p.map_id)) errors.push(`map_id ${p.map_id} is used twice`);
      seenIds.add(p.map_id);
    }
    const unmatched = doc.precincts.filter(p => !p.map_id).map(p => p.name);
    if (unmatched.length) warnings.push(`${unmatched.length} precincts have no map match (e.g. ${unmatched.slice(0, 3).join('; ')})`);
  }
  return {errors, warnings};
}
