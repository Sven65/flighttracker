import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { Driver } from './driver';
import { haversineKm } from '../utils/geo';
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
  TopCarrierStat,
  TopAircraftStat,
  LongestFlightStat,
  Airport,
  AirportInput,
  FlightRoute,
  InviteCode,
  InviteCodeWithUsage,
  UserWithInviteStats,
} from '../types/models';

export interface SqliteDriverOptions {
  filePath: string;
}

export class SqliteDriver extends Driver {
  private filePath: string;
  private db!: Database.Database;

  constructor({ filePath }: SqliteDriverOptions) {
    super();
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new Database(this.filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    this.db.exec(schema);

    // Pre-ownership-model DBs: backfill existing rows to the first account.
    const carriersJustMigrated = this.ensureColumn(
      'carriers',
      'user_id',
      'INTEGER REFERENCES users(id) ON DELETE CASCADE'
    );
    if (carriersJustMigrated) {
      this.db.exec('UPDATE carriers SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL');
    }
    const aircraftJustMigrated = this.ensureColumn(
      'aircraft',
      'user_id',
      'INTEGER REFERENCES users(id) ON DELETE CASCADE'
    );
    if (aircraftJustMigrated) {
      this.db.exec('UPDATE aircraft SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL');
    }

    this.ensureColumn('flights', 'departure_time', 'TEXT');
    this.ensureColumn('flights', 'arrival_time', 'TEXT');
    this.ensureColumn('flights', 'duration_minutes', 'INTEGER');
    this.ensureColumn('flights', 'diverted_to', 'TEXT');

    const adminJustMigrated = this.ensureColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('users', 'invites_remaining', 'INTEGER NOT NULL DEFAULT 5');
    if (adminJustMigrated) {
      this.db.exec('UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)');
    }

    const indexes = fs.readFileSync(path.join(__dirname, 'indexes.sql'), 'utf8');
    this.db.exec(indexes);
  }

  /** Returns true if the column was actually added (false if it already existed). */
  private ensureColumn(table: string, column: string, columnDdl: string): boolean {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.some((c) => c.name === column)) return false;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnDdl}`);
    return true;
  }

  async close(): Promise<void> {
    if (this.db) this.db.close();
  }

  // ---- users -------------------------------------------------------
  async createUser({ username, email, passwordHash, isAdmin }: CreateUserInput): Promise<User> {
    const stmt = this.db.prepare(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(username, email || null, passwordHash, isAdmin ? 1 : 0);
    const user = await this.getUserById(info.lastInsertRowid as number);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return (this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | User
      | undefined) ?? null;
  }

  async getUserById(id: number): Promise<User | null> {
    return (this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
  }

  async updateUserEmail(userId: number, email: string | null): Promise<User | null> {
    this.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, userId);
    return this.getUserById(userId);
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  }

  async countUsers(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    return row.count;
  }

  async listAllUsersForAdmin(): Promise<UserWithInviteStats[]> {
    return this.db
      .prepare(
        `SELECT
           u.id, u.username, u.is_admin, u.invites_remaining, u.created_at,
           (SELECT COUNT(*) FROM invite_codes WHERE created_by = u.id) AS invites_created,
           (SELECT COUNT(*) FROM invite_codes WHERE created_by = u.id AND used_by IS NOT NULL) AS invites_used
         FROM users u
         ORDER BY u.id ASC`
      )
      .all() as UserWithInviteStats[];
  }

  // ---- invite codes ----------------------------------------------------
  async createInviteCode(userId: number, code: string): Promise<void> {
    this.db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').run(code, userId);
  }

  async getInviteCode(code: string): Promise<InviteCode | null> {
    return (
      (this.db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as
        | InviteCode
        | undefined) ?? null
    );
  }

  async markInviteCodeUsed(code: string, usedByUserId: number): Promise<void> {
    this.db
      .prepare("UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE code = ?")
      .run(usedByUserId, code);
  }

  async listInviteCodesCreatedBy(userId: number): Promise<InviteCodeWithUsage[]> {
    return this.db
      .prepare(
        `SELECT ic.*, u.username AS used_by_username
         FROM invite_codes ic
         LEFT JOIN users u ON u.id = ic.used_by
         WHERE ic.created_by = ?
         ORDER BY ic.created_at DESC`
      )
      .all(userId) as InviteCodeWithUsage[];
  }

  async decrementInvites(userId: number): Promise<void> {
    this.db
      .prepare('UPDATE users SET invites_remaining = invites_remaining - 1 WHERE id = ? AND invites_remaining > 0')
      .run(userId);
  }

  async grantInvites(userId: number, amount: number): Promise<void> {
    this.db.prepare('UPDATE users SET invites_remaining = invites_remaining + ? WHERE id = ?').run(amount, userId);
  }

  // ---- carriers ------------------------------------------------------
  async createCarrier(userId: number, { name, iataCode, icaoCode, notes }: CarrierInput): Promise<Carrier> {
    const stmt = this.db.prepare(
      'INSERT INTO carriers (user_id, name, iata_code, icao_code, notes) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(userId, name, iataCode || null, icaoCode || null, notes || null);
    const carrier = await this.getCarrier(info.lastInsertRowid as number, userId);
    if (!carrier) throw new Error('Failed to create carrier');
    return carrier;
  }

  async bulkInsertCarriers(rows: CarrierInput[]): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT INTO carriers (user_id, name, iata_code, icao_code, notes) VALUES (NULL, ?, ?, ?, ?)'
    );
    const insertAll = this.db.transaction((items: CarrierInput[]) => {
      for (const item of items) {
        stmt.run(item.name, item.iataCode || null, item.icaoCode || null, item.notes || null);
      }
    });
    insertAll(rows);
  }

  async defaultCarrierCount(): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM carriers WHERE user_id IS NULL')
      .get() as { count: number };
    return row.count;
  }

  async listCarriers(userId: number): Promise<CarrierWithFlightCount[]> {
    return this.db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM flights f WHERE f.carrier_id = c.id) AS flight_count
         FROM carriers c
         WHERE c.user_id IS NULL OR c.user_id = ?
         ORDER BY c.name COLLATE NOCASE ASC`
      )
      .all(userId) as CarrierWithFlightCount[];
  }

  async getCarrier(id: number | string, userId: number): Promise<Carrier | null> {
    return (
      (this.db
        .prepare('SELECT * FROM carriers WHERE id = ? AND (user_id IS NULL OR user_id = ?)')
        .get(id, userId) as Carrier | undefined) ?? null
    );
  }

  async updateCarrier(
    id: number | string,
    userId: number,
    { name, iataCode, icaoCode, notes }: CarrierInput
  ): Promise<Carrier | null> {
    this.db
      .prepare(
        'UPDATE carriers SET name = ?, iata_code = ?, icao_code = ?, notes = ? WHERE id = ? AND user_id = ?'
      )
      .run(name, iataCode || null, icaoCode || null, notes || null, id, userId);
    return this.getCarrier(id, userId);
  }

  async deleteCarrier(id: number | string, userId: number): Promise<void> {
    this.db.prepare('DELETE FROM carriers WHERE id = ? AND user_id = ?').run(id, userId);
  }

  async searchCarriers(query: string, userId: number, limit = 10): Promise<Carrier[]> {
    const like = `%${query}%`;
    return this.db
      .prepare(
        `SELECT * FROM carriers
         WHERE (user_id IS NULL OR user_id = ?)
           AND (name LIKE ? OR iata_code LIKE ? OR icao_code LIKE ?)
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(userId, like, like, like, limit) as Carrier[];
  }

  // ---- aircraft --------------------------------------------------------
  async createAircraft(
    userId: number,
    { manufacturer, model, registration, notes }: AircraftInput
  ): Promise<Aircraft> {
    const stmt = this.db.prepare(
      'INSERT INTO aircraft (user_id, manufacturer, model, registration, notes) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(userId, manufacturer || null, model, registration || null, notes || null);
    const aircraft = await this.getAircraft(info.lastInsertRowid as number, userId);
    if (!aircraft) throw new Error('Failed to create aircraft');
    return aircraft;
  }

  async bulkInsertAircraft(rows: AircraftInput[]): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT INTO aircraft (user_id, manufacturer, model, registration, notes) VALUES (NULL, ?, ?, ?, ?)'
    );
    const insertAll = this.db.transaction((items: AircraftInput[]) => {
      for (const item of items) {
        stmt.run(item.manufacturer || null, item.model, item.registration || null, item.notes || null);
      }
    });
    insertAll(rows);
  }

  async defaultAircraftCount(): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM aircraft WHERE user_id IS NULL')
      .get() as { count: number };
    return row.count;
  }

  async listAircraft(userId: number): Promise<AircraftWithFlightCount[]> {
    return this.db
      .prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM flights f WHERE f.aircraft_id = a.id) AS flight_count
         FROM aircraft a
         WHERE a.user_id IS NULL OR a.user_id = ?
         ORDER BY a.manufacturer COLLATE NOCASE ASC, a.model COLLATE NOCASE ASC`
      )
      .all(userId) as AircraftWithFlightCount[];
  }

  async getAircraft(id: number | string, userId: number): Promise<Aircraft | null> {
    return (
      (this.db
        .prepare('SELECT * FROM aircraft WHERE id = ? AND (user_id IS NULL OR user_id = ?)')
        .get(id, userId) as Aircraft | undefined) ?? null
    );
  }

  async updateAircraft(
    id: number | string,
    userId: number,
    { manufacturer, model, registration, notes }: AircraftInput
  ): Promise<Aircraft | null> {
    this.db
      .prepare(
        'UPDATE aircraft SET manufacturer = ?, model = ?, registration = ?, notes = ? WHERE id = ? AND user_id = ?'
      )
      .run(manufacturer || null, model, registration || null, notes || null, id, userId);
    return this.getAircraft(id, userId);
  }

  async deleteAircraft(id: number | string, userId: number): Promise<void> {
    this.db.prepare('DELETE FROM aircraft WHERE id = ? AND user_id = ?').run(id, userId);
  }

  async searchAircraft(query: string, userId: number, limit = 10): Promise<Aircraft[]> {
    const like = `%${query}%`;
    return this.db
      .prepare(
        `SELECT * FROM aircraft
         WHERE (user_id IS NULL OR user_id = ?)
           AND (manufacturer LIKE ? OR model LIKE ? OR registration LIKE ?)
         ORDER BY manufacturer COLLATE NOCASE ASC, model COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(userId, like, like, like, limit) as Aircraft[];
  }

  // ---- airports ----------------------------------------------------
  async createAirport(
    userId: number,
    { icaoCode, iataCode, name, municipality, countryCode, continent, latitude, longitude }: AirportInput
  ): Promise<Airport> {
    this.db
      .prepare(
        `INSERT INTO airports (icao_code, user_id, iata_code, name, municipality, country_code, continent, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        icaoCode,
        userId,
        iataCode || null,
        name,
        municipality || null,
        countryCode || null,
        continent || null,
        latitude ?? null,
        longitude ?? null
      );
    return {
      icao_code: icaoCode,
      user_id: userId,
      iata_code: iataCode || null,
      name,
      municipality: municipality || null,
      country_code: countryCode || null,
      continent: continent || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    };
  }

  /** Only this user's own custom airports - the shared defaults are search-only, never listed in full. */
  async listAirports(userId: number): Promise<Airport[]> {
    return this.db
      .prepare('SELECT * FROM airports WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC')
      .all(userId) as Airport[];
  }

  async deleteAirport(icaoCode: string, userId: number): Promise<void> {
    this.db.prepare('DELETE FROM airports WHERE icao_code = ? AND user_id = ?').run(icaoCode, userId);
  }

  async bulkInsertAirports(rows: AirportInput[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO airports (icao_code, user_id, iata_code, name, municipality, country_code, continent, latitude, longitude)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAll = this.db.transaction((items: AirportInput[]) => {
      for (const item of items) {
        stmt.run(
          item.icaoCode,
          item.iataCode || null,
          item.name,
          item.municipality || null,
          item.countryCode || null,
          item.continent || null,
          item.latitude ?? null,
          item.longitude ?? null
        );
      }
    });
    insertAll(rows);
  }

  async defaultAirportCount(): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM airports WHERE user_id IS NULL')
      .get() as { count: number };
    return row.count;
  }

  async searchAirports(query: string, userId: number, limit = 10): Promise<Airport[]> {
    const like = `%${query}%`;
    return this.db
      .prepare(
        `SELECT * FROM airports
         WHERE (user_id IS NULL OR user_id = ?)
           AND (name LIKE ? OR icao_code LIKE ? OR iata_code LIKE ? OR municipality LIKE ?)
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(userId, like, like, like, like, limit) as Airport[];
  }

  // ---- flights ---------------------------------------------------------
  async createFlight(data: CreateFlightInput): Promise<FlightWithJoins | null> {
    const stmt = this.db.prepare(
      `INSERT INTO flights
        (user_id, flight_date, origin, destination, carrier_id, aircraft_id, flight_number, seat, notes,
         departure_time, arrival_time, duration_minutes, diverted_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      data.userId,
      data.flightDate || null,
      data.origin || null,
      data.destination || null,
      data.carrierId || null,
      data.aircraftId || null,
      data.flightNumber || null,
      data.seat || null,
      data.notes || null,
      data.departureTime || null,
      data.arrivalTime || null,
      data.durationMinutes ?? null,
      data.divertedTo || null
    );
    return this.getFlight(info.lastInsertRowid as number, data.userId);
  }

  async listFlightsForUser(userId: number): Promise<FlightWithJoins[]> {
    return this.db
      .prepare(
        `SELECT f.*, c.name AS carrier_name, a.manufacturer AS aircraft_manufacturer, a.model AS aircraft_model
         FROM flights f
         LEFT JOIN carriers c ON c.id = f.carrier_id
         LEFT JOIN aircraft a ON a.id = f.aircraft_id
         WHERE f.user_id = ?
         ORDER BY (f.flight_date IS NULL), f.flight_date DESC, f.id DESC`
      )
      .all(userId) as FlightWithJoins[];
  }

  async getFlight(id: number | string, userId: number): Promise<FlightWithJoins | null> {
    return (
      (this.db
        .prepare(
          `SELECT f.*, c.name AS carrier_name, a.manufacturer AS aircraft_manufacturer, a.model AS aircraft_model
           FROM flights f
           LEFT JOIN carriers c ON c.id = f.carrier_id
           LEFT JOIN aircraft a ON a.id = f.aircraft_id
           WHERE f.id = ? AND f.user_id = ?`
        )
        .get(id, userId) as FlightWithJoins | undefined) ?? null
    );
  }

  async updateFlight(
    id: number | string,
    userId: number,
    data: UpdateFlightInput
  ): Promise<FlightWithJoins | null> {
    this.db
      .prepare(
        `UPDATE flights SET
          flight_date = ?, origin = ?, destination = ?, carrier_id = ?,
          aircraft_id = ?, flight_number = ?, seat = ?, notes = ?,
          departure_time = ?, arrival_time = ?, duration_minutes = ?, diverted_to = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        data.flightDate || null,
        data.origin || null,
        data.destination || null,
        data.carrierId || null,
        data.aircraftId || null,
        data.flightNumber || null,
        data.seat || null,
        data.notes || null,
        data.departureTime || null,
        data.arrivalTime || null,
        data.durationMinutes ?? null,
        data.divertedTo || null,
        id,
        userId
      );
    return this.getFlight(id, userId);
  }

  async deleteFlight(id: number | string, userId: number): Promise<void> {
    this.db.prepare('DELETE FROM flights WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // ---- stats & map ------------------------------------------------------
  async getFlightRoutesForUser(userId: number): Promise<FlightRoute[]> {
    const rows = this.db
      .prepare(
        `SELECT
           f.id AS flight_id,
           f.flight_date,
           c.name AS carrier_name,
           f.diverted_to IS NOT NULL AS is_diverted,
           oa.icao_code AS origin_icao, oa.name AS origin_name,
           oa.latitude AS origin_lat, oa.longitude AS origin_lon,
           da.icao_code AS destination_icao, da.name AS destination_name,
           ea.icao_code AS effective_destination_icao, ea.name AS effective_destination_name,
           ea.latitude AS destination_lat, ea.longitude AS destination_lon
         FROM flights f
         JOIN airports oa ON oa.icao_code = UPPER(f.origin)
           AND oa.latitude IS NOT NULL AND oa.longitude IS NOT NULL
           AND (oa.user_id IS NULL OR oa.user_id = f.user_id)
         -- da: originally scheduled destination (display only)
         LEFT JOIN airports da ON da.icao_code = UPPER(f.destination)
           AND (da.user_id IS NULL OR da.user_id = f.user_id)
         -- ea: actual endpoint (diverted_to if set, else destination)
         JOIN airports ea ON ea.icao_code = UPPER(COALESCE(f.diverted_to, f.destination))
           AND ea.latitude IS NOT NULL AND ea.longitude IS NOT NULL
           AND (ea.user_id IS NULL OR ea.user_id = f.user_id)
         LEFT JOIN carriers c ON c.id = f.carrier_id
         WHERE f.user_id = ?`
      )
      .all(userId) as Array<{
      flight_id: number;
      flight_date: string | null;
      carrier_name: string | null;
      is_diverted: 0 | 1;
      origin_icao: string;
      origin_name: string | null;
      origin_lat: number;
      origin_lon: number;
      destination_icao: string | null;
      destination_name: string | null;
      effective_destination_icao: string;
      effective_destination_name: string | null;
      destination_lat: number;
      destination_lon: number;
    }>;

    return rows.map((r) => ({
      ...r,
      destination_icao: r.destination_icao ?? r.effective_destination_icao,
      is_diverted: r.is_diverted === 1,
      distance_km: haversineKm(r.origin_lat, r.origin_lon, r.destination_lat, r.destination_lon),
    }));
  }

  async getStatsForUser(userId: number): Promise<UserStats> {
    const totals = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total_flights,
           COUNT(DISTINCT carrier_id) AS unique_carriers,
           COUNT(DISTINCT aircraft_id) AS unique_aircraft
         FROM flights WHERE user_id = ?`
      )
      .get(userId) as { total_flights: number; unique_carriers: number; unique_aircraft: number };

    const topCarriers = this.db
      .prepare(
        `SELECT c.name, COUNT(*) AS flight_count
         FROM flights f JOIN carriers c ON c.id = f.carrier_id
         WHERE f.user_id = ? GROUP BY f.carrier_id ORDER BY flight_count DESC LIMIT 5`
      )
      .all(userId) as TopCarrierStat[];

    const topAircraft = this.db
      .prepare(
        `SELECT a.manufacturer, a.model, COUNT(*) AS flight_count
         FROM flights f JOIN aircraft a ON a.id = f.aircraft_id
         WHERE f.user_id = ? GROUP BY f.aircraft_id ORDER BY flight_count DESC LIMIT 5`
      )
      .all(userId) as TopAircraftStat[];

    const routes = await this.getFlightRoutesForUser(userId);
    const total_distance_km = routes.reduce((sum, r) => sum + r.distance_km, 0);

    let longest_flight: LongestFlightStat | null = null;
    for (const r of routes) {
      if (!longest_flight || r.distance_km > longest_flight.distance_km) {
        longest_flight = {
          flight_id: r.flight_id,
          flight_date: r.flight_date,
          origin: r.origin_icao,
          destination: r.destination_icao,
          distance_km: r.distance_km,
        };
      }
    }

    const airportCodes = new Set<string>();
    routes.forEach((r) => {
      airportCodes.add(r.origin_icao);
      airportCodes.add(r.destination_icao);
    });

    const countryRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT a.country_code) AS count
         FROM flights f
         JOIN airports a ON (a.icao_code = UPPER(f.origin) OR a.icao_code = UPPER(f.destination))
           AND (a.user_id IS NULL OR a.user_id = f.user_id)
           AND a.country_code IS NOT NULL
         WHERE f.user_id = ?`
      )
      .get(userId) as { count: number };

    const durationRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(duration_minutes), 0) AS total_duration_minutes,
           COUNT(duration_minutes) AS flights_with_known_duration
         FROM flights WHERE user_id = ?`
      )
      .get(userId) as { total_duration_minutes: number; flights_with_known_duration: number };

    const divertedRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM flights WHERE user_id = ? AND diverted_to IS NOT NULL')
      .get(userId) as { count: number };

    return {
      ...totals,
      topCarriers,
      topAircraft,
      total_distance_km: Math.round(total_distance_km),
      flights_with_known_distance: routes.length,
      unique_airports_visited: airportCodes.size,
      unique_countries_visited: countryRow.count,
      longest_flight,
      total_duration_minutes: durationRow.total_duration_minutes,
      flights_with_known_duration: durationRow.flights_with_known_duration,
      diverted_flight_count: divertedRow.count,
    };
  }
}
