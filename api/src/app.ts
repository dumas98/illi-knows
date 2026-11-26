import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { DEMO_PERSONAS, type ApiErrorBody } from '@illi-knows/shared';
import { authenticate } from './auth/middleware.js';
import type { TokenVerifier } from './auth/firebase.js';
import type { Config } from './config.js';
import { HttpError } from './lib/errors.js';
import { consoleMailer, type Mailer } from './services/mailer.js';
import { eventsRouter } from './routes/events.js';
import { ingestRouter } from './routes/ingest.js';
import { jobsRouter } from './routes/jobs.js';
import { meRouter } from './routes/me.js';
import { organizerRouter } from './routes/organizer.js';
import { placesRouter } from './routes/places.js';
import { reviewRouter } from './routes/review.js';

export interface AppDeps {
  config: Pick<Config, 'CORS_ORIGINS' | 'ALLOWED_EMAIL_DOMAIN' | 'REQUIRE_VERIFIED_EMAIL' | 'DEMO_MODE' | 'PUBLIC_WEB_URL'> & { INGEST_API_KEY?: string; JOBS_API_KEY?: string };
  mailer?: Mailer;
  verifyToken: TokenVerifier;
  logRequests?: boolean;
  /** Per-IP request limits. Tests turn them off. */
  rateLimits?: boolean;
}

function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function createApp({ config, verifyToken, logRequests = false, mailer = consoleMailer(), rateLimits = true }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  if (logRequests) {
    app.use(pinoHttp({ autoLogging: { ignore: req => req.url === '/api/health' } }));
  }
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 600 }));
  // Ingestion batches can be bigger than form posts.
  app.use('/api/ingest', express.json({ limit: '2mb' }));
  app.use(express.json({ limit: '100kb' }));

  if (rateLimits) {
    const limited = (message: string) => (_req: express.Request, res: express.Response) =>
      void res.status(429).json(errorBody('rate_limited', message));
    // Generous, because a classroom can share one campus IP and each page makes several requests.
    // Tighter for anything that changes data.
    app.use(
      '/api',
      rateLimit({ windowMs: 60_000, limit: 1000, standardHeaders: 'draft-8', legacyHeaders: false, handler: limited('Too many requests. Wait a minute and try again.') })
    );
    app.use(
      '/api',
      rateLimit({
        windowMs: 60_000,
        limit: 120,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skip: req => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
        handler: limited('Too many changes in a short time. Wait a minute and try again.')
      })
    );
  }

  app.get('/api/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
    res.status(db === 'up' ? 200 : 503).json({ ok: db === 'up', db });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      demoMode: config.DEMO_MODE,
      allowedEmailDomain: config.ALLOWED_EMAIL_DOMAIN,
      demoPersonas: config.DEMO_MODE ? DEMO_PERSONAS.map(({ key, label, home }) => ({ key, label, home })) : []
    });
  });

  app.use(
    '/api',
    authenticate({
      verifyToken,
      allowedEmailDomain: config.ALLOWED_EMAIL_DOMAIN,
      requireVerifiedEmail: config.REQUIRE_VERIFIED_EMAIL,
      demoMode: config.DEMO_MODE
    })
  );
  app.use('/api/events', eventsRouter({ webUrl: config.PUBLIC_WEB_URL }));
  app.use('/api/places', placesRouter());
  app.use('/api/me', meRouter());
  app.use('/api/organizer', organizerRouter());
  app.use('/api/review', reviewRouter());
  app.use('/api/ingest', ingestRouter({ apiKey: config.INGEST_API_KEY }));
  app.use('/api/jobs', jobsRouter({ apiKey: config.JOBS_API_KEY, mailer, webUrl: config.PUBLIC_WEB_URL, allowedEmailDomain: config.ALLOWED_EMAIL_DOMAIN }));

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody('not_found', 'No such endpoint.'));
  });

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      return void res.status(err.status).json(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return void res.status(400).json(errorBody('invalid_json', 'The request body is not valid JSON.'));
    }
    if ((err as { type?: string }).type === 'entity.too.large') {
      return void res.status(413).json(errorBody('payload_too_large', 'The request body is too large. Send fewer listings per request.'));
    }
        if (err instanceof mongoose.Error.ValidationError) {
      const details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
      return void res.status(400).json(errorBody('invalid_request', 'Some fields are missing or invalid.', details));
    }
    req.log?.error(err);
    if (!req.log) console.error(err);
    res.status(500).json(errorBody('server_error', 'Something went wrong on our side.'));
  };
  app.use(onError);

  return app;
}
