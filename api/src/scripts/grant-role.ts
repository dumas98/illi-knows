import { ROLES, type Role } from '@illi-knows/shared';
import { loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { User } from '../models/index.js';
import { nameFromEmail } from '../services/users.js';

const [emailArg, roleArg] = process.argv.slice(2);
if (!emailArg || !roleArg || !(ROLES as readonly string[]).includes(roleArg)) {
  console.error(`Usage: npm run grant-role -- <email> <${ROLES.join('|')}>`);
  process.exit(1);
}
const email = emailArg.toLowerCase();
const role = roleArg as Role;

const config = loadConfig();
await connectDb(config.MONGODB_URI);
const user = await User.findOneAndUpdate(
  { email },
  { $addToSet: { roles: { $each: ['student', role] } }, $setOnInsert: { email, name: nameFromEmail(email) } },
  { upsert: true, returnDocument: 'after', runValidators: true }
);
console.log(`${user.email} now has roles: ${user.roles.join(', ')}`);
await disconnectDb();
