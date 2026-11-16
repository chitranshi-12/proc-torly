import { Request, Response } from 'express';
import { authService } from '../services/authService.js';

export const authController = {
  async getMe(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.json({ user: req.user });
  },

  async verifyToken(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Verification failed' });
    }
    return res.json({ success: true, user: req.user });
  }
};
