# Pennsylvania presidential returns, November 5, 2024

The county JSON files contain 9,144 mapped voting precincts in all 67 counties. Each record retains the original precinct GEOID and integer Harris, Trump and total counts. Other is the published total less Harris and Trump. It includes other candidates and write-ins where reported. The mapped totals are 3,418,658 Harris, 3,540,419 Trump, and 77,484 other votes. They sum to 7,036,561. County and municipality sums of mapped records describe map coverage.

The separately downloadable [Pennsylvania Department of State extract](state-reported-2024.csv) contains all 9,187 reporting rows for president from the state's [2024 general election precinct returns](https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/2024-general-election/er/erstat_2024_g_268768_20250129.txt). Its four candidate columns retain the state's integer vote counts. The state file has no write-in column. State reporting units and mapped precincts can differ. Their counts should not be subtracted to estimate unmapped precincts. Preserve identifiers as strings when importing into a spreadsheet. [State file layout](https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/2024-general-election/er/erstat_2024_g_readme.txt)

## Map source and use

**2024 Precinct-Level Election Results, The New York Times**, accessed November 24, 2026. The Pennsylvania House of Representatives provided precinct results and boundaries for most of Pennsylvania, with additional assistance from Isaac Kaufer. The publisher identifies every included Pennsylvania geometry as an official boundary. [Published map](https://www.nytimes.com/interactive/2025/us/elections/2024-election-map-precinct-results.html) · [Dataset and methods](https://github.com/nytimes/presidential-precinct-map-2024) · [Pennsylvania GeoJSON](https://int.nyt.com/newsgraphics/elections/map-data/2024/national/PA-precincts-with-results.geojson.gz) · [Full credits](NYT-CREDITS.md)

Recipients using or redistributing the county JSON must comply with the [NYT Computational Use of Data Agreement](NYT-LICENSE.txt), including its noncommercial terms and attribution obligations. Pass those terms and all accompanying credits to downstream recipients. The repository software license does not relicense the Times data.

## Processing

County files retain published precinct IDs. Latitude and longitude are projected to common SVG map coordinates (x = 760 × (longitude + 80), y = 1000 × (42 − latitude)). Geometry was simplified within each polygon using a 0.000035-degree tolerance and rounded to 0.01 display units. These paths are for display.

Each precinct is assigned to the county subdivision containing its representative interior point. In ambiguous cases the largest polygon overlap is used. Municipal sums count each precinct once. Geographic assignment supplies a navigation aid and can differ from official tabulation boundaries.

Names are taken from source identifiers where available. Philadelphia labels decode the supplied ward/division identifier. State-return names are used when county, voting district ID and both major-party vote counts match uniquely, or when the municipality name and both counts uniquely identify a state reporting row within that county. For 92 precincts the map shows the published identifier. The NYT count fields always supply the map values. The separate state CSV always uses the state extract.
