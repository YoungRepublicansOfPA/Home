// Turns one committee contest's vote totals into seats, following
// war_map/committee/README.md ("What counts as evidence", official results):
//   filled  - a named candidate won the seat (their name is kept as holder)
//   empty   - no candidate and no votes
//   unknown - won only by unnamed write-ins, or an unresolved tie
// Only winners' names are returned; losing candidates' names never leave this function.

export const isWriteIn = name => /^write[\s-]?ins?\b/i.test(name.trim());

// contest: {voteFor, choices: [{name, votes}]}  ->  [{status, holder?}], one per seat
export function seats({voteFor, choices}) {
  const n = Math.max(1, voteFor || 1);
  const named = choices.filter(c => !isWriteIn(c.name)).sort((a, b) => b.votes - a.votes);
  const writeInVotes = choices.filter(c => isWriteIn(c.name)).reduce((s, c) => s + c.votes, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = named[i];
    if (c && c.votes > 0) {
      const tied = named.filter(x => x.votes === c.votes);
      // A tie for the last winning place can't be settled from totals.
      const tiedAtCutoff = tied.length > 1 && named.indexOf(tied[0]) + tied.length > n;
      // If write-ins together match or beat this candidate, a write-in may hold the seat instead.
      out.push(tiedAtCutoff || writeInVotes >= c.votes ? {status: 'unknown'} : {status: 'filled', holder: c.name.trim()});
    } else if (!c && writeInVotes === 0) {
      // Nobody left on the ballot for this seat and no write-in votes.
      out.push({status: 'empty'});
    } else {
      // Write-in votes only, or a named candidate with zero votes.
      out.push({status: 'unknown'});
    }
  }
  return out;
}
export const seatStatuses = contest => seats(contest).map(s => s.status);
