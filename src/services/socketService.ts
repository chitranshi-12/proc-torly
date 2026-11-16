/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * exam.co Real-Time Socket.IO Client Service
 */

import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './api';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    const backendUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    socketInstance = io(backendUrl, {
      auth: (cb) => {
        cb({ token: getAuthToken() });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 45000
    });

    socketInstance.on('connect', () => {
      console.log('⚡ exam.co socket connected:', socketInstance?.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('⚡ exam.co socket disconnected:', reason);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('⚡ exam.co socket connection warning:', err.message);
    });
  }
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
