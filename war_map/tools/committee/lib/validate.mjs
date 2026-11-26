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

// Loose key for comparing precinct names across sources:
// "Castle Shannon District 1" and "Castle Shannon Dist 1" compare equal.
export const nameKey = n => n.toLowerCase().replace(/\bdistrict\b/g, 'dist').replace(/\bborough\b/g, 'br')
  .replace(/\bupper\b/g, 'up').replace(/\bmount\b/g, 'mt').replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();

export function validate(doc, {mapPrecincts = null} = {}) {
  const errors = [], warnings = [];
  for (const k of Object.keys(doc)) if (!TOP_KEYS.has(k)) errors.push(`unexpected field "${k}"`);
  if (!METHODS.includes(doc.method)) errors.push(`bad method ${doc.method}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.checked_at || '')) errors.push('checked_at must be YYYY-MM-DD');
  if (!doc.sources?.length) errors.push('no sources');
  for (const s of doc.sources || []) {
    if (!/^https:\/\//.test(s.url)) errors.push(`source without https URL: ${s.title}`);
    for (const k of Object.keys(s)) if (!SOURCE_KEYS.has(k)) errors.push(`unexpected source field "${k}"`);
  }
  const seen = new Set();
  for (const p of doc.precincts) {
    // Privacy: precincts hold {name, seats}, seats hold {seat, status}. Nothing else, so no names can leak in.
    for (const k of Object.keys(p)) if (k !== 'name' && k !== 'seats') errors.push(`precinct ${p.name}: unexpected field "${k}"`);
    for (const s of p.seats) {
      for (const k of Object.keys(s)) if (k !== 'seat' && k !== 'status') errors.push(`precinct ${p.name}: unexpected seat field "${k}"`);
      if (!STATUSES.includes(s.status)) errors.push(`precinct ${p.name}: bad status ${s.status}`);
    }
    if (seen.has(p.name)) errors.push(`duplicate precinct ${p.name}`);
    seen.add(p.name);
    if (doc.seats_per_precinct && p.seats.length !== doc.seats_per_precinct) warnings.push(`precinct ${p.name} has ${p.seats.length} seats, expected ${doc.seats_per_precinct}`);
  }
  const t = countTotals(doc.precincts);
  for (const k of Object.keys(t)) if (doc.totals[k] !== t[k]) errors.push(`totals.${k} is ${doc.totals[k]}, precincts add up to ${t[k]}`);
  let unmatched = null;
  if (mapPrecincts) {
    if (mapPrecincts.length !== doc.precincts.length) warnings.push(`${doc.precincts.length} precincts here, ${mapPrecincts.length} on the map`);
    const keys = new Set(mapPrecincts.map(nameKey));
    unmatched = doc.precincts.filter(p => !keys.has(nameKey(p.name))).map(p => p.name);
    if (unmatched.length) warnings.push(`${unmatched.length} precinct names don't match the map's (e.g. ${unmatched.slice(0, 3).join('; ')})`);
  }
  return {errors, warnings, unmatched};
}
