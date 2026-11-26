import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import type { ApiErrorBody } from '@illi-knows/shared';
import { authenticate } from './auth/middleware.js';
import type { TokenVerifier } from './auth/firebase.js';
import type { Config } from './config.js';
import { HttpError } from './lib/errors.js';
import { eventsRouter } from './routes/events.js';
import { meRouter } from './routes/me.js';
import { organizerRouter } from './routes/organizer.js';
import { placesRouter } from './routes/places.js';

export interface AppDeps {
  config: Pick<Config, 'CORS_ORIGINS' | 'ALLOWED_EMAIL_DOMAIN' | 'REQUIRE_VERIFIED_EMAIL' | 'DEMO_MODE' | 'PUBLIC_WEB_URL'>;
  verifyToken: TokenVerifier;
  logRequests?: boolean;
}

function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function createApp({ config, verifyToken, logRequests = false }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  if (logRequests) {
    app.use(pinoHttp({ autoLogging: { ignore: req => req.url === '/api/health' } }));
  }
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 600 }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
    res.status(db === 'up' ? 200 : 503).json({ ok: db === 'up', db });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ demoMode: config.DEMO_MODE, allowedEmailDomain: config.ALLOWED_EMAIL_DOMAIN });
  });

  app.use(
    '/api',
    authenticate({
      verifyToken,
      allowedEmailDomain: config.ALLOWED_EMAIL_DOMAIN,
      requireVerifiedEmail: config.REQUIRE_VERIFIED_EMAIL
    })
  );
  app.use('/api/events', eventsRouter({ webUrl: config.PUBLIC_WEB_URL }));
  app.use('/api/places', placesRouter());
  app.use('/api/me', meRouter());
  app.use('/api/organizer', organizerRouter());

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
