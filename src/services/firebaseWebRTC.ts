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
  private role: 'student' | 'invigilator';
  private onRemoteStreamCb?: (stream: MediaStream) => void;
  private unsubscribeSnapshot?: () => void;
  private localStream: MediaStream | null = null;

  constructor(
    sessionId: string,
    role: 'student' | 'invigilator',
    onRemoteStream?: (stream: MediaStream) => void
  ) {
    this.sessionId = sessionId;
    this.role = role;
    this.onRemoteStreamCb = onRemoteStream;
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
    const callDoc = doc(db, 'signaling', this.sessionId);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    // Collect ICE candidates
    this.pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await addDoc(offerCandidates, event.candidate.toJSON());
        } catch (e) {
          console.warn('ICE candidate save note:', e);
        }
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

    try {
      await setDoc(callDoc, {
        id: this.sessionId,
        sessionId: this.sessionId,
        offer,
        type: 'offer',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `signaling/${this.sessionId}`);
    }

    // Listen for Answer
    this.unsubscribeSnapshot = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      const pc = this.pc;
      if (pc && !pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // Listen for Answer ICE Candidates
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          this.pc?.addIceCandidate(candidate);
        }
      });
    });
  }

  // Student answers call
  public async listenAndAnswer(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const callDoc = doc(db, 'signaling', this.sessionId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await addDoc(answerCandidates, event.candidate.toJSON());
        } catch (e) {
          console.warn('ICE answer candidate save note:', e);
        }
      }
    };

    this.unsubscribeSnapshot = onSnapshot(callDoc, async (snapshot) => {
      const data = snapshot.data();
      const currentPc = this.pc;
      if (currentPc && data?.offer && !currentPc.currentRemoteDescription) {
        await currentPc.setRemoteDescription(new RTCSessionDescription(data.offer));

        const answerDescription = await currentPc.createAnswer();
        await currentPc.setLocalDescription(answerDescription);

        const answer = {
          type: answerDescription.type,
          sdp: answerDescription.sdp
        };

        try {
          await updateDoc(callDoc, { answer, updatedAt: serverTimestamp() });
        } catch (err) {
          console.warn('Failed to update answer in signaling:', err);
        }
      }
    });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          this.pc?.addIceCandidate(candidate);
        }
      });
    });
  }

  public close() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
