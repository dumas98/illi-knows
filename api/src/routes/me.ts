import { Router } from 'express';
import { z } from 'zod';
import { REMINDERS, type MeDTO, type Reminder, type Role } from '@illi-knows/shared';
import { currentUser, requireUser } from '../auth/middleware.js';
import { unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { Organization, User, type UserDoc } from '../models/index.js';
import { buildPlanner } from '../services/planner.js';

const PreferencesBody = z
  .object({
    defaultReminder: z.enum(REMINDERS).optional(),
    rsvpAnonymously: z.boolean().optional(),
    emailReminders: z.boolean().optional()
  })
  .strict();

const LOGIN_TOUCH_MS = 60 * 60 * 1000;

async function toMe(user: UserDoc): Promise<MeDTO> {
  const orgs = await Organization.find({ 'members.user': user._id }).select('name slug').sort({ name: 1 }).lean();
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    roles: user.roles as Role[],
    preferences: {
      defaultReminder: (user.preferences?.defaultReminder ?? 'none') as Reminder,
      rsvpAnonymously: user.preferences?.rsvpAnonymously ?? false,
      emailReminders: user.preferences?.emailReminders ?? true
    },
    organizations: orgs.map(o => ({ id: String(o._id), name: o.name, slug: o.slug }))
  };
}

function me(res: Parameters<typeof currentUser>[0]): UserDoc {
  const user = currentUser(res);
  if (!user) throw unauthorized();
  return user;
}

export function meRouter(): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/', async (_req, res) => {
    const user = me(res);
    if (!user.lastLoginAt || Date.now() - user.lastLoginAt.getTime() > LOGIN_TOUCH_MS) {
      await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    }
    res.json(await toMe(user));
  });

  router.get('/planner', async (_req, res) => {
    res.json(await buildPlanner(me(res)));
  });

  router.patch('/preferences', async (req, res) => {
    const user = me(res);
    const body = parse(PreferencesBody, req.body);
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (v !== undefined) set[`preferences.${k}`] = v;
    const updated = Object.keys(set).length
      ? await User.findByIdAndUpdate(user._id, { $set: set }, { returnDocument: 'after', runValidators: true })
      : user;
    res.json(await toMe(updated ?? user));
  });

  return router;
}
