import { Router } from 'express';
import { Users } from '../functions/users.js';
import { callFunction } from '../caller.js';

const users = new Users();

const ALLOWED = [
  'Checkuser',
  'getFullName',
  'getProfiles',
  'addUser',
  'setName',
  'setSurname',
  'setAvatar',
];

const router = Router();

/**
 * POST /api/users
 * body: { "function": "Checkuser", "params": ["name@example.com"] }
 */
router.post('/', async (req, res) => {
  const { status, payload } = await callFunction(users, ALLOWED, req.body);
  res.status(status).json(payload);
});

export default router;
