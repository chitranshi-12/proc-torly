/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WebRTC Signaling Layer backed by Cloud Firestore
 * Facilitates peer-to-peer screen and webcam streaming between Student and Invigilator.
 */

import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { getSocket } from './socketService';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export class FirebaseWebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private sessionId: string;
  private examId?: string;
  private role: 'student' | 'invigilator';
  private onRemoteStreamCb?: (stream: MediaStream) => void;
  private unsubscribeSnapshot?: () => void;
  private localStream: MediaStream | null = null;
  private socketCleanups: (() => void)[] = [];

  constructor(
    sessionId: string,
    role: 'student' | 'invigilator',
    onRemoteStream?: (stream: MediaStream) => void,
    examId?: string
  ) {
    this.sessionId = sessionId;
    this.role = role;
    this.onRemoteStreamCb = onRemoteStream;
    this.examId = examId;
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onRemoteStreamCb?.(event.streams[0]);
      }
    };
  }

  // Student attaches webcam or screen tracks
  public addLocalStream(stream: MediaStream) {
    this.localStream = stream;
    if (!this.pc) return;
    stream.getTracks().forEach((track) => {
      this.pc?.addTrack(track, stream);
    });
  }

  // Invigilator initiates call
  public async startCall(): Promise<void> {
    if (!this.pc) return;
    const socket = getSocket();
    const callDoc = doc(db, 'signaling', this.sessionId);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    // Collect and broadcast ICE candidates via Socket.IO (+ Firestore fallback)
    this.pc.onicecandidate = async (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice_candidate', {
          attemptId: this.sessionId,
          examId: this.examId,
          candidate: event.candidate.toJSON(),
          from: 'teacher'
        });
        try {
          await addDoc(offerCandidates, event.candidate.toJSON());
        } catch (_) {}
      }
    };

    // Create Offer
    const offerDescription = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await this.pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type
    };

    // 1. Real-Time Socket Signaling: Send offer to candidate room
    socket.emit('webrtc:offer', {
      attemptId: this.sessionId,
      examId: this.examId,
      offer
    });

    // 2. Fallback to Firestore signaling doc
    try {
      await setDoc(callDoc, {
        id: this.sessionId,
        sessionId: this.sessionId,
        offer,
        type: 'offer',
        updatedAt: serverTimestamp()
      });
    } catch (_) {}

    // Listen for Answer via Socket.IO
    const onAnswer = (data: any) => {
      if (data?.attemptId === this.sessionId && data?.answer && this.pc && !this.pc.currentRemoteDescription) {
        this.pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(console.warn);
      }
    };
    socket.on('webrtc:answer', onAnswer);
    this.socketCleanups.push(() => socket.off('webrtc:answer', onAnswer));

    // Listen for Answer ICE Candidates via Socket.IO
    const onIce = (data: any) => {
      if (data?.attemptId === this.sessionId && data?.from === 'student' && data?.candidate && this.pc) {
        this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.warn);
      }
    };
    socket.on('webrtc:ice_candidate', onIce);
    this.socketCleanups.push(() => socket.off('webrtc:ice_candidate', onIce));

    // Fallback: Listen for Answer in Firestore
    this.unsubscribeSnapshot = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      const pc = this.pc;
      if (pc && !pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription).catch(() => {});
      }
    });

    // Fallback: Listen for Answer ICE Candidates in Firestore
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          this.pc?.addIceCandidate(candidate).catch(() => {});
        }
      });
    });
  }

  // Student answers call
  public async listenAndAnswer(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const socket = getSocket();
    const callDoc = doc(db, 'signaling', this.sessionId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice_candidate', {
          attemptId: this.sessionId,
          examId: this.examId,
          candidate: event.candidate.toJSON(),
          from: 'student'
        });
        try {
          await addDoc(answerCandidates, event.candidate.toJSON());
        } catch (_) {}
      }
    };

    const handleOffer = async (offerData: any) => {
      if (!this.pc || this.pc.currentRemoteDescription) return;
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(offerData));
        const answerDescription = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answerDescription);

        const answer = {
          type: answerDescription.type,
          sdp: answerDescription.sdp
        };

        // Real-Time Socket Signaling answer back to teachers room
        socket.emit('webrtc:answer', {
          attemptId: this.sessionId,
          examId: this.examId,
          answer
        });

        // Firestore fallback
        try {
          await updateDoc(callDoc, { answer, updatedAt: serverTimestamp() });
        } catch (_) {}
      } catch (err) {
        console.warn('Student WebRTC handleOffer error:', err);
      }
    };

    // Listen for Offer via Socket.IO
    const onOffer = (data: any) => {
      if (data?.attemptId === this.sessionId && data?.offer) {
        handleOffer(data.offer);
      }
    };
    socket.on('webrtc:offer', onOffer);
    this.socketCleanups.push(() => socket.off('webrtc:offer', onOffer));

    // Listen for Offer ICE Candidates via Socket.IO
    const onIce = (data: any) => {
      if (data?.attemptId === this.sessionId && data?.from === 'teacher' && data?.candidate && this.pc) {
        this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.warn);
      }
    };
    socket.on('webrtc:ice_candidate', onIce);
    this.socketCleanups.push(() => socket.off('webrtc:ice_candidate', onIce));

    // Firestore fallback for offer
    this.unsubscribeSnapshot = onSnapshot(callDoc, async (snapshot) => {
      const data = snapshot.data();
      if (data?.offer) {
        handleOffer(data.offer);
      }
    });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          this.pc?.addIceCandidate(candidate).catch(() => {});
        }
      });
    });
  }

  public close() {
    this.socketCleanups.forEach((cleanup) => cleanup());
    this.socketCleanups = [];
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
