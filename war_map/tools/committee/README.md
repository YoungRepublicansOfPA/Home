# Committee seat pipeline

Rebuilds `war_map/committee/<county>.json` from a county's official results, so the
Empty chairs layer can be refreshed after every election without hand edits.
The evidence rules and file format are in [`../../committee/README.md`](../../committee/README.md).

```
counties.json        where each of the 67 counties publishes results (platform, election ID, cycle)
run.mjs              import one county's export -> check -> write county file -> rebuild summary.json
add-holders.mjs      add holder names to a county file's filled seats from an export, keeping its statuses
link-map.mjs         link every county file's precincts to the map's precinct ids (map_id), then rebuild summary
lib/clarity.mjs      reader for Clarity/Scytl sites (results.enr.clarityelections.com)
lib/electionware.mjs reader for Electionware "Election Summary" PDFs (checks each contest against its own total)
lib/textreport.mjs   configurable reader for other text-layout results PDFs (Bucks, Montgomery, Lancaster, Chester)
lib/winners.mjs      reader for an official winners-list spreadsheet (Philadelphia); reads only race and name
lib/roster.mjs       reader for a committee roster table PDF (Lawrence); reads only precinct and member name
lib/htmllines.mjs    reader for a saved official results web page (Monroe)
import-westmoreland.mjs  reconcile official summary PDF with the separate winner certification
lib/rules.mjs        vote totals -> filled / empty / unknown, with the winner's name on filled seats
lib/match.mjs        precinct-name matching against the map (strict -> loose -> abbreviations, one-to-one only)
lib/validate.mjs     totals, allowed fields (holder only on filled seats), map ids against the map
.cache/              raw exports, git-ignored because they list losing candidates' names
```

## Running a county

1. Open the county's results page (`clarity.site` and `clarity.election_id` in `counties.json`),
   choose **Downloads -> Summary CSV**, and save `summary.zip`. Clarity refuses scripted and headless
   requests (HTTP 403), so this download is done by a person.
2. Put the version number from the download link (`.../<election_id>/<version>/reports/summary.zip`)
   in `clarity.version`.
3. From the repository root:

   ```bash
   node war_map/tools/committee/run.mjs allegheny --file ~/Downloads/summary.zip --dry-run
   ```

   The report shows the totals before and after and any warnings. Drop `--dry-run` to write the county
   file and rebuild `committee/summary.json`. The county file records the export's URL and SHA-256.

`--as-of YYYY-MM-DD` overrides the evidence date. By default it's the date the export was generated.

Filled seats get `holder`: the winner's name exactly as the results print it. Nothing else about a person is
stored (see `../../committee/README.md`, "Names"). Each precinct gets `map_id` when it matches a map precinct
unambiguously; unmatched precincts are listed in the report and aren't drawn on the map.

After changing `lib/match.mjs`, refresh every county's links without re-importing:

```bash
node war_map/tools/committee/link-map.mjs
```

## Platforms

| Platform | Counties | Reader |
|---|---|---|
| `clarity` | Allegheny (run.mjs); York, Crawford, Delaware (add-holders.mjs) | `lib/clarity.mjs` |
| `electionware` | Cambria | `lib/electionware.mjs` |
| `textreport` | 31 counties, from Bucks to Juniata (add-holders.mjs); see counties.json | `lib/textreport.mjs` |
| `winners` | Philadelphia (add-holders.mjs) | `lib/winners.mjs` |
| `roster` | Lawrence (add-holders.mjs) | `lib/roster.mjs` |
| `htmllines` | Monroe (add-holders.mjs) | `lib/htmllines.mjs` |
| `livevoterturnout` | Franklin, Lehigh | not yet |
| `manual` | the rest: Dauphin (web app), Pike, Clarion, Venango, Potter (refuse scripted requests), Mifflin (timed out), Columbia (two contests side by side per page), Franklin and Greene (web pages), Bradford, Snyder, Wyoming, Susquehanna (other layouts) | not yet |

Westmoreland uses two official PDFs: the [summary report](https://www.westmorelandcountypa.gov/DocumentCenter/View/35896/Official-Results) and [Republican winner certification](https://www.westmorelandcountypa.gov/DocumentCenter/View/35893/Certification-of-The-Republican-Ballot-Results-2026-General-Primary). Save both under `.cache/westmoreland/` and run `node war_map/tools/committee/import-westmoreland.mjs --summary <summary.pdf> --cert <certification.pdf>`. The importer checks every contest's vote sum, reconciles all 306 contests with the certification, and stores only winning ballot candidate names. Certified write-in winners count as filled but their names are omitted.

Some county sites refuse scripted downloads (Lycoming, Pike, Cambria). Download those files in a browser and pass
the saved path with `--file`.

Electionware reports are PDFs that start "Summary Results" and end each page "Report generated with
Electionware". Set `electionware.url` (the PDF), `electionware.page` (where the county posts it) and, if the
county titles its contests differently, `electionware.contest_pattern` (named groups `seat` and `precinct`,
matched against the title line). Needs `pdftotext` (poppler).

`textreport` settings: `contest_pattern` (named groups `seat`, `precinct`, optional `n`), `any_contest` (any title,
ends the current contest), `end` (a line that ends a contest), `precinct_aliases` (misspelled source titles). The
total column is found by arithmetic, an unreadable numeric line stops the run, and long names that wrap around
their vote line are rebuilt and listed in the output for review.

Clarity contest names differ by county. `clarity.contest_pattern` is a regular expression with named groups
`seat` and `precinct`, matched against the contest name without "(Vote For N)". `clarity.party` ("REP") drops
other parties' rows and treats blank-party choices as write-ins, which is how York and Crawford list named
write-in recipients.

### Names only (`add-holders.mjs`)

When a county file's statuses follow rules documented in its notes, or the Summary CSV leaves out rows a full
re-import would need, add names without touching statuses:

```bash
node war_map/tools/committee/add-holders.mjs york --file war_map/tools/committee/.cache/york/126283-375422-summary.zip --dry-run
```

Each seat already counted as filled gets the next winning ballot candidate by votes. Contests a report prints twice
(summary and precinct sections) are merged when identical and skipped when they differ. Precinct names that differ
from the county file are matched one-to-one with lib/match.mjs. Named write-ins are never
used. A precinct whose filled seats don't line up with the export (no contest, too few ballot candidates, a tie
at the cutoff) is skipped and listed, never guessed.

`clarity.verified: false` means the election ID was copied from an older source and still needs to be
checked against the 2026 primary.

## Cadence

Republican county committee seats are elected in the May primary, in most counties every four years in
the gubernatorial-election year (2026, then 2030). Some county party rules use another cycle; record it in
`cycle_years` once it's confirmed from the rules. Vacancies are filled by appointment at any time.

| When | Run |
|---|---|
| After the primary, and again once the county certifies (about three weeks later) | every county with results |
| Monthly | counties that publish a roster, to pick up appointments |
| Each January | confirm the next primary date with the Department of State; update `cycle_years` |

`build-committee-summary.mjs` computes each county's next committee election from `cycle_years` (4 when unset,
shown on the map as unconfirmed) and current law: the third Tuesday of May in even years (fourth Tuesday of
April in presidential years), with petitions circulating from the 13th through the 10th Tuesday before. It
stops with an error if that rule no longer reproduces the published 2026 calendar.
