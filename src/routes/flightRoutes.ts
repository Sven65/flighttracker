import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import type { Driver } from '../db/driver';
import type { FlightLookupResponse } from '../types/models';
import { lookupFlight } from '../services/aerodatabox';

/** Combines separate hours/minutes form fields into total minutes, or null if both are blank. */
function combineDuration(hours: string | undefined, minutes: string | undefined): number | null {
  if (!hours && !minutes) return null;
  const h = hours ? parseInt(hours, 10) : 0;
  const m = minutes ? parseInt(minutes, 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default function flightRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);

  const lookupEnabled = Boolean(process.env.AERODATABOX_API_KEY);

  router.get('/', async (req, res) => {
    const flights = await db.listFlightsForUser(req.session.userId!);
    res.render('flights/list', { flights });
  });

  router.get('/new', (req, res) => {
    res.render('flights/form', { flight: {}, error: null, isEdit: false, lookupEnabled });
  });

  // Looks up a flight by number + date via AeroDataBox (if configured) and
  // resolves the returned carrier/aircraft text against this user's own
  // visible entries where possible. Never fails hard - "not found" and
  // "lookup error" both just come back as { found: false }, so the form
  // can fall back to manual entry either way.
  router.get('/lookup', async (req, res) => {
    if (!lookupEnabled) {
      res.status(404).json({ found: false });
      return;
    }
    const flightNumber = typeof req.query.flightNumber === 'string' ? req.query.flightNumber : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!flightNumber.trim() || !date.trim()) {
      res.status(400).json({ found: false });
      return;
    }

    const result = await lookupFlight(flightNumber, date);
    if (!result) {
      const empty: FlightLookupResponse = {
        found: false,
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
        durationMinutes: null,
        isDiverted: false,
        divertedTo: null,
        carrier: null,
        aircraft: null,
        unmatchedCarrierText: null,
        unmatchedAircraftText: null,
      };
      res.json(empty);
      return;
    }

    const userId = req.session.userId!;

    let carrier: FlightLookupResponse['carrier'] = null;
    let unmatchedCarrierText: string | null = null;
    if (result.carrierIcao || result.carrierName) {
      const byIcao = result.carrierIcao ? await db.searchCarriers(result.carrierIcao, userId, 1) : [];
      const byName =
        byIcao.length === 0 && result.carrierName
          ? await db.searchCarriers(result.carrierName, userId, 1)
          : [];
      const match = byIcao[0] ?? byName[0];
      if (match) {
        carrier = { value: match.id, label: match.name };
      } else {
        unmatchedCarrierText = result.carrierName ?? result.carrierIcao;
      }
    }

    let aircraft: FlightLookupResponse['aircraft'] = null;
    let unmatchedAircraftText: string | null = null;
    if (result.aircraftModel) {
      const byFullText = await db.searchAircraft(result.aircraftModel, userId, 1);
      const lastWord = result.aircraftModel.trim().split(/\s+/).pop() || '';
      const byLastWord =
        byFullText.length === 0 && lastWord ? await db.searchAircraft(lastWord, userId, 1) : [];
      const match = byFullText[0] ?? byLastWord[0];
      if (match) {
        aircraft = { value: match.id, label: [match.manufacturer, match.model].filter(Boolean).join(' ') };
      } else {
        unmatchedAircraftText = result.aircraftModel;
      }
    }

    const response: FlightLookupResponse = {
      found: true,
      origin: result.originIcao,
      destination: result.destinationIcao,
      departureTime: result.departureTime,
      arrivalTime: result.arrivalTime,
      durationMinutes: result.durationMinutes,
      isDiverted: result.isDiverted,
      divertedTo: result.divertedToIcao,
      carrier,
      aircraft,
      unmatchedCarrierText,
      unmatchedAircraftText,
    };
    res.json(response);
  });

  router.post('/', async (req, res) => {
    const {
      flightDate,
      origin,
      destination,
      carrierId,
      aircraftId,
      flightNumber,
      seat,
      notes,
      departureTime,
      arrivalTime,
      durationHours,
      durationMinutes,
      divertedTo,
    } = req.body;
    await db.createFlight({
      userId: req.session.userId!,
      flightDate,
      origin,
      destination,
      carrierId: carrierId || null,
      aircraftId: aircraftId || null,
      flightNumber,
      seat,
      notes,
      departureTime,
      arrivalTime,
      durationMinutes: combineDuration(durationHours, durationMinutes),
      divertedTo,
    });
    res.redirect('/flights');
  });

  router.get('/:id/edit', async (req, res) => {
    const flight = await db.getFlight(req.params.id, req.session.userId!);
    if (!flight) {
      res.status(404).send('Flight not found');
      return;
    }
    res.render('flights/form', { flight, error: null, isEdit: true, lookupEnabled });
  });

  router.post('/:id', async (req, res) => {
    const {
      flightDate,
      origin,
      destination,
      carrierId,
      aircraftId,
      flightNumber,
      seat,
      notes,
      departureTime,
      arrivalTime,
      durationHours,
      durationMinutes,
      divertedTo,
    } = req.body;
    await db.updateFlight(req.params.id, req.session.userId!, {
      flightDate,
      origin,
      destination,
      carrierId: carrierId || null,
      aircraftId: aircraftId || null,
      flightNumber,
      seat,
      notes,
      departureTime,
      arrivalTime,
      durationMinutes: combineDuration(durationHours, durationMinutes),
      divertedTo,
    });
    res.redirect('/flights');
  });

  router.post('/:id/delete', async (req, res) => {
    await db.deleteFlight(req.params.id, req.session.userId!);
    res.redirect('/flights');
  });

  return router;
}
