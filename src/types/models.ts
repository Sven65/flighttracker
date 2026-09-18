/**
 * Domain types shared across the driver interface, routes, and views.
 * These describe the shape of data as it comes out of the database
 * (snake_case, matching the SQL columns) - routes/views read these
 * directly rather than re-mapping to camelCase.
 */

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  is_admin: 0 | 1;
  invites_remaining: number;
  created_at: string;
}

export interface InviteCode {
  code: string;
  created_by: number;
  used_by: number | null;
  created_at: string;
  used_at: string | null;
}

export interface InviteCodeWithUsage extends InviteCode {
  used_by_username: string | null;
}

export interface UserWithInviteStats {
  id: number;
  username: string;
  is_admin: 0 | 1;
  invites_remaining: number;
  created_at: string;
  invites_created: number;
  invites_used: number;
}

/** user_id is null for the shared, seeded defaults; set for a user's own entry. */
export interface Carrier {
  id: number;
  user_id: number | null;
  name: string;
  iata_code: string | null;
  icao_code: string | null;
  notes: string | null;
  created_at: string;
}

export interface CarrierWithFlightCount extends Carrier {
  flight_count: number;
}

export interface Aircraft {
  id: number;
  user_id: number | null;
  manufacturer: string | null;
  model: string;
  registration: string | null;
  notes: string | null;
  created_at: string;
}

export interface AircraftWithFlightCount extends Aircraft {
  flight_count: number;
}

export interface Flight {
  id: number;
  user_id: number;
  flight_date: string | null;
  origin: string | null;
  destination: string | null;
  carrier_id: number | null;
  aircraft_id: number | null;
  flight_number: string | null;
  seat: string | null;
  notes: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  duration_minutes: number | null;
  /** ICAO code of where the flight actually landed, if different from destination. Null = not diverted. */
  diverted_to: string | null;
  created_at: string;
}

/** A flight row joined with its carrier/aircraft display fields. */
export interface FlightWithJoins extends Flight {
  carrier_name: string | null;
  aircraft_manufacturer: string | null;
  aircraft_model: string | null;
}

export interface TopCarrierStat {
  name: string;
  flight_count: number;
}

export interface TopAircraftStat {
  manufacturer: string | null;
  model: string;
  flight_count: number;
}

export interface LongestFlightStat {
  flight_id: number;
  flight_date: string | null;
  origin: string;
  destination: string;
  distance_km: number;
}

export interface UserStats {
  total_flights: number;
  unique_carriers: number;
  unique_aircraft: number;
  topCarriers: TopCarrierStat[];
  topAircraft: TopAircraftStat[];
  /** Sum of great-circle distance for flights whose origin+destination both resolve to a known airport. */
  total_distance_km: number;
  flights_with_known_distance: number;
  unique_airports_visited: number;
  unique_countries_visited: number;
  longest_flight: LongestFlightStat | null;
  /** Sum of duration_minutes across all flights that have it set - independent of airport recognition. */
  total_duration_minutes: number;
  flights_with_known_duration: number;
  diverted_flight_count: number;
}

/** One flight's route, resolved to coordinates - what the dashboard map draws. */
export interface FlightRoute {
  flight_id: number;
  flight_date: string | null;
  carrier_name: string | null;
  origin_icao: string;
  origin_name: string | null;
  origin_lat: number;
  origin_lon: number;
  /** The originally scheduled destination - always this, even when diverted. */
  destination_icao: string;
  destination_name: string | null;
  /** The airport actually used for the drawn route/distance: diverted_to when set, destination otherwise. */
  effective_destination_icao: string;
  effective_destination_name: string | null;
  destination_lat: number;
  destination_lon: number;
  distance_km: number;
  is_diverted: boolean;
}

/** user_id is null for the shared, seeded defaults; set for a user's own custom airport. */
export interface Airport {
  icao_code: string;
  user_id: number | null;
  iata_code: string | null;
  name: string;
  municipality: string | null;
  country_code: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
}

// ---- inputs (what routes hand to the driver) ----------------------------

export interface CreateUserInput {
  username: string;
  email: string | null;
  passwordHash: string;
  isAdmin?: boolean;
}

export interface CarrierInput {
  name: string;
  iataCode?: string | null;
  icaoCode?: string | null;
  notes?: string | null;
}

export interface AircraftInput {
  manufacturer?: string | null;
  model: string;
  registration?: string | null;
  notes?: string | null;
}

export interface CreateFlightInput {
  userId: number;
  flightDate?: string | null;
  origin?: string | null;
  destination?: string | null;
  carrierId?: number | string | null;
  aircraftId?: number | string | null;
  flightNumber?: string | null;
  seat?: string | null;
  notes?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  durationMinutes?: number | null;
  divertedTo?: string | null;
}

export type UpdateFlightInput = Omit<CreateFlightInput, 'userId'>;

export interface AirportInput {
  icaoCode: string;
  iataCode?: string | null;
  name: string;
  municipality?: string | null;
  countryCode?: string | null;
  continent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Shape the frontend's debounced search widget expects from any /search endpoint. */
export interface SearchResultItem {
  value: string;
  label: string;
  sublabel: string;
}

/**
 * Normalized result from looking up a flight number + date against an
 * external flight-data provider (see src/services/aerodatabox.ts). Fields
 * are best-effort - any of them may be null if the provider didn't have
 * that piece of data for this specific flight.
 */
export interface FlightLookupResult {
  originIcao: string | null;
  destinationIcao: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes: number | null;
  isDiverted: boolean;
  divertedToIcao: string | null;
  /** Raw text from the provider - used to best-effort match against our own carriers/aircraft. */
  carrierName: string | null;
  carrierIcao: string | null;
  aircraftModel: string | null;
  aircraftManufacturer: string | null;
  aircraftRegistration: string | null;
}

/** What the /flights/lookup route hands back to the browser - resolved against our own data where possible. */
export interface FlightLookupResponse {
  found: boolean;
  origin: string | null;
  destination: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  durationMinutes: number | null;
  isDiverted: boolean;
  divertedTo: string | null;
  carrier: { value: number; label: string } | null;
  aircraft: { value: number; label: string } | null;
  /** Set when the provider named a carrier/aircraft we couldn't match to an existing entry. */
  unmatchedCarrierText: string | null;
  unmatchedAircraftText: string | null;
}
