// Turns one committee contest's vote totals into seat statuses, following
// war_map/committee/README.md ("What counts as evidence", official results):
//   filled  - a named candidate won the seat
//   empty   - no candidate and no votes
//   unknown - won only by unnamed write-ins, or an unresolved tie
// Candidate names are used here only to tell named choices from write-ins;
// they are never returned.

export const isWriteIn = name => /^write[\s-]?ins?\b/i.test(name.trim());

// contest: {voteFor, choices: [{name, votes}]}  ->  array of statuses, one per seat
export function seatStatuses({voteFor, choices}) {
  const seats = Math.max(1, voteFor || 1);
  const named = choices.filter(c => !isWriteIn(c.name)).map(c => c.votes).sort((a, b) => b - a);
  const writeInVotes = choices.filter(c => isWriteIn(c.name)).reduce((s, c) => s + c.votes, 0);
  const out = [];
  for (let i = 0; i < seats; i++) {
    const v = named[i];
    if (v > 0) {
      // A tie for the last winning place can't be settled from totals.
      const tiedAtCutoff = named.filter(x => x === v).length > 1 && named.indexOf(v) + named.filter(x => x === v).length > seats;
      // If write-ins together beat this candidate, a write-in may hold the seat instead.
      out.push(tiedAtCutoff || writeInVotes >= v ? 'unknown' : 'filled');
    } else if (v === undefined && writeInVotes === 0) {
      // Nobody left on the ballot for this seat and no write-in votes.
      out.push('empty');
    } else {
      // Write-in votes only, or a named candidate with zero votes.
      out.push('unknown');
    }
  }
  return out;
}
