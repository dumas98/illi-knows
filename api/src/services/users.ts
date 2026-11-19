import { mongo } from 'mongoose';
import type { VerifiedToken } from '../auth/firebase.js';
import { User, type UserDoc } from '../models/index.js';

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ') || email;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p.charAt(0).toUpperCase())
    .join('');
}

export async function findOrCreateUser(token: VerifiedToken & { email: string }): Promise<UserDoc> {
  const email = token.email.toLowerCase();
  const byUid = await User.findOne({ firebaseUid: token.uid });
  if (byUid) return byUid;

  const byEmail = await User.findOne({ email });
  if (byEmail) {
    byEmail.firebaseUid = token.uid;
    await byEmail.save();
    return byEmail;
  }

  try {
    return await User.create({ name: token.name?.trim() || nameFromEmail(email), email, firebaseUid: token.uid });
  } catch (err) {
    if (err instanceof mongo.MongoServerError && err.code === 11000) {
      const winner = await User.findOne({ $or: [{ firebaseUid: token.uid }, { email }] });
      if (winner) return winner;
    }
    throw err;
  }
}
