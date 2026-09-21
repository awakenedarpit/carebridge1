# Free Nearby Hospital Data

CareBridge uses the public OpenStreetMap Overpass API for location-specific nearby-hospital discovery. The web API sends a POST-encoded query for every incident location, including the Bengaluru demo location, and also exposes `/api/facilities/directory?latitude=…&longitude=…` for direct nearby-directory access. It searches a 15 km radius, parses named nodes/ways/relations, deduplicates by name, and sorts by haversine distance.

Official references:

- [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Overpass Commons guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [Hospital tag](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dhospital)
- [OpenStreetMap API usage policy](https://operations.osmfoundation.org/policies/api/)

The public data is free but community-maintained. A listing does not verify emergency department availability, open beds, current phone routing, clinician availability, or safety. CareBridge therefore keeps official sourced resources as the action recommendation and presents OpenStreetMap records as nearby map listings only. If Overpass is unavailable or returns no named hospitals, the app falls back to the trusted cached resources.

The live query was verified against Bengaluru test coordinates (`12.9716, 77.5946`) and returned eight nearby parsed hospitals in the local API smoke test after switching from rejected GET requests to canonical POST Overpass syntax.
