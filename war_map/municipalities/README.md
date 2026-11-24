# Pennsylvania municipal boundaries

County files contain WGS84 GeoJSON polygons from the [PennDOT municipal boundaries service](https://gis.penndot.pa.gov/gis/rest/services/opendata/municipalboundaries/MapServer/0), retrieved November 24, 2026. Each feature carries the source county-municipality code, municipal name and class. PennDOT first- and second-class townships are both displayed as townships.

The 67 files cover 2,566 county-municipality features with geometry. Municipalities crossing county lines appear in each applicable county. One additional source row for South New Castle borough in Lawrence County had null geometry and was omitted. Geometry was requested with an output spatial reference of 4326, a maximum allowable offset of 0.00006 degrees, and five decimal places of precision for web display. These boundaries represent the retrieved municipal layer. Election returns and election-year precinct boundaries have their own source and vintage.
