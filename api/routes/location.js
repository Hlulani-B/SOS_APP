import { Router } from 'express';
import { Location } from '../functions/location.js';
import { callFunction } from '../caller.js';

const location = new Location();

const ALLOWED = ['addEmail', 'ShareLocation', 'StopLiveLocation', 'getLocationsByEmails'];

const router = Router();

/**
 * POST /api/location
 * body: { "function": "addEmail", "params": ["name@example.com"] }
 */
router.post('/', async (req, res) => {
  const { status, payload } = await callFunction(location, ALLOWED, req.body);
  res.status(status).json(payload);
});

export default router;
