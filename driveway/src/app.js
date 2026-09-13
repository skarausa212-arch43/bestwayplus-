import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import { config, isProd } from './config.js';
import { attachUser } from './lib/auth.js';
import { AppError } from './lib/errors.js';
import { authRouter } from './routes/auth.routes.js';
import { listingsRouter } from './routes/listings.routes.js';
import { offersRouter } from './routes/offers.routes.js';
import { metaRouter, wantedRouter } from './routes/meta.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      },
      crossOriginResourcePolicy: { policy: 'same-site' }
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true, env: config.env, time: Date.now() }));

  app.use('/api/auth', authRouter);
  app.use('/api/listings', listingsRouter);
  app.use('/api/wanted', wantedRouter);
  app.use('/api', offersRouter);
  app.use('/api', metaRouter);

  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false }));

  if (fs.existsSync(config.publicDir)) {
    app.use(express.static(config.publicDir, { index: 'index.html' }));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'That photo is too large.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large.' });
    }
    if (!isProd) console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side.' });
  });

  return app;
}
