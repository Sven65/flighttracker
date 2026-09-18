import fs from 'fs';
import path from 'path';
import type { Driver } from './driver';
import type { AirportInput } from '../types/models';

/** Seeded once into an empty table - never touches a DB that already has data. */
const SEED_CARRIERS: { name: string; iataCode: string; icaoCode: string }[] = [
  { name: 'Scandinavian Airlines', iataCode: 'SK', icaoCode: 'SAS' },
  { name: 'Norwegian Air Shuttle', iataCode: 'DY', icaoCode: 'NAX' },
  { name: 'Finnair', iataCode: 'AY', icaoCode: 'FIN' },
  { name: 'Icelandair', iataCode: 'FI', icaoCode: 'ICE' },
  { name: 'Air Baltic', iataCode: 'BT', icaoCode: 'BTI' },
  { name: 'Ryanair', iataCode: 'FR', icaoCode: 'RYR' },
  { name: 'easyJet', iataCode: 'U2', icaoCode: 'EZY' },
  { name: 'Wizz Air', iataCode: 'W6', icaoCode: 'WZZ' },
  { name: 'Lufthansa', iataCode: 'LH', icaoCode: 'DLH' },
  { name: 'KLM Royal Dutch Airlines', iataCode: 'KL', icaoCode: 'KLM' },
  { name: 'Air France', iataCode: 'AF', icaoCode: 'AFR' },
  { name: 'British Airways', iataCode: 'BA', icaoCode: 'BAW' },
  { name: 'Swiss International Air Lines', iataCode: 'LX', icaoCode: 'SWR' },
  { name: 'Austrian Airlines', iataCode: 'OS', icaoCode: 'AUA' },
  { name: 'Brussels Airlines', iataCode: 'SN', icaoCode: 'BEL' },
  { name: 'TAP Air Portugal', iataCode: 'TP', icaoCode: 'TAP' },
  { name: 'Iberia', iataCode: 'IB', icaoCode: 'IBE' },
  { name: 'Vueling', iataCode: 'VY', icaoCode: 'VLG' },
  { name: 'Aer Lingus', iataCode: 'EI', icaoCode: 'EIN' },
  { name: 'LOT Polish Airlines', iataCode: 'LO', icaoCode: 'LOT' },
  { name: 'Aegean Airlines', iataCode: 'A3', icaoCode: 'AEE' },
  { name: 'Turkish Airlines', iataCode: 'TK', icaoCode: 'THY' },
  { name: 'Virgin Atlantic', iataCode: 'VS', icaoCode: 'VIR' },
  { name: 'Emirates', iataCode: 'EK', icaoCode: 'UAE' },
  { name: 'Qatar Airways', iataCode: 'QR', icaoCode: 'QTR' },
  { name: 'Etihad Airways', iataCode: 'EY', icaoCode: 'ETD' },
  { name: 'Singapore Airlines', iataCode: 'SQ', icaoCode: 'SIA' },
  { name: 'Cathay Pacific', iataCode: 'CX', icaoCode: 'CPA' },
  { name: 'All Nippon Airways', iataCode: 'NH', icaoCode: 'ANA' },
  { name: 'Japan Airlines', iataCode: 'JL', icaoCode: 'JAL' },
  { name: 'Korean Air', iataCode: 'KE', icaoCode: 'KAL' },
  { name: 'China Southern Airlines', iataCode: 'CZ', icaoCode: 'CSN' },
  { name: 'China Eastern Airlines', iataCode: 'MU', icaoCode: 'CES' },
  { name: 'American Airlines', iataCode: 'AA', icaoCode: 'AAL' },
  { name: 'Delta Air Lines', iataCode: 'DL', icaoCode: 'DAL' },
  { name: 'United Airlines', iataCode: 'UA', icaoCode: 'UAL' },
  { name: 'Southwest Airlines', iataCode: 'WN', icaoCode: 'SWA' },
  { name: 'JetBlue Airways', iataCode: 'B6', icaoCode: 'JBU' },
  { name: 'Air Canada', iataCode: 'AC', icaoCode: 'ACA' },
  { name: 'Qantas', iataCode: 'QF', icaoCode: 'QFA' },
];

