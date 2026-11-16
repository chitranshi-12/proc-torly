import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vendor: React core
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            // Vendor: Firebase
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase';
            }
            // Vendor: Socket.IO client
            if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) {
              return 'vendor-socket';
            }
            // Vendor: Lucide icons
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            // Heavy teacher-only pages
            if (
              id.includes('InvigilatorDashboard') ||
              id.includes('ExamReports') ||
              id.includes('AdminExamList')
            ) {
              return 'chunk-teacher';
            }
            // Heavy student exam room
            if (id.includes('ExamRoom') || id.includes('ExamCompletion') || id.includes('WaitingRoom')) {
              return 'chunk-exam';
            }
          }
        }
      }
    }
  };
});
