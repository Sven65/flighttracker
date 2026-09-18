import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { setFlash, popFlash } from '../utils/flash';
import type { Driver } from '../db/driver';

interface FormFlash {
  error?: string;
  formValues?: Record<string, unknown>;
}

export default function airportRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);

  // Only ever lists the current user's own custom airports - the shared
  // defaults number in the thousands and are search-only (see /search).
  router.get('/', async (req, res) => {
    const airports = await db.listAirports(req.session.userId!);
    res.render('airports/list', { airports });
  });

  router.get('/new', (req, res) => {
    const flash = popFlash<FormFlash>(req);
    res.render('airports/form', { airport: flash.formValues ?? {}, error: flash.error ?? null });
  });

  router.get('/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) {
      res.json([]);
      return;
    }
    const airports = await db.searchAirports(q, req.session.userId!, 10);
    res.json(
      airports.map((a) => ({
        value: a.icao_code,
        label: a.name,
        sublabel: [a.icao_code, a.iata_code, a.municipality].filter(Boolean).join(' · '),
      }))
    );
  });

  router.post('/', async (req, res) => {
    const { icaoCode, iataCode, name, municipality, countryCode } = req.body;
    const icao = (icaoCode || '').trim().toUpperCase();
    if (!icao || !name || !name.trim()) {
      setFlash(req, { error: 'ICAO code and name are required.', formValues: req.body });
      res.redirect('/airports/new');
      return;
    }
    try {
      await db.createAirport(req.session.userId!, {
        icaoCode: icao,
        iataCode: iataCode ? iataCode.trim().toUpperCase() : null,
        name: name.trim(),
        municipality,
        countryCode: countryCode ? countryCode.trim().toUpperCase() : null,
      });
      res.redirect('/airports');
    } catch {
      setFlash(req, {
        error: `"${icao}" already exists as a default or custom airport.`,
        formValues: req.body,
      });
      res.redirect('/airports/new');
    }
  });

  router.post('/:icao/delete', async (req, res) => {
    await db.deleteAirport(req.params.icao, req.session.userId!);
    res.redirect('/airports');
  });

  return router;
}
