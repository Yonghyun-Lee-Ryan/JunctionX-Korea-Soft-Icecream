# Location Recipe

Represent coordinates explicitly as latitude and longitude. Validate latitude in `[-90, 90]` and
longitude in `[-180, 180]`; do not silently swap them. The shared Haversine utility is appropriate for
distance between two points and returns an explicit unit such as kilometres or metres.

```ts
interface Coordinates {
  latitude: number;
  longitude: number;
}
```

For a small hackathon dataset, store validated coordinates and perform limited candidate filtering plus
Haversine distance where correctness and query volume allow. Add suitable scalar indexes for other
filters. Do not fetch an unbounded table into Node.js for every radius query.

Use PostGIS when radius/nearest-neighbour queries are central, datasets are large, spatial indexes are
needed, or polygons/routes must be queried. Introduce it with a migration and test coordinate order,
SRID, units, and boundary cases.

Location can be sensitive personal data. Collect only required precision, define retention, restrict
access, and avoid logging raw coordinates. Tests should cover identical points, known city distances,
invalid ranges, and numerical tolerance rather than exact floating-point equality.
