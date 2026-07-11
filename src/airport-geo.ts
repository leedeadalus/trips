/**
 * Static IATA airport code -> coordinate lookup.
 *
 * The `flights` table only stores 3-letter IATA codes (no coordinate
 * columns -- see docs/SCHEMA.md), so map rendering needs a lookup from code
 * to lat/lng. This is a small embedded dataset rather than a DB table or
 * external API call: airport coordinates are effectively static reference
 * data, so there is no need for a live lookup, a new migration, or a
 * network dependency just to draw dots on a map. Extend this table as new
 * airports show up in flight data (`SELECT DISTINCT departure_airport
 * FROM trips.flights UNION SELECT DISTINCT arrival_airport FROM
 * trips.flights` will show any codes missing from here).
 */

export interface AirportLocation {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

const AIRPORT_LOCATIONS: Record<string, AirportLocation> = {
  JFK: { code: 'JFK', name: 'John F. Kennedy Intl (New York)', lat: 40.6413, lon: -73.7781 },
  LGA: { code: 'LGA', name: 'LaGuardia (New York)', lat: 40.7769, lon: -73.874 },
  EWR: { code: 'EWR', name: 'Newark Liberty Intl', lat: 40.6895, lon: -74.1745 },
  LAX: { code: 'LAX', name: 'Los Angeles Intl', lat: 33.9416, lon: -118.4085 },
  SFO: { code: 'SFO', name: 'San Francisco Intl', lat: 37.6213, lon: -122.379 },
  SEA: { code: 'SEA', name: 'Seattle-Tacoma Intl', lat: 47.4502, lon: -122.3088 },
  ORD: { code: 'ORD', name: "O'Hare Intl (Chicago)", lat: 41.9742, lon: -87.9073 },
  DEN: { code: 'DEN', name: 'Denver Intl', lat: 39.8561, lon: -104.6737 },
  ATL: { code: 'ATL', name: 'Hartsfield-Jackson Atlanta Intl', lat: 33.6407, lon: -84.4277 },
  DFW: { code: 'DFW', name: 'Dallas/Fort Worth Intl', lat: 32.8998, lon: -97.0403 },
  MIA: { code: 'MIA', name: 'Miami Intl', lat: 25.7959, lon: -80.287 },
  BOS: { code: 'BOS', name: 'Logan Intl (Boston)', lat: 42.3656, lon: -71.0096 },
  IAD: { code: 'IAD', name: 'Washington Dulles Intl', lat: 38.9531, lon: -77.4565 },
  YUL: { code: 'YUL', name: 'Montreal-Trudeau Intl', lat: 45.4706, lon: -73.7408 },
  YYZ: { code: 'YYZ', name: 'Toronto Pearson Intl', lat: 43.6777, lon: -79.6248 },
  LHR: { code: 'LHR', name: 'Heathrow (London)', lat: 51.4700, lon: -0.4543 },
  LGW: { code: 'LGW', name: 'Gatwick (London)', lat: 51.1481, lon: -0.1903 },
  CDG: { code: 'CDG', name: 'Charles de Gaulle (Paris)', lat: 49.0097, lon: 2.5479 },
  AMS: { code: 'AMS', name: 'Amsterdam Schiphol', lat: 52.3105, lon: 4.7683 },
  FRA: { code: 'FRA', name: 'Frankfurt am Main', lat: 50.0379, lon: 8.5622 },
  MUC: { code: 'MUC', name: 'Munich Intl', lat: 48.3538, lon: 11.7861 },
  VIE: { code: 'VIE', name: 'Vienna Intl', lat: 48.1103, lon: 16.5697 },
  BUD: { code: 'BUD', name: 'Budapest Ferenc Liszt Intl', lat: 47.4298, lon: 19.2611 },
  PRG: { code: 'PRG', name: 'Vaclav Havel Airport Prague', lat: 50.1008, lon: 14.26 },
  FCO: { code: 'FCO', name: 'Leonardo da Vinci-Fiumicino (Rome)', lat: 41.8003, lon: 12.2389 },
  MAD: { code: 'MAD', name: 'Adolfo Suarez Madrid-Barajas', lat: 40.4936, lon: -3.5668 },
  BCN: { code: 'BCN', name: 'Barcelona-El Prat', lat: 41.2974, lon: 2.0833 },
  ZRH: { code: 'ZRH', name: 'Zurich Airport', lat: 47.4647, lon: 8.5492 },
  DUB: { code: 'DUB', name: 'Dublin Airport', lat: 53.4213, lon: -6.2701 },
  AUH: { code: 'AUH', name: 'Abu Dhabi Intl', lat: 24.433, lon: 54.6511 },
  DXB: { code: 'DXB', name: 'Dubai Intl', lat: 25.2532, lon: 55.3657 },
  DOH: { code: 'DOH', name: 'Hamad Intl (Doha)', lat: 25.2609, lon: 51.6138 },
  BLR: { code: 'BLR', name: 'Kempegowda Intl (Bengaluru)', lat: 13.1986, lon: 77.7066 },
  DEL: { code: 'DEL', name: 'Indira Gandhi Intl (Delhi)', lat: 28.5562, lon: 77.1 },
  BOM: { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl (Mumbai)', lat: 19.0896, lon: 72.8656 },
  SIN: { code: 'SIN', name: 'Singapore Changi', lat: 1.3644, lon: 103.9915 },
  HND: { code: 'HND', name: 'Tokyo Haneda', lat: 35.5494, lon: 139.7798 },
  NRT: { code: 'NRT', name: 'Tokyo Narita', lat: 35.7719, lon: 140.3928 },
  ICN: { code: 'ICN', name: 'Incheon Intl (Seoul)', lat: 37.4602, lon: 126.4407 },
  HKG: { code: 'HKG', name: 'Hong Kong Intl', lat: 22.308, lon: 113.9185 },
  SYD: { code: 'SYD', name: 'Sydney Kingsford Smith', lat: -33.9399, lon: 151.1753 },
  MEX: { code: 'MEX', name: 'Mexico City Intl', lat: 19.4363, lon: -99.0721 },
  GRU: { code: 'GRU', name: 'Sao Paulo-Guarulhos Intl', lat: -23.4356, lon: -46.4731 },
};

/** Looks up an airport's coordinates by 3-letter IATA code (case-insensitive). Returns null if unknown. */
export function getAirportLocation(iataCode: string): AirportLocation | null {
  return AIRPORT_LOCATIONS[iataCode.toUpperCase()] ?? null;
}
