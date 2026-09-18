import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import type { Driver } from '../db/driver';

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
    res.render('airports/form', { airport: {}, error: null });
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
      res.render('airports/form', {
        airport: req.body,
        error: 'ICAO code and name are required.',
      });
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
    } catch (err) {
      res.render('airports/form', {
        airport: req.body,
        error: `"${icao}" already exists as a default or custom airport.`,
      });
    }
  });

  router.post('/:icao/delete', async (req, res) => {
    await db.deleteAirport(req.params.icao, req.session.userId!);
    res.redirect('/airports');
  });

  return router;
}
