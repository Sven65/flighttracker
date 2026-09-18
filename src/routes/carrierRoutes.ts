import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { setFlash, popFlash } from '../utils/flash';
import type { Driver } from '../db/driver';

interface FormFlash {
  error?: string;
  formValues?: Record<string, unknown>;
}

export default function carrierRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const carriers = await db.listCarriers(req.session.userId!);
    res.render('carriers/list', { carriers, currentUserId: req.session.userId! });
  });

  router.get('/new', (req, res) => {
    const flash = popFlash<FormFlash>(req);
    res.render('carriers/form', {
      carrier: flash.formValues ?? {},
      error: flash.error ?? null,
      isEdit: false,
    });
  });

  router.get('/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 1) {
      res.json([]);
      return;
    }
    const carriers = await db.searchCarriers(q, req.session.userId!, 10);
    res.json(
      carriers.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: [c.iata_code, c.icao_code].filter(Boolean).join(' · '),
      }))
    );
  });

  router.post('/', async (req, res) => {
    const { name, iataCode, icaoCode, notes } = req.body;
    if (!name || !name.trim()) {
      setFlash(req, {
        error: 'Name is required.',
        formValues: { name, iata_code: iataCode, icao_code: icaoCode, notes },
      });
      res.redirect('/carriers/new');
      return;
    }
    await db.createCarrier(req.session.userId!, { name: name.trim(), iataCode, icaoCode, notes });
    res.redirect('/carriers');
  });

  router.get('/:id/edit', async (req, res) => {
    const carrier = await db.getCarrier(req.params.id, req.session.userId!);
    if (!carrier) {
      res.status(404).send('Carrier not found');
      return;
    }
    if (carrier.user_id !== req.session.userId) {
      res.status(403).send('Default carriers cannot be edited - add your own instead.');
      return;
    }
    const flash = popFlash<FormFlash>(req);
    res.render('carriers/form', {
      carrier: flash.formValues ?? carrier,
      error: flash.error ?? null,
      isEdit: true,
    });
  });

  router.post('/:id', async (req, res) => {
    const { name, iataCode, icaoCode, notes } = req.body;
    if (!name || !name.trim()) {
      setFlash(req, {
        error: 'Name is required.',
        formValues: { id: req.params.id, name, iata_code: iataCode, icao_code: icaoCode, notes },
      });
      res.redirect(`/carriers/${req.params.id}/edit`);
      return;
    }
    await db.updateCarrier(req.params.id, req.session.userId!, {
      name: name.trim(),
      iataCode,
      icaoCode,
      notes,
    });
    res.redirect('/carriers');
  });

  router.post('/:id/delete', async (req, res) => {
    await db.deleteCarrier(req.params.id, req.session.userId!);
    res.redirect('/carriers');
  });

  return router;
}
