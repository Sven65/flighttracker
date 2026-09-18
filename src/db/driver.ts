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
  InviteCode,
  InviteCodeWithUsage,
  ThemePreference,
  UserWithInviteStats,
} from '../types/models';

/**
 * Contract every DB backend implements. Routes call these methods, never
 * raw SQL. Carrier/aircraft/airport methods take userId to enforce the
 * ownership model: rows with no owner are shared defaults, rows with an
 * owner are private to that user.
 *
 * To add a backend: implement this class in src/db/<name>Driver.ts,
 * register it in db/index.ts, set DB_DRIVER=<name>.
 */
export abstract class Driver {
  abstract init(): Promise<void>;
  abstract close(): Promise<void>;

  // ---- users -------------------------------------------------------
  abstract createUser(data: CreateUserInput): Promise<User>;
  abstract getUserByUsername(username: string): Promise<User | null>;
  abstract getUserById(id: number): Promise<User | null>;
  /** Throws on a duplicate email (the column is UNIQUE) - callers should catch and show a friendly message. */
  abstract updateUserEmail(userId: number, email: string | null): Promise<User | null>;
  abstract updateUserPassword(userId: number, passwordHash: string): Promise<void>;
  abstract updateUserTheme(userId: number, theme: ThemePreference): Promise<void>;
  abstract countUsers(): Promise<number>;
  abstract listAllUsersForAdmin(): Promise<UserWithInviteStats[]>;

  // ---- invite codes ----------------------------------------------------
  abstract createInviteCode(userId: number, code: string): Promise<void>;
  abstract getInviteCode(code: string): Promise<InviteCode | null>;
  abstract markInviteCodeUsed(code: string, usedByUserId: number): Promise<void>;
  abstract listInviteCodesCreatedBy(userId: number): Promise<InviteCodeWithUsage[]>;
  /** No-ops if invites_remaining is already 0 - never goes negative. */
  abstract decrementInvites(userId: number): Promise<void>;
  abstract grantInvites(userId: number, amount: number): Promise<void>;

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
