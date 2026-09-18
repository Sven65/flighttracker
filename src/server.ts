import 'dotenv/config';
import path from 'path';
import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import helmet from 'helmet';

import { getDb } from './db';
import { attachUser, requireAuth } from './middleware/auth';
import { ensureCsrfToken, verifyCsrfToken } from './middleware/csrf';
import authRoutes from './routes/authRoutes';
import flightRoutes from './routes/flightRoutes';
import carrierRoutes from './routes/carrierRoutes';
import aircraftRoutes from './routes/aircraftRoutes';
import airportRoutes from './routes/airportRoutes';
import accountRoutes from './routes/accountRoutes';

const SQLiteStore = connectSqlite3(session);

async function main(): Promise<void> {
  const db = await getDb();

  const app = express();
  app.set('view engine', 'ejs');
  // views/ and public/ live at the project root, one level up from both
  // src/ (dev, via ts-node) and dist/ (prod, via tsc) - so this path works
  // in both places.
  app.set('views', path.join(__dirname, '..', 'views'));

  // Only trust X-Forwarded-* headers when actually running behind a
  // reverse proxy (Caddy, Traefik, nginx) - otherwise a client could
  // spoof its own IP and bypass rate limiting. Also makes the session
  // cookie's `secure` flag work correctly (see below) and gives
  // rate-limiting the real client IP instead of the proxy's.
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  // referrerPolicy: false leaves the browser's own default
  // (strict-origin-when-cross-origin) in place, rather than Helmet's
  // default of stripping the Referer header entirely. Harmless either way
  // for the current tile provider (Esri doesn't require it), but some free
  // tile/map services do check it, so this avoids a needless dependency on
  // whichever one is wired up later.
  app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: false }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    session({
      store: new SQLiteStore({
        dir: path.join(__dirname, '..', 'data'),
        db: 'sessions.sqlite',
      }) as unknown as session.Store,
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
        // Only marked secure (HTTPS-only) when a reverse proxy is
        // confirmed to be terminating TLS in front - see TRUST_PROXY.
        // Setting this true without an actual HTTPS-terminating proxy in
        // front would silently break every login (browsers refuse to
        // send secure cookies over plain HTTP).
        secure: trustProxy,
      },
    })
  );

  app.use(ensureCsrfToken);
  app.use(verifyCsrfToken);
  app.use(attachUser(db));

  app.use('/', authRoutes(db));
  app.use('/flights', flightRoutes(db));
  app.use('/carriers', carrierRoutes(db));
  app.use('/aircraft', aircraftRoutes(db));
  app.use('/airports', airportRoutes(db));
  app.use('/account', accountRoutes(db));

  app.get('/', requireAuth, async (req, res) => {
    const [stats, recentFlights, flightRoutes] = await Promise.all([
      db.getStatsForUser(req.session.userId!),
      db.listFlightsForUser(req.session.userId!),
      db.getFlightRoutesForUser(req.session.userId!),
    ]);
    res.render('dashboard', { stats, recentFlights: recentFlights.slice(0, 8), flightRoutes });
  });

  app.use((req, res) => {
    res.status(404).render('404');
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Flighttracker listening on http://localhost:${port}`);
  });

  process.on('SIGINT', async () => {
    await db.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