const SEED_AIRCRAFT: { manufacturer: string; model: string }[] = [
  { manufacturer: 'Boeing', model: '737-700' },
  { manufacturer: 'Boeing', model: '737-800' },
  { manufacturer: 'Boeing', model: '737 MAX 8' },
  { manufacturer: 'Boeing', model: '737 MAX 9' },
  { manufacturer: 'Boeing', model: '757-200' },
  { manufacturer: 'Boeing', model: '767-300' },
  { manufacturer: 'Boeing', model: '777-200' },
  { manufacturer: 'Boeing', model: '777-300ER' },
  { manufacturer: 'Boeing', model: '787-8' },
  { manufacturer: 'Boeing', model: '787-9' },
  { manufacturer: 'Boeing', model: '787-10' },
  { manufacturer: 'Boeing', model: '747-8' },
  { manufacturer: 'Airbus', model: 'A220-300' },
  { manufacturer: 'Airbus', model: 'A319' },
  { manufacturer: 'Airbus', model: 'A320' },
  { manufacturer: 'Airbus', model: 'A320neo' },
  { manufacturer: 'Airbus', model: 'A321' },
  { manufacturer: 'Airbus', model: 'A321neo' },
  { manufacturer: 'Airbus', model: 'A330-300' },
  { manufacturer: 'Airbus', model: 'A330-900neo' },
  { manufacturer: 'Airbus', model: 'A350-900' },
  { manufacturer: 'Airbus', model: 'A350-1000' },
  { manufacturer: 'Airbus', model: 'A380' },
  { manufacturer: 'Embraer', model: 'E170' },
  { manufacturer: 'Embraer', model: 'E175' },
  { manufacturer: 'Embraer', model: 'E190' },
  { manufacturer: 'Embraer', model: 'E195-E2' },
  { manufacturer: 'ATR', model: '72-600' },
  { manufacturer: 'Bombardier', model: 'CRJ900' },
  { manufacturer: 'De Havilland', model: 'Dash 8 Q400' },
];

interface RawAirportSeedRow {
  icao: string;
  iata: string | null;
  name: string;
  municipality: string | null;
  country: string | null;
  continent: string | null;
  lat: number;
  lon: number;
}

export async function seedIfEmpty(db: Driver): Promise<void> {
  const existingCarriers = await db.defaultCarrierCount();
  if (existingCarriers === 0) {
    await db.bulkInsertCarriers(
      SEED_CARRIERS.map((c) => ({ name: c.name, iataCode: c.iataCode, icaoCode: c.icaoCode, notes: null }))
    );
    console.log(`Seeded ${SEED_CARRIERS.length} carriers`);
  }

  const existingAircraft = await db.defaultAircraftCount();
  if (existingAircraft === 0) {
    await db.bulkInsertAircraft(
      SEED_AIRCRAFT.map((a) => ({
        manufacturer: a.manufacturer,
        model: a.model,
        registration: null,
        notes: null,
      }))
    );
    console.log(`Seeded ${SEED_AIRCRAFT.length} aircraft types`);
  }

  const existingAirports = await db.defaultAirportCount();
  if (existingAirports === 0) {
    const seedPath = path.join(__dirname, 'seeds', 'airports.json');
    const raw = fs.readFileSync(seedPath, 'utf8');
    const rows: RawAirportSeedRow[] = JSON.parse(raw);
    const inputs: AirportInput[] = rows.map((r) => ({
      icaoCode: r.icao,
      iataCode: r.iata,
      name: r.name,
      municipality: r.municipality,
      countryCode: r.country,
      continent: r.continent,
      latitude: r.lat,
      longitude: r.lon,
    }));
    await db.bulkInsertAirports(inputs);
    console.log(`Seeded ${inputs.length} airports`);
  }
}
