# Committee seat pipeline

Rebuilds `war_map/committee/<county>.json` from a county's official results, so the
Empty chairs layer can be refreshed after every election without hand edits.
The evidence rules and file format are in [`../../committee/README.md`](../../committee/README.md).

```
counties.json        where each of the 67 counties publishes results (platform, election ID, cycle)
run.mjs              import one county's export -> check -> write county file -> rebuild summary.json
link-map.mjs         link every county file's precincts to the map's precinct ids (map_id), then rebuild summary
lib/clarity.mjs      reader for Clarity/Scytl sites (results.enr.clarityelections.com)
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
| `clarity` | Allegheny, Cambria, Crawford, Delaware, Luzerne, York | `lib/clarity.mjs` |
| `livevoterturnout` | Franklin, Lehigh | not yet |
| `manual` | the other 59 (county PDFs, rosters, or nothing public) | not yet |

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
