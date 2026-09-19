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
import adminRoutes from './routes/adminRoutes';

const SQLiteStore = connectSqlite3(session);

const PLACEHOLDER_SECRETS = new Set(['dev-secret-change-me', 'change-this-to-something-long-and-random']);

function checkSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const isUnsafe = !secret || PLACEHOLDER_SECRETS.has(secret);

  if (isUnsafe && process.env.NODE_ENV === 'production') {
    console.error(
      'SESSION_SECRET is missing or still the placeholder value - set a real random string before running in production.'
    );
    process.exit(1);
  }
  if (isUnsafe) {
    console.warn('Warning: SESSION_SECRET is missing or the placeholder value - fine for local dev only.');
  }
  return secret || 'dev-secret-change-me';
}

async function main(): Promise<void> {
  const sessionSecret = checkSessionSecret();
  const db = await getDb();

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  // Needed behind a reverse proxy for rate limiting / secure cookies.
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: false }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    session({
      store: new SQLiteStore({
        dir: path.join(__dirname, '..', 'data'),
        db: 'sessions.sqlite',
      }) as unknown as session.Store,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
        secure: trustProxy,
      },
    })
  );

  app.use(ensureCsrfToken);
  app.use(verifyCsrfToken);
  app.use(attachUser(db));
  app.use((req, res, next) => {
    // req.hostname is proxy-aware but always strips the port, which breaks
    // direct access on a non-standard port (no proxy in front, or testing
    // against the raw :3000). Prefer X-Forwarded-Host (has the real public
    // host+port a proxy is fronting) only when we actually trust it; the
    // raw Host header otherwise, which correctly keeps the port for direct access.
    const forwardedHost = trustProxy ? req.headers['x-forwarded-host'] : undefined;
    const rawForwardedHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    const host = rawForwardedHost?.split(',')[0].trim() || req.get('host');
    res.locals.siteUrl = `${req.protocol}://${host}`;
    res.locals.originalUrl = req.originalUrl;
    next();
  });

  app.use('/', authRoutes(db));
  app.use('/flights', flightRoutes(db));
  app.use('/carriers', carrierRoutes(db));
  app.use('/aircraft', aircraftRoutes(db));
  app.use('/airports', airportRoutes(db));
  app.use('/account', accountRoutes(db));
  app.use('/admin', adminRoutes(db));

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

  const shutdown = async () => {
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown); // Docker sends this on `stop`/`compose down`, not SIGINT
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
