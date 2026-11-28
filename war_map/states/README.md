# State War Maps: 2024 presidential results by precinct or town

One folder for each state except Pennsylvania, which uses the original [`../` map](../). These folders are served at `../state/?st=<st>`. The 49 folders include Alaska's coverage note. The other 48 folders contain county and precinct or town files. Together with Pennsylvania, the map offers 2024 election results in 49 states.

- `index.json`: state totals, and each county's name, bounding box, unit count and vote totals.
- `<county-slug>.json`: GeoJSON of that county's precincts (towns in CT, ME, NH, RI and VT), with `rep` (Trump), `dem` (Harris) and `total` votes as published, and `official` = whether the publisher marks the boundary as official.

Connecticut's counties are the nine planning regions that the Census Bureau has used since 2022. `index.json` includes the source URL, checked date and any missing county areas. The displayed state vote total sums the mapped units; it is not a certified statewide total.

Alaska has no precinct results in this source: absentee, early and provisional votes are reported district-wide. Hawaii lacks mapped results for Kalawao County; Mississippi lacks Issaquena County; Oklahoma lacks Oklahoma and Tulsa counties; South Dakota lacks ten counties. Those areas remain visibly unverified in the map. County shading is shown while larger states load precincts on zoom.

## Source and terms

**2024 Precinct-Level Election Results, The New York Times**, downloaded November 27, 2026 from `https://int.nyt.com/newsgraphics/elections/map-data/2024/national/<ST>-precincts-with-results.geojson.gz`. Town results for Connecticut, Maine, New Hampshire, Rhode Island and Vermont are by The Associated Press. [Published map](https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html) · [Dataset, methods and state caveats](https://github.com/nytimes/presidential-precinct-map-2024) · [Full credits](../data/NYT-CREDITS.md).

Use and redistribution are subject to the [NYT Computational Use of Data Agreement](../data/NYT-LICENSE.txt), including its noncommercial terms and attribution. The repository software license does not relicense this data.

## Processing

`../tools/build-states.py` simplifies each polygon (Douglas-Peucker, 0.00008-degree tolerance) and rounds coordinates to five decimals. The paths are for display only. Vote counts are unchanged.

## Committee seats

`committee.json` in the original ten Northeast/Mid-Atlantic state folders describes how the state's Republican committees are structured, with an official source and checked date. Delaware's structure could not be verified from published rules and is marked so. New Jersey and New York have county seat files and counted totals; other states have no seat-by-seat data yet. Until seats are counted from official rosters or results, a state's map shows them as not known and the national [Anatomy of an Opportunity](../anatomy/) page shows no seat percentages for it.
