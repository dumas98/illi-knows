import { loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { ALL_MODELS } from '../models/index.js';

const config = loadConfig();
await connectDb(config.MONGODB_URI, { autoIndex: false });
for (const model of ALL_MODELS) {
  const dropped = await model.syncIndexes();
  const indexes = await model.collection.indexes();
  console.log(`${model.collection.collectionName}: ${indexes.length} indexes${dropped.length ? `, dropped ${dropped.join(', ')}` : ''}`);
}
await disconnectDb();
