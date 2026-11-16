import { startServer } from './server/src/server.js';

startServer().catch((err) => {
  console.error('Fatal error during exam.co server startup:', err);
  process.exit(1);
});
