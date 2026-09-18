import type {
  User,
  Carrier,
  CarrierWithFlightCount,
  Aircraft,
  AircraftWithFlightCount,
  FlightWithJoins,
  CreateUserInput,
  CarrierInput,
  AircraftInput,
  CreateFlightInput,
  UpdateFlightInput,
  UserStats,
  Airport,
  AirportInput,
  FlightRoute,
} from '../types/models';

/**
 * Driver interface
 * -----------------
 * This is the contract every database backend must implement. It exposes
 * domain-level operations (createUser, listFlightsForUser, ...) rather than
 * raw SQL, so callers (routes) never know or care what's underneath.
 *
 * Ownership model: carriers, aircraft, and airports all support a shared
 * "default" tier (owned by nobody, visible to every user) plus entries a
 * specific user adds themselves (visible and editable only by them). Every
 * list/get/search/update/delete method below takes the current user's id
 * for exactly this reason - implementations must include rows where the
 * owner is null OR matches that id, and must restrict update/delete to
 * rows the user actually owns (never the shared defaults).
 *
 * To add a new backend later (Postgres, MySQL, ...):
 *   1. Create src/db/<name>Driver.ts
 *   2. class <Name>Driver extends Driver { ...implement every method below }
 *   3. Register it in db/index.ts's driver map
 *   4. Set DB_DRIVER=<name> in .env
 *
 * Every method here is async, even though the SQLite implementation
 * happens to be synchronous under the hood - that keeps route code
 * identical no matter which driver is active, including future drivers
 * that genuinely need to await a network round trip.
 */
export abstract class Driver {
  /** Run migrations / create tables. Called once at startup. */
  abstract init(): Promise<void>;

  /** Close any open connections/handles. Called on shutdown. */
  abstract close(): Promise<void>;

  // ---- users -------------------------------------------------------
  abstract createUser(data: CreateUserInput): Promise<User>;
  abstract getUserByUsername(username: string): Promise<User | null>;
  abstract getUserById(id: number): Promise<User | null>;
  /** Throws on a duplicate email (the column is UNIQUE) - callers should catch and show a friendly message. */
  abstract updateUserEmail(userId: number, email: string | null): Promise<User | null>;
  abstract updateUserPassword(userId: number, passwordHash: string): Promise<void>;

  // ---- carriers (airlines) ------------------------------------------
  /** Always creates the row owned by userId - there is no user-facing way to add a shared default. */
  abstract createCarrier(userId: number, data: CarrierInput): Promise<Carrier>;
  /** Insert many rows owned by nobody (user_id NULL) - used once at startup to load seed carriers. */
  abstract bulkInsertCarriers(rows: CarrierInput[]): Promise<void>;
  /** Count of shared-default rows only, to decide whether the carrier seed step still needs to run. */
  abstract defaultCarrierCount(): Promise<number>;
  /** Shared defaults (user_id IS NULL) plus this user's own entries. */
  abstract listCarriers(userId: number): Promise<CarrierWithFlightCount[]>;
  abstract getCarrier(id: number | string, userId: number): Promise<Carrier | null>;
  /** Only affects a row this user owns; a shared default or another user's row is left untouched. */
  abstract updateCarrier(id: number | string, userId: number, data: CarrierInput): Promise<Carrier | null>;
  abstract deleteCarrier(id: number | string, userId: number): Promise<void>;
  /** Substring match against name/IATA/ICAO, for the flight form's debounced search box. */
  abstract searchCarriers(query: string, userId: number, limit?: number): Promise<Carrier[]>;

  // ---- aircraft (types / specific airframes) -------------------------
  abstract createAircraft(userId: number, data: AircraftInput): Promise<Aircraft>;
  /** Insert many rows owned by nobody (user_id NULL) - used once at startup to load seed aircraft. */
  abstract bulkInsertAircraft(rows: AircraftInput[]): Promise<void>;
  abstract defaultAircraftCount(): Promise<number>;
  abstract listAircraft(userId: number): Promise<AircraftWithFlightCount[]>;
  abstract getAircraft(id: number | string, userId: number): Promise<Aircraft | null>;
  abstract updateAircraft(id: number | string, userId: number, data: AircraftInput): Promise<Aircraft | null>;
  abstract deleteAircraft(id: number | string, userId: number): Promise<void>;
  /** Substring match against manufacturer/model/registration, for the flight form's search box. */
  abstract searchAircraft(query: string, userId: number, limit?: number): Promise<Aircraft[]>;


  // ---- airports ------------------------------------------------------
  abstract createAirport(userId: number, data: AirportInput): Promise<Airport>;
  abstract listAirports(userId: number): Promise<Airport[]>;
  abstract deleteAirport(icaoCode: string, userId: number): Promise<void>;
  /** Insert many rows owned by nobody (user_id NULL) - used once at startup to load the seed dataset. */
  abstract bulkInsertAirports(rows: AirportInput[]): Promise<void>;
  /** Count of shared-default rows only, to decide whether the seed step still needs to run. */
  abstract defaultAirportCount(): Promise<number>;
  /** Substring match against name/ICAO/IATA/municipality, for the flight form's search box. */
  abstract searchAirports(query: string, userId: number, limit?: number): Promise<Airport[]>;

  // ---- flights (the actual logbook entries) ---------------------------
  abstract createFlight(data: CreateFlightInput): Promise<FlightWithJoins | null>;
  abstract listFlightsForUser(userId: number): Promise<FlightWithJoins[]>;
  abstract getFlight(id: number | string, userId: number): Promise<FlightWithJoins | null>;
  abstract updateFlight(
    id: number | string,
    userId: number,
    data: UpdateFlightInput
  ): Promise<FlightWithJoins | null>;
  abstract deleteFlight(id: number | string, userId: number): Promise<void>;

  /** Summary stats for a user's dashboard: totals, distance, top carriers/aircraft. */
  abstract getStatsForUser(userId: number): Promise<UserStats>;
  /** Every flight of this user's whose origin+destination both resolve to a known airport - for the map. */
  abstract getFlightRoutesForUser(userId: number): Promise<FlightRoute[]>;
}
