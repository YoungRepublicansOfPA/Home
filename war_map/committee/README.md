# Republican committee seats by precinct ("empty chairs")

Each Pennsylvania election district (precinct) elects Republican county committee members, usually one committeeman and one committeewoman. Some counties' party rules set a different number. This folder records, county by county, which of those seats are filled, which are empty, and which can't be determined from public records.

One file per county: `<county-slug>.json`, where the slug is the county name in lowercase with spaces replaced by hyphens, matching `../data/`.

## What counts as evidence

In order of preference:
1. **County committee roster** published by the county party or the county elections office. A listed seat with no member is `empty`.
2. **Official results of the most recent committee election**, usually the May 2026 general primary in counties that elect in gubernatorial years. A seat with a winning candidate is `filled`. A seat with no candidate and no votes is `empty`. A seat won only by unnamed write-ins, or with an unresolved tie, is `unknown`.
3. **Official candidate listing** for that election. A seat with no filed Republican candidate is `empty_no_filer`. Write-ins could still have won, so this is weaker evidence than results.

If none of these is public, set `method` to `none_found` and every seat to `unknown`. Never infer a count from party statements, news estimates or other counties.

Appointments made after an election aren't captured unless a newer roster shows them. Record the date of the evidence in `as_of`.

**Privacy:** store seat status only, never the names of committee members or candidates.

## File format

```json
{
  "county": "Adams",
  "checked_at": "2026-11-24",
  "method": "roster | election_results | candidate_listing | none_found",
  "election": "May 19, 2026 General Primary",
  "as_of": "2026-06-08",
  "seats_per_precinct": 2,
  "sources": [{"url": "https://…", "title": "…", "type": "roster | results | candidate_listing | rules", "as_of": "2026-06-08"}],
  "precincts": [
    {"name": "Abbottstown", "seats": [
      {"seat": "Committeeman", "status": "filled"},
      {"seat": "Committeewoman", "status": "empty"}
    ]}
  ],
  "totals": {"precincts": 51, "seats": 102, "filled": 80, "empty": 15, "empty_no_filer": 0, "unknown": 7},
  "notes": "Anything a reader needs to interpret the county's figures."
}
```

- `status`: `filled`, `empty`, `empty_no_filer` or `unknown`.
- `seat`: the label the source uses, such as "Committeeman", "Committeewoman" or "Member".
- `precincts[].name`: the precinct name as the source prints it. The map matches names to its own precinct records separately.
- `totals` must equal the counts in `precincts`.
