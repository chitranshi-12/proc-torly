import http from 'http';
import path from 'path';
import { createApp } from './app.js';
import { ENV } from './config/env.js';
import { connectDB } from './config/db.js';
import { getAdminApp } from './config/firebaseAdmin.js';
import { setupSocketServer } from './sockets/socketManager.js';
import { errorHandler } from './middleware/errorHandler.js';

export async function startServer() {
  console.log('🚀 Starting exam.co platform server...');

  // Initialize Firebase Admin SDK
  try {
    getAdminApp();
    console.log('🔥 Firebase Admin initialization checked.');
  } catch (err: any) {
    console.warn('⚠️ Firebase Admin note:', err.message);
  }

  // Connect to MongoDB
  try {
    await connectDB();
  } catch (err: any) {
    if (ENV.isProd) {
      console.error('🚨 FATAL: Production MongoDB connection failed. Server startup aborted:', err.message);
      process.exit(1);
    }
    console.error('Database connection note:', err.message);
  }

  const app = createApp();
  const httpServer = http.createServer(app);

  // Initialize Socket.IO on the same HTTP server
  const io = setupSocketServer(httpServer);
  app.set('io', io);

  // In development, hook up Vite middleware
  if (!ENV.isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log('⚡ Vite development middleware attached.');
  } else {
    // Serve static frontend files in production if dist directory exists
    const fs = await import('fs');
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      const express = (await import('express')).default;
      app.use(express.static(distPath));
      app.get('*', (req, res, next) => {
        if (req.url.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Final error handling
  app.use(errorHandler);

  httpServer.listen(ENV.PORT, '0.0.0.0', () => {
    console.log(`✨ exam.co running at http://localhost:${ENV.PORT} [${ENV.NODE_ENV}]`);
  });

  return { app, httpServer, io };
}
