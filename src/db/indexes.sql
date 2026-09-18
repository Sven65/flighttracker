-- Split out from schema.sql: these reference columns (like user_id) that
-- might only just have been added by a migration on an upgrade, so they
-- must run strictly after schema.sql AND any ALTER TABLE migrations.
CREATE INDEX IF NOT EXISTS idx_carriers_user ON carriers(user_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_user ON aircraft(user_id);

CREATE INDEX IF NOT EXISTS idx_flights_user ON flights(user_id);
CREATE INDEX IF NOT EXISTS idx_flights_carrier ON flights(carrier_id);
CREATE INDEX IF NOT EXISTS idx_flights_aircraft ON flights(aircraft_id);

CREATE INDEX IF NOT EXISTS idx_airports_name ON airports(name);
CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports(iata_code);
CREATE INDEX IF NOT EXISTS idx_airports_user ON airports(user_id);
