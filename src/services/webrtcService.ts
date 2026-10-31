/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OmniProctor Native WebRTC Manager
 * Handles peer connection creation, ICE gathering, and dual-track streaming (cam + screen)
 */

import { getSocket } from './socketService';

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private onRemoteStreamCb?: (stream: MediaStream) => void;
  private examId: string;
  private sessionId?: string;
  private role: 'student' | 'proctor';
  private targetSocketId?: string;

  constructor(config: {
    examId: string;
    sessionId?: string;
    role: 'student' | 'proctor';
    targetSocketId?: string;
    onRemoteStream?: (stream: MediaStream) => void;
  }) {
    this.examId = config.examId;
    this.sessionId = config.sessionId;
    this.role = config.role;
    this.targetSocketId = config.targetSocketId;
    this.onRemoteStreamCb = config.onRemoteStream;

    this.initPeerConnection();
    this.listenSignaling();
  }

  private initPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        socket.emit('webrtc:signal', {
          targetSocketId: this.targetSocketId,
          sessionId: this.sessionId,
          examId: this.examId,
          signal: event.candidate,
          type: 'candidate',
          fromRole: this.role
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onRemoteStreamCb?.(event.streams[0]);
      }
    };
  }

  public setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    if (!this.pc) return;
    stream.getTracks().forEach((track) => {
      this.pc?.addTrack(track, stream);
    });
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.pc.setLocalDescription(offer);

      const socket = getSocket();
      socket.emit('webrtc:signal', {
        targetSocketId: this.targetSocketId,
        sessionId: this.sessionId,
        examId: this.examId,
        signal: offer,
        type: 'offer',
        fromRole: this.role
      });
      return offer;
    } catch (err) {
      console.warn('WebRTC offer creation warning:', err);
      return null;
    }
  }

  public async handleSignal(data: { signal: any; type: 'offer' | 'answer' | 'candidate'; fromSocketId?: string }) {
    if (!this.pc) return;
    try {
      if (data.type === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        const socket = getSocket();
        socket.emit('webrtc:signal', {
          targetSocketId: data.fromSocketId,
          sessionId: this.sessionId,
          examId: this.examId,
          signal: answer,
          type: 'answer',
          fromRole: this.role
        });
      } else if (data.type === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      } else if (data.type === 'candidate' && data.signal) {
        await this.pc.addIceCandidate(new RTCIceCandidate(data.signal));
      }
    } catch (err) {
      console.warn('WebRTC signal handling notice:', err);
    }
  }

  private listenSignaling() {
    const socket = getSocket();
    socket.on('webrtc:signal', (payload) => {
      if (this.role === 'proctor' && payload.sessionId === this.sessionId) {
        this.handleSignal(payload);
      } else if (this.role === 'student') {
        this.handleSignal(payload);
      }
    });
  }

  public close() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
