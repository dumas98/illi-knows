import { Router } from 'express';
import type { PlaceDTO } from '@illi-knows/shared';
import { toPlace, type LeanPlace } from '../lib/serialize.js';
import { Place } from '../models/index.js';

export function placesRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const places = await Place.find().sort({ key: 1 }).lean<LeanPlace[]>();
    const body: PlaceDTO[] = places.map(toPlace);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(body);
  });

  return router;
}
