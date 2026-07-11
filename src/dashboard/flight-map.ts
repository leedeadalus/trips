/**
 * Reusable flight-route map component for the Trips dashboard.
 *
 * Server-rendered HTML fragment (a <div> map container) plus an inline
 * script that lazy-loads Leaflet from a CDN, plots an airport marker for
 * every unique origin/destination in the given `flights` list, draws a
 * route line between each flight's departure and arrival airport, and
 * auto-fits the map bounds to whatever was drawn.
 *
 * This follows the same "plain server-rendered fragment + vanilla inline
 * script" convention as `date-range-picker.ts` — no build step, no
 * framework, just a self-contained snippet any page can embed via
 * `renderFlightMap(...)`.
 *
 * Input shape: each flight carries its own resolved origin/destination
 * coordinates (see `airport-geo.ts` / `repository.ts#listFlightsForMap`
 * for how those get attached upstream) — this component does no airport
 * lookups itself, it only draws what it's given. Flights with a null/
 * missing `departure` or `arrival` coordinate are skipped defensively
 * (not every code has a known coordinate — see airport-geo.ts) rather
 * than throwing, so a handful of bad codes don't blank the whole map.
 */

export interface MapAirport {
  code: string;
  name?: string;
  lat: number;
  lon: number;
}

export interface MapFlight {
  id: number | string;
  flightNumber?: string;
  status?: string;
  /** Origin airport + coordinates. Flight is skipped if this is null/undefined. */
  departure: MapAirport | null | undefined;
  /** Destination airport + coordinates. Flight is skipped if this is null/undefined. */
  arrival: MapAirport | null | undefined;
}

export interface LatLngBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** A flight with both endpoints resolved to real coordinates (narrowed from MapFlight). */
export type PlottableFlight = MapFlight & { departure: MapAirport; arrival: MapAirport };

/** Filters out flights missing a resolved departure or arrival coordinate. */
export function plottableFlights(flights: MapFlight[]): PlottableFlight[] {
  return flights.filter(
    (f): f is PlottableFlight => f.departure != null && f.arrival != null
  );
}

/**
 * Computes the lat/lon bounding box across every airport referenced by the
 * given flights (both endpoints of every route). Returns null for an empty
 * or fully-unplottable flight list — callers should fall back to a default
 * world view in that case rather than fitting to nothing.
 *
 * Pure and DOM-free so it's unit-testable without a browser.
 */
