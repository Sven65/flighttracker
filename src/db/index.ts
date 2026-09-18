import path from 'path';
import { Driver } from './driver';
import { SqliteDriver } from './sqliteDriver';
import { seedIfEmpty } from './seed';

// Name -> factory. To add a backend, add an entry and implement Driver.
const DRIVERS: Record<string, () => Driver> = {
  sqlite: () =>
    new SqliteDriver({
      filePath: path.resolve(process.cwd(), process.env.SQLITE_PATH || './data/flighttracker.db'),
    }),
  // postgres: () => new PostgresDriver({ connectionString: process.env.DATABASE_URL! }),
};

let instance: Driver | null = null;

export async function getDb(): Promise<Driver> {
  if (instance) return instance;

  const driverName = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
  const factory = DRIVERS[driverName];
  if (!factory) {
    throw new Error(
      `Unknown DB_DRIVER "${driverName}". Available drivers: ${Object.keys(DRIVERS).join(', ')}`
    );
  }

  instance = factory();
  await instance.init();
  await seedIfEmpty(instance);
  return instance;
}
