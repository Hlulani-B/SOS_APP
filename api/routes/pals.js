import { Router } from 'express';
import { Pals } from '../functions/pals.js';
import { callFunction } from '../caller.js';

const pals = new Pals();

const ALLOWED = [
  'send_invite',
  'get_invites',
  'get_sent_invites',
  'get_pals',
  'make_pals',
  'accept_invite',
  'remove_pal',
];

const router = Router();

/**
 * POST /api/pals
 * body: { "function": "send_invite", "params": ["inviter@example.com", "invitee@example.com"] }
 */
router.post('/', async (req, res) => {
  const { status, payload } = await callFunction(pals, ALLOWED, req.body);
  res.status(status).json(payload);
});

export default router;
