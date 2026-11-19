import mongoose from 'mongoose';

export async function connectDb(uri: string, opts: { autoIndex?: boolean } = {}): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(uri, { autoIndex: opts.autoIndex ?? true, serverSelectionTimeoutMS: 10000 });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
