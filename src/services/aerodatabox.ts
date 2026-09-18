import type { FlightLookupResult } from '../types/models';

const API_BASE = 'https://aerodatabox.p.rapidapi.com';
const API_HOST = 'aerodatabox.p.rapidapi.com';

/**
 * Looks up a flight by flight number + date via AeroDataBox (RapidAPI).
 * Returns null if the feature isn't configured (no API key), the flight
 * wasn't found, or the request failed for any reason - callers treat
 * "no result" and "error" the same way (nothing to prefill, try manually).
 *
 * IMPORTANT: this parser is written from AeroDataBox's public docs and
 * third-party examples, not a live-tested response - I have no API key of
 * my own to verify it against. The field paths below (departure.airport,
 * aircraft.model/reg, etc.) are AeroDataBox's documented shape as of when
 * this was written, but if a real lookup comes back with `found: true`
 * and mostly-empty fields, that's the first place to check - open the raw
 * response (a temporary console.log(json) in this file is the fastest way
 * to see the actual shape) and adjust the field paths below to match.
 */
export async function lookupFlight(
  flightNumber: string,
  date: string
): Promise<FlightLookupResult | null> {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) return null;

  const cleanNumber = flightNumber.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleanNumber || !date) return null;

  const url = `${API_BASE}/flights/number/${encodeURIComponent(cleanNumber)}/${encodeURIComponent(date)}`;

  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': API_HOST,
      },
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  // The endpoint returns an array (codeshares / multiple operations on the
  // same number can both match) - take the first entry.
  const flight = Array.isArray(json) ? json[0] : json;
  if (!flight || typeof flight !== 'object') return null;

  return parseFlight(flight as Record<string, unknown>);
}

function parseFlight(flight: Record<string, unknown>): FlightLookupResult {
  const departure = asRecord(flight.departure);
  const arrival = asRecord(flight.arrival);
  const airline = asRecord(flight.airline);
  const aircraft = asRecord(flight.aircraft);

  const departureAirport = asRecord(departure?.airport);
  const arrivalAirport = asRecord(arrival?.airport);

  const departureLocal = pickTime(departure, 'local');
  const arrivalLocal = pickTime(arrival, 'local');
  const departureUtc = pickTime(departure, 'utc');
  const arrivalUtc = pickTime(arrival, 'utc');

  const status = typeof flight.status === 'string' ? flight.status : null;
  const isDiverted = status === 'Diverted';

  // Best-effort - AeroDataBox's exact field for "where a diverted flight
  // actually ended up" isn't confirmed against a live response (see the
  // module doc comment above). Tries a couple of plausible shapes, falls
  // back to null (still correctly flags isDiverted, just without a
  // specific airport) if none match.
  const divertedToIcao =
    extractIcao(asRecord(arrival?.actualAirport)) ??
    extractIcao(asRecord(flight.diversionAirport)) ??
    extractIcao(asRecord(arrival?.divertedTo)) ??
    null;

  return {
    originIcao: extractIcao(departureAirport),
    destinationIcao: extractIcao(arrivalAirport),
    departureTime: extractHhMm(departureLocal),
    arrivalTime: extractHhMm(arrivalLocal),
    durationMinutes: minutesBetween(departureUtc, arrivalUtc),
    isDiverted,
    divertedToIcao,
    carrierName: typeof airline?.name === 'string' ? airline.name : null,
    carrierIcao: typeof airline?.icao === 'string' ? airline.icao : null,
    aircraftModel: typeof aircraft?.model === 'string' ? aircraft.model : null,
    aircraftManufacturer: null, // AeroDataBox's aircraft.model is usually "Manufacturer Model" combined
    aircraftRegistration: typeof aircraft?.reg === 'string' ? aircraft.reg : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractIcao(airport: Record<string, unknown> | null): string | null {
  if (!airport) return null;
  const icao = airport.icao;
  return typeof icao === 'string' && icao.length > 0 ? icao.toUpperCase() : null;
}

/** Prefers actualTime over scheduledTime when the provider has live/completed data. */
function pickTime(node: Record<string, unknown> | null, kind: 'local' | 'utc'): string | null {
  if (!node) return null;
  const actual = asRecord(node.actualTime);
  const revised = asRecord(node.revisedTime);
  const scheduled = asRecord(node.scheduledTime);
  const value = actual?.[kind] ?? revised?.[kind] ?? scheduled?.[kind];
  return typeof value === 'string' ? value : null;
}

function extractHhMm(timeStr: string | null): string | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function minutesBetween(utcStart: string | null, utcEnd: string | null): number | null {
  if (!utcStart || !utcEnd) return null;
  const start = Date.parse(normalizeUtc(utcStart));
  const end = Date.parse(normalizeUtc(utcEnd));
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

/** AeroDataBox UTC timestamps look like "2026-09-16 12:05Z" - add the "T" ISO needs. */
function normalizeUtc(value: string): string {
  return value.includes('T') ? value : value.replace(' ', 'T');
}