export function computeBounds(flights: MapFlight[]): LatLngBounds | null {
  const points: MapAirport[] = [];
  for (const f of plottableFlights(flights)) {
    points.push(f.departure, f.arrival);
  }
  if (points.length === 0) return null;

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

export interface FlightMapOptions {
  /** Unique DOM id prefix so multiple maps can coexist on one page. */
  idPrefix: string;
  /** Flights to render. Empty array renders an empty map with a placeholder message. */
  flights: MapFlight[];
  /** CSS height for the map container (e.g. "480px"). Defaults to "480px". */
  height?: string;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#5b8def',
  completed: '#3bb56e',
  not_flown: '#e6a032',
  cancelled: '#e04a4a',
};

function routeColor(status: string | undefined): string {
  return STATUS_COLORS[status ?? ''] ?? '#5b8def';
}

/**
 * Renders the map container markup + wiring script for a given set of
 * flights. Intended to be embedded inside a page body (e.g. the Map View
 * screen, t_840d41c0), the same way `renderDateRangePicker()` is.
 *
 * Behavior:
 *  - 0 flights (or 0 plottable flights): map renders centered on a default
 *    world view with an on-map "No flights in this range" message; no
 *    markers/lines, no errors.
 *  - 1 flight: one route line + two airport markers, bounds fit to that pair
 *    (with padding so a single short hop isn't zoomed in absurdly tight).
 *  - many flights: one route line + marker set per flight, markers
 *    deduped by airport code so overlapping routes don't stack redundant
 *    markers, bounds fit to the union of every airport referenced.
 */
export function renderFlightMap(options: FlightMapOptions): string {
  const { idPrefix, flights, height = '480px' } = options;
  const containerId = `${idPrefix}-container`;
  const mapId = `${idPrefix}-map`;
  const emptyId = `${idPrefix}-empty`;

  const plottable = plottableFlights(flights);
  const skippedCount = flights.length - plottable.length;

  const flightsJson = JSON.stringify(
    plottable.map((f) => ({
      id: f.id,
      flightNumber: f.flightNumber ?? null,
      status: f.status ?? null,
      color: routeColor(f.status),
      departure: { code: f.departure.code, name: f.departure.name ?? f.departure.code, lat: f.departure.lat, lon: f.departure.lon },
      arrival: { code: f.arrival.code, name: f.arrival.name ?? f.arrival.code, lat: f.arrival.lat, lon: f.arrival.lon },
    }))
  );

  return `
  <div id="${containerId}" class="flight-map" data-component="flight-map" style="position:relative;">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <div id="${mapId}" style="height:${height}; width:100%; border-radius:10px; background:#171a21;"></div>
    <div id="${emptyId}" class="empty" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); display:none; pointer-events:none; z-index:1000; color:#9aa1ac; background:rgba(23,26,33,0.85); padding:0.5rem 1rem; border-radius:8px; font-size:0.9rem; white-space:nowrap;">
      No flights in this range.
    </div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
  (function () {
    var FLIGHTS = ${flightsJson};
    var SKIPPED = ${JSON.stringify(skippedCount)};
    // Exposed so updateFlights() can recompute route color for freshly
    // fetched flights (e.g. after a date-range change) the same way the
    // initial server-rendered payload did.
    var STATUS_COLORS_BY_JS = ${JSON.stringify(STATUS_COLORS)};
    function jsRouteColor(status) { return STATUS_COLORS_BY_JS[status] || '#5b8def'; }
    if (SKIPPED > 0 && window.console && console.warn) {
      console.warn('flight-map: skipped ' + SKIPPED + ' flight(s) with unresolved airport coordinates');
    }

    function init() {
      var mapEl = document.getElementById(${JSON.stringify(mapId)});
      var emptyEl = document.getElementById(${JSON.stringify(emptyId)});
      if (!mapEl || typeof L === 'undefined') return;

      var map = L.map(mapEl, { scrollWheelZoom: true }).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      var container = document.getElementById(${JSON.stringify(containerId)});
      container.getMap = function () { return map; };
      container.getFlights = function () { return FLIGHTS; };

      var drawnLayers = [];

      function draw(flights) {
        // Clear anything drawn by a previous call (markers + route lines),
        // leaving the base tile layer untouched.
        drawnLayers.forEach(function (layer) { map.removeLayer(layer); });
        drawnLayers = [];

        if (!flights || flights.length === 0) {
          emptyEl.style.display = 'block';
          return;
        }
        emptyEl.style.display = 'none';

        var markersByCode = {};
        var bounds = [];

        flights.forEach(function (f) {
          [f.departure, f.arrival].forEach(function (airport) {
            if (!markersByCode[airport.code]) {
              var marker = L.circleMarker([airport.lat, airport.lon], {
                radius: 5,
                color: '#e6e8ec',
                weight: 1,
                fillColor: '#5b8def',
                fillOpacity: 0.9,
              }).addTo(map);
              marker.bindTooltip(airport.code + ' — ' + airport.name);
              markersByCode[airport.code] = marker;
              drawnLayers.push(marker);
            }
            bounds.push([airport.lat, airport.lon]);
          });

          var line = L.polyline(
            [[f.departure.lat, f.departure.lon], [f.arrival.lat, f.arrival.lon]],
            { color: f.color, weight: 2, opacity: 0.75 }
          ).addTo(map).bindTooltip(
            (f.flightNumber ? f.flightNumber + ': ' : '') + f.departure.code + ' \\u2192 ' + f.arrival.code
          );
          drawnLayers.push(line);
        });

        if (bounds.length === 1) {
          map.setView(bounds[0], 6);
        } else if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
        }
      }

      // Re-render this map in place with a new flight set (e.g. after the
      // date range changes) without recreating the Leaflet instance or
      // re-fetching the Leaflet script.
      container.updateFlights = function (newFlights) {
        FLIGHTS = (newFlights || [])
          .filter(function (f) { return f.departure != null && f.arrival != null; })
          .map(function (f) {
            return {
              id: f.id,
              flightNumber: f.flightNumber || null,
              status: f.status || null,
              color: jsRouteColor(f.status),
              departure: f.departure,
              arrival: f.arrival,
            };
          });
        container.getFlights = function () { return FLIGHTS; };
        draw(FLIGHTS);
      };

      draw(FLIGHTS);
    }

    if (typeof L !== 'undefined') {
      init();
    } else {
      var existing = document.querySelector('script[src*="leaflet.js"]');
      if (existing) {
        existing.addEventListener('load', init);
      } else {
        window.addEventListener('load', init);
      }
    }
  })();
  </script>`;
}
