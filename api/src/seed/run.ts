import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { seedDatabase } from './seed.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refusing to seed with NODE_ENV=production.');
  process.exit(1);
}

await connectDb(config.MONGODB_URI);
const dbName = mongoose.connection.name;
if (dbName === 'illi-knows' && !process.argv.includes('--allow-production-db')) {
  console.error('This looks like the production database (illi-knows). Seeding deletes everything in it.');
  console.error('Re-run with --allow-production-db if that is really what you want.');
  await disconnectDb();
  process.exit(1);
}

console.log(`Seeding database "${dbName}"...`);
const started = Date.now();
const result = await seedDatabase();
console.table(result);
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
await disconnectDb();
