# Pennsylvania civic records

This independent project indexes all 67 Pennsylvania counties and links to official sources for county government, public spending, and elections. [Explore the site](https://youngrepublicansofpa.github.io/Home/).

## Local preview

Run `python3 -m http.server 8000` in this directory, then open `http://localhost:8000/`. The page requires no build; the local server lets it load the map and JSON files. GitHub Pages publishes the repository root from the `main` branch.

The county shapes come from [PA DCNR GIS](https://www.gis.dcnr.state.pa.us/agsprod/rest/services/base_mapping/counties/MapServer/0). Population figures are the [Census Vintage 2025 county estimates](https://www.census.gov/data/datasets/time-series/demo/popest/2020s-counties-total.html). Governing-body party control is displayed only where a current majority has been checked against the linked sources; other counties are marked unverified. `seed-records.json` holds direct county source links and their verification labels.

## Contributing records

For a correction or a new record, include the county or jurisdiction, a primary-source link, the document date, and the date you checked it. Include the fiscal year and units for financial figures. For legislation, include the chamber, session, bill number, and date of the latest action.

## Account boundary

Pushes to this repository must use the dedicated `YoungRepublicansOfPA/Home` deploy key and the repository-local `YoungRepublicansOfPA` commit identity. Never use a personal GitHub login, token, SSH key, or global Git identity for this repository. The local checkout's pre-push hook rejects any destination other than this repository over SSH. See `AGENTS.md` before making changes with an agent.

## Pennsylvania trends

The [trends page](trends.html) presents state history, demographic measures, vital statistics, and conservation records with direct citations. The research notes in `research/` preserve dates, definitions, and comparability cautions for review.

The site badge and banner under `assets/` were supplied for this project. The MIT license covers the code and structured data, not those images; image rights remain with their respective owners.
