# India-wide hospital directory import

CareBridge can populate the `hospitals` table from the current **Geofabrik India OpenStreetMap extract**. This is a broad directory rather than a verified emergency-capacity registry. Every imported record is marked `UNVERIFIED`, `is_verified = 0`, and `data_source = 'openstreetmap'`; the importer never invents a phone number, website, emergency department, bed count, or clinician contact.

The source is the India extract published by [Geofabrik](https://download.geofabrik.de/asia/india.html), which is derived from [OpenStreetMap](https://www.openstreetmap.org/). The extract is available as a PBF file and is licensed under the [Open Database License](https://www.openstreetmap.org/copyright). OpenStreetMap’s [Overpass guidance](https://wiki.openstreetmap.org/wiki/Overpass_API) recommends regional extracts for large downloads rather than repeatedly querying public Overpass servers.

## Import workflow

The repository includes the following commands:

```bash
wget -O data/raw/india-latest.osm.pbf https://download.geofabrik.de/asia/india-latest.osm.pbf
pnpm hospitals:extract
pnpm hospitals:dry-run
DATABASE_URL='…' pnpm hospitals:import
```

`hospitals:extract` keeps only OSM `amenity=hospital` nodes, ways, and relations and exports them to GeoJSON. `hospitals:dry-run` reports the number of named, geocoded records and how many include a public phone number without touching a database. The import command upserts records using stable OSM-derived IDs, so rerunning it is safe and updates changed source data. It does not delete records that disappeared from a later extract; stale-record cleanup should be handled as a separately reviewed data-retention operation.

The database migration must be applied before the import. In a deployment with an existing database, run `pnpm db:push` through the normal deployment process, review the generated migration, and then run the importer with the deployment’s server-side `DATABASE_URL`. Do not paste database credentials into source control or chat.

## Trust and product behavior

Imported OSM records are suitable for map discovery and location context. They are **not** suitable as proof that a facility has an emergency department, open beds, current phone routing, or an available clinician. Only official-source records should be promoted to `TRUSTED_RESOURCE` and `is_verified = 1` after a human review. The phone field is nullable because many OSM records do not publish a contact number; the UI displays “Phone not listed” instead of fabricating one.

The current emergency recommendation engine still uses the small, manually verified in-memory resource set for safety-critical recommendations. The India-wide directory import therefore expands directory storage and discovery without silently replacing verified emergency guidance with unverified records.
