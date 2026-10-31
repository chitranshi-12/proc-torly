/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OmniProctor Client Socket.IO Service
 */

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('🔌 OmniProctor Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 OmniProctor Socket disconnected:', reason);
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
