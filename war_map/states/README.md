# State War Maps: 2024 presidential results by precinct or town

One folder per state (`md`, `de`, `nj`, `ny`, `ct`, `ri`, `ma`, `nh`, `vt`, `me`), used by `../state/?st=<st>`.

- `index.json`: state totals, and each county's name, bounding box, unit count and vote totals.
- `<county-slug>.json`: GeoJSON of that county's precincts (towns in CT, ME, NH, RI and VT), with `rep` (Trump), `dem` (Harris) and `total` votes as published, and `official` = whether the publisher marks the boundary as official.

Connecticut's counties are the nine planning regions that the Census Bureau has used since 2022.

## Source and terms

**2024 Precinct-Level Election Results, The New York Times**, downloaded November 27, 2026 from `https://int.nyt.com/newsgraphics/elections/map-data/2024/national/<ST>-precincts-with-results.geojson.gz`. Town results for Connecticut, Maine, New Hampshire, Rhode Island and Vermont are by The Associated Press. [Published map](https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html) · [Dataset and methods](https://github.com/nytimes/presidential-precinct-map-2024) · [Full credits](../data/NYT-CREDITS.md).

Use and redistribution are subject to the [NYT Computational Use of Data Agreement](../data/NYT-LICENSE.txt), including its noncommercial terms and attribution. The repository software license does not relicense this data.

## Processing

`../tools/build-states.py` simplifies each polygon (Douglas-Peucker, 0.00008-degree tolerance) and rounds coordinates to five decimals. The paths are for display only. Vote counts are unchanged.

## Committee seats

No committee-seat data has been collected for these states yet. Until a state's seats are counted from official rosters or results, its map shows every unit as not known, and the national [Anatomy of an Opportunity](../anatomy/) page shows no percentages for it.
