import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { setFlash, popFlash } from '../utils/flash';
import type { Driver } from '../db/driver';

interface FormFlash {
  error?: string;
  formValues?: Record<string, unknown>;
}

export default function aircraftRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const aircraft = await db.listAircraft(req.session.userId!);
    res.render('aircraft/list', { aircraft, currentUserId: req.session.userId! });
  });

  router.get('/new', (req, res) => {
    const flash = popFlash<FormFlash>(req);
    res.render('aircraft/form', {
      aircraft: flash.formValues ?? {},
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
    const aircraft = await db.searchAircraft(q, req.session.userId!, 10);
    res.json(
      aircraft.map((a) => ({
        value: a.id,
        label: [a.manufacturer, a.model].filter(Boolean).join(' '),
        sublabel: a.registration || '',
      }))
    );
  });

  router.post('/', async (req, res) => {
    const { manufacturer, model, registration, notes } = req.body;
    if (!model || !model.trim()) {
      setFlash(req, { error: 'Model is required (e.g. "737-800").', formValues: req.body });
      res.redirect('/aircraft/new');
      return;
    }
    await db.createAircraft(req.session.userId!, {
      manufacturer,
      model: model.trim(),
      registration,
      notes,
    });
    res.redirect('/aircraft');
  });

  router.get('/:id/edit', async (req, res) => {
    const aircraft = await db.getAircraft(req.params.id, req.session.userId!);
    if (!aircraft) {
      res.status(404).send('Aircraft not found');
      return;
    }
    if (aircraft.user_id !== req.session.userId) {
      res.status(403).send('Default aircraft cannot be edited - add your own instead.');
      return;
    }
    const flash = popFlash<FormFlash>(req);
    res.render('aircraft/form', {
      aircraft: flash.formValues ?? aircraft,
      error: flash.error ?? null,
      isEdit: true,
    });
  });

  router.post('/:id', async (req, res) => {
    const { manufacturer, model, registration, notes } = req.body;
    if (!model || !model.trim()) {
      setFlash(req, { error: 'Model is required.', formValues: { ...req.body, id: req.params.id } });
      res.redirect(`/aircraft/${req.params.id}/edit`);
      return;
    }
    await db.updateAircraft(req.params.id, req.session.userId!, {
      manufacturer,
      model: model.trim(),
      registration,
      notes,
    });
    res.redirect('/aircraft');
  });

  router.post('/:id/delete', async (req, res) => {
    await db.deleteAircraft(req.params.id, req.session.userId!);
    res.redirect('/aircraft');
  });

  return router;
}
