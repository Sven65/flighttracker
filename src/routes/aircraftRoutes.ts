import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import type { Driver } from '../db/driver';

export default function aircraftRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const aircraft = await db.listAircraft(req.session.userId!);
    res.render('aircraft/list', { aircraft, currentUserId: req.session.userId! });
  });

  router.get('/new', (req, res) => {
    res.render('aircraft/form', { aircraft: {}, error: null, isEdit: false });
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
      res.render('aircraft/form', {
        aircraft: req.body,
        error: 'Model is required (e.g. "737-800").',
        isEdit: false,
      });
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
    res.render('aircraft/form', { aircraft, error: null, isEdit: true });
  });

  router.post('/:id', async (req, res) => {
    const { manufacturer, model, registration, notes } = req.body;
    if (!model || !model.trim()) {
      res.render('aircraft/form', {
        aircraft: { ...req.body, id: req.params.id },
        error: 'Model is required.',
        isEdit: true,
      });
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
