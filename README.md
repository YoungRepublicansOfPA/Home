# Pennsylvania civic records

This independent project indexes all 67 Pennsylvania counties and links to official sources for county government, public spending, and elections. [Explore the site](https://youngrepublicansofpa.github.io/Home/).

## Local preview

Run `python3 -m http.server 8000` in this directory, then open `http://localhost:8000/`. The page requires no build; the local server lets it load the map and JSON files. GitHub Pages publishes the repository root from the `main` branch.

Page-level styles still live in each file, but `theme.css` is loaded last and carries the shared look: navy, gold and cream surfaces, serif headings in Tinos, and Source Sans 3 body text. Change the theme there unless a style is genuinely one page only.

The county shapes come from [PA DCNR GIS](https://www.gis.dcnr.state.pa.us/agsprod/rest/services/base_mapping/counties/MapServer/0). Population figures are the [Census Vintage 2025 county estimates](https://www.census.gov/data/datasets/time-series/demo/popest/2020s-counties-total.html). Governing-body party control is displayed only where a current majority has been checked against the linked sources; other counties are marked unverified. `seed-records.json` holds direct county source links and their verification labels.

## Contributing records

For a correction or a new record, include the county or jurisdiction, a primary-source link, the document date, and the date you checked it. Include the fiscal year and units for financial figures. For legislation, include the chamber, session, bill number, and date of the latest action.

## Account boundary

Pushes to this repository must use the dedicated `YoungRepublicansOfPA/Home` deploy key and the repository-local `YoungRepublicansOfPA` commit identity. Never use a personal GitHub login, token, SSH key, or global Git identity for this repository. The local checkout's pre-push hook rejects any destination other than this repository over SSH. See `AGENTS.md` before making changes with an agent.

## Pennsylvania trends

The [trends page](trends.html) presents state history, demographic measures, vital statistics, and conservation records with direct citations. The research notes in `research/` preserve dates, definitions, and comparability cautions for review.

The site badge and banner under `assets/` were supplied for this project. The MIT license covers the code and structured data, not those images; image rights remain with their respective owners.

## County data

- `county-work-affordability.json`: 2024 ACS five-year county income, rent burden, and 30-minute-plus commute estimates. It preserves denominators and available 90% component margins of error. Percentages derived from multiple survey estimates do not yet have computed margins of error.
- `pa-legislators.json`: current PA General Assembly House and Senate rosters mapped to counties. Districts can split counties; use the official address lookup to identify a resident’s specific members.
- `docket-expanded.json`: dated public meeting listings and tracked state bills. Meeting listings and bill actions are separate from verified scheduled votes.

The county map offers population, income, and verified county leadership layers. Population estimates and ACS income come from different years and should not be combined as a single-year measure.
