import { User, IUser } from '../models/User.js';
import { isDBConnected } from '../config/db.js';
import { memoryStore, MemUser } from './memoryStore.js';
import { ENV } from '../config/env.js';
import crypto from 'crypto';

export const authService = {
  async getOrCreateTeacher(firebaseUser: {
    uid: string;
    email?: string | null;
    name?: string | null;
    photoURL?: string | null;
  }): Promise<IUser | MemUser> {
    const email = firebaseUser.email ? firebaseUser.email.toLowerCase() : `${firebaseUser.uid}@exam.co`;
    const name = firebaseUser.name || email.split('@')[0] || 'Teacher';

    if (isDBConnected()) {
      try {
        let user = await User.findOne({ firebaseUid: firebaseUser.uid });
        if (!user) {
          user = await User.create({
            firebaseUid: firebaseUser.uid,
            name,
            email,
            photoURL: firebaseUser.photoURL || '',
            role: 'teacher'
          });
        }
        return user;
      } catch (err) {
        if (ENV.isProd) throw err;
        console.warn('MongoDB query fallback to memory store for teacher:', err);
      }
    }

    // Memory fallback
    let mem = memoryStore.users.get(firebaseUser.uid);
    if (!mem) {
      mem = {
        _id: `user_${crypto.randomUUID().slice(0, 8)}`,
        firebaseUid: firebaseUser.uid,
        name,
        email,
        photoURL: firebaseUser.photoURL || '',
        role: 'teacher',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      memoryStore.users.set(firebaseUser.uid, mem);
    }
    return mem;
  },

  async getTeacherByUid(uid: string): Promise<IUser | MemUser | null> {
    if (isDBConnected()) {
      try {
        return await User.findOne({ firebaseUid: uid });
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    }
    return memoryStore.users.get(uid) || null;
  }
};
