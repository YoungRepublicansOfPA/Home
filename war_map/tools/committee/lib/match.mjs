// Matches precinct names as a results source prints them ("Castle Shannon District 1")
// to the map's precinct records ("Casl Shannon Dist 1", id "42003-Casl Shannon Dist 1").
// Passes run from strict to loose, and every pass accepts a match only when it is
// one-to-one among the names still unmatched. Anything else is reported, never guessed.

const SYN = {
  district: 'dist', dst: 'dist', dis: 'dist', township: 'tp', twp: 'tp', twsp: 'tp', borough: 'br', boro: 'br', bor: 'br', bo: 'br',
  wd: 'ward', precinct: 'pct', prec: 'pct', division: 'div', saint: 'st', mount: 'mt', upper: 'up', lower: 'lo', city: 'cty',
  east: 'e', west: 'w', north: 'n', south: 's', eastern: 'e', western: 'w', northern: 'n', southern: 's', and: '', of: '', the: '', no: '',
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10'
};
// Words that only say what kind of unit follows; the loose key drops them.
const TYPE = new Set(['tp', 'br', 'cty', 'ward', 'dist', 'pct', 'div', 'vd', 'ed']);

export function tokens(name) {
  let t = name.toLowerCase().replace(/&/g, ' and ').replace(/['\u2019]/g, '').replace(/(\d+)(st|nd|rd|th)\b/g, '$1').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  // Leading county codes: "005 Atglen", "1000 ADAMSTOWN", "010001 1 ALLEN TWSP" -> drop numbers before the first word.
  const firstWord = t.findIndex(x => /^[a-z]/.test(x));
  if (firstWord > 0) t = t.slice(firstWord);
  // A lone letter before a number marks the unit: "Ashley W 1", "Alsace P 1", "Amwell X 1".
  t = t.filter((x, i) => !(x.length === 1 && /[a-z]/.test(x) && /^\d+$/.test(t[i + 1] || '') && i > 0));
  // The map also uses a lone "X" before a precinct's own name: "Adams X Dunlo".
  t = t.filter((x, i) => !(x === 'x' && i > 0 && i < t.length - 1));
  return t.map(x => /^\d+$/.test(x) ? String(+x) : (SYN[x] ?? x)).filter(Boolean);
}
const strictKey = name => tokens(name).join(' ');
const looseTokens = name => tokens(name).filter(x => !TYPE.has(x));
const looseKey = name => looseTokens(name).join(' ');
// Loose key plus the kind of municipality, so "Benton Borough" and "Benton Township" stay apart.
// The map's names often omit the kind; its municipality field ("Benton borough") carries it.
const KIND = {tp: 'tp', br: 'br', cty: 'cty'};
const kindOf = t => t.find(x => KIND[x]) || '';
const typedKey = name => looseKey(name) + '|' + kindOf(tokens(name));
const mapTypedKey = p => looseKey(p.name) + '|' + (kindOf(tokens(p.name)) || kindOf(tokens((p.municipality || '').split(' ').pop() || '')));

// "casl" ~ "castle", "hl" ~ "hills", "e" ~ "east": same first letter and one is a subsequence of the other.
function abbrev(a, b) {
  if (a === b) return true;
  if (/^\d/.test(a) || /^\d/.test(b) || a[0] !== b[0]) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  for (const ch of l) if (ch === s[i]) i++;
  return i === s.length;
}
const similar = (x, y) => x.length === y.length && x.every((t, i) => abbrev(t, y[i]));

// names: committee precinct names. mapPrecincts: [{id, name, municipality}]. Returns {ids: Map(name -> id), unmatched: [name]}.
export function matchPrecincts(names, mapPrecincts) {
  const ids = new Map(), used = new Set();
  const left = () => [names.filter(n => !ids.has(n)), mapPrecincts.filter(p => !used.has(p.id))];
  const accept = (n, p) => { ids.set(n, p.id); used.add(p.id); };
  // Key passes: unique key on both sides.
  const passes = [[strictKey, p => strictKey(p.name)], [typedKey, mapTypedKey], [looseKey, p => looseKey(p.name)]];
  for (const [kf, mf] of passes) {
    const [ln, lm] = left();
    const count = (arr, f) => arr.reduce((m, x) => m.set(f(x), (m.get(f(x)) || 0) + 1), new Map());
    const nc = count(ln, kf), mc = count(lm, mf);
    const byKey = new Map(lm.map(p => [mf(p), p]));
    for (const n of ln) { const k = kf(n); if (nc.get(k) === 1 && mc.get(k) === 1) accept(n, byKey.get(k)); }
  }
  // Abbreviation pass on loose tokens, one-to-one only.
  const [ln, lm] = left();
  const lmT = lm.map(p => ({p, t: looseTokens(p.name)}));
  const cands = new Map(ln.map(n => { const t = looseTokens(n); return [n, lmT.filter(m => similar(t, m.t)).map(m => m.p)]; }));
  const claims = new Map();
  for (const ps of cands.values()) for (const p of ps) claims.set(p.id, (claims.get(p.id) || 0) + 1);
  for (const [n, ps] of cands) if (ps.length === 1 && claims.get(ps[0].id) === 1) accept(n, ps[0]);
  return {ids, unmatched: names.filter(n => !ids.has(n))};
}
