/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Silent Background Proctoring Engine & Firebase Storage Uploader
 * 
 * Enforces zero-disruption proctoring on student side:
 * Captures screenshots on violation, uploads to Firebase Storage,
 * logs to Firestore, handles offline network buffering via IndexedDB,
 * and maintains real-time online/offline heartbeats.
 */

import { doc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from './firebase';
import { queueViolationOffline, getQueuedViolations, removeQueuedViolation } from './offlineQueue';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export interface ProctorConfig {
  sessionId: string;
  examId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  webcamVideo: HTMLVideoElement;
  screenVideo: HTMLVideoElement;
}

export class FirebaseProctorEngine {
  private config: ProctorConfig;
  private isRunning = false;
  private cocoModel: cocoSsd.ObjectDetection | null = null;
  private heartbeatTimer: any = null;
  private aiLoopTimer: any = null;
  private lastViolationTime: Record<string, number> = {};
  private consecutiveMissingFace = 0;

  constructor(config: ProctorConfig) {
    this.config = config;
    this.initOnlineSync();
  }

  // Pre-load AI Model
  public async initAI() {
    try {
      await tf.ready();
      this.cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      console.log('✅ AI Face & Object detection initialized for Firebase Proctor');
    } catch (err) {
      console.warn('AI model loading note:', err);
    }
  }

  // Start silent monitoring
  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.attachEventListeners();
    this.startHeartbeat();

    // Run AI checks every 1.5 seconds silently
    this.aiLoopTimer = setInterval(() => {
      if (!this.isRunning) return;
      this.runSilentAiCheck();
    }, 1500);

    // Initial check on launch
    this.checkPendingOfflineQueue();
  }

  public stop() {
    this.isRunning = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.aiLoopTimer) clearInterval(this.aiLoopTimer);
    this.detachEventListeners();

    // Mark offline in Firestore
    const sessionRef = doc(db, 'sessions', this.config.sessionId);
    updateDoc(sessionRef, { isOnline: false, lastHeartbeat: Date.now() }).catch(() => {});
  }

  // Heartbeat to Firestore every 4 seconds
  private startHeartbeat() {
    const sessionRef = doc(db, 'sessions', this.config.sessionId);
    const ping = () => {
      if (!this.isRunning) return;
      updateDoc(sessionRef, {
        isOnline: navigator.onLine,
        lastHeartbeat: Date.now()
      }).catch((err) => {
        // Ignored during network disconnects
      });
    };
    ping();
    this.heartbeatTimer = setInterval(ping, 4000);
  }

  // Listeners for Tab switch, Blur, Fullscreen exit, Shortcuts, Internet status
  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.recordViolation('TAB_SWITCH', 'HIGH', 'Candidate navigated away from examination tab or minimized window');
    }
  };

  private handleWindowBlur = () => {
    this.recordViolation('WINDOW_BLUR', 'MEDIUM', 'Window focus lost / clicked external application or secondary screen');
  };

  private handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      this.recordViolation('FULLSCREEN_EXIT', 'HIGH', 'Candidate exited mandatory fullscreen mode');
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toUpperCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (
      key === 'F12' ||
      (ctrl && shift && ['I', 'J', 'C'].includes(key)) ||
      (ctrl && ['U', 'S', 'P', 'C', 'V', 'X'].includes(key)) ||
      key === 'PRINTSCREEN'
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.recordViolation('CLIPBOARD_DEVTOOLS', 'MEDIUM', `Prohibited key attempt: ${e.key} ${ctrl ? '(with Ctrl)' : ''}`);
      return false;
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    this.recordViolation('CLIPBOARD_DEVTOOLS', 'LOW', 'Right-click context menu attempt');
    return false;
  };

  private handleOfflineEvent = () => {
    this.recordViolation('NETWORK_DISCONNECT', 'MEDIUM', 'Candidate internet connection disconnected');
  };

  private handleOnlineEvent = () => {
    this.recordViolation('NETWORK_RECONNECT', 'LOW', 'Candidate internet connection restored');
    this.checkPendingOfflineQueue();
  };

  private attachEventListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    window.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('offline', this.handleOfflineEvent);
    window.addEventListener('online', this.handleOnlineEvent);
  }

  private detachEventListeners() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('offline', this.handleOfflineEvent);
    window.removeEventListener('online', this.handleOnlineEvent);
  }

  // Silent AI check: Facial presence & Mobile phone detection
  private async runSilentAiCheck() {
    const video = this.config.webcamVideo;
    if (!video || video.readyState < 2) return;

    try {
      if (this.cocoModel) {
        const predictions = await this.cocoModel.detect(video);
        let personCount = 0;
        let phoneDetected = false;

        for (const p of predictions) {
          if (p.score < 0.45) continue;
          const label = p.class.toLowerCase();
          if (label === 'person') personCount++;
          if (['cell phone', 'phone', 'remote'].includes(label)) phoneDetected = true;
        }

        if (phoneDetected) {
          this.recordViolation('PHONE_DETECTED', 'CRITICAL', 'Mobile device or unauthorized electronics detected');
        }

        if (personCount === 0) {
          this.consecutiveMissingFace++;
          if (this.consecutiveMissingFace >= 3) {
            this.recordViolation('FACE_MISSING', 'HIGH', 'No face detected in webcam view for > 3 seconds');
          }
        } else if (personCount > 1) {
          this.consecutiveMissingFace = 0;
          this.recordViolation('MULTIPLE_FACES', 'CRITICAL', `Multiple persons (${personCount}) detected in candidate examination room`);
        } else {
          this.consecutiveMissingFace = 0;
        }
      }
    } catch (e) {
      // Silent catch
    }
  }

  // Capture canvas image base64
  private captureImage(video: HTMLVideoElement | null, maxWidth = 640): string | null {
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch (e) {
      return null;
    }
  }

  // Record violation silently
  public async recordViolation(type: string, severity: string, details: string) {
    const now = Date.now();
    const last = this.lastViolationTime[type] || 0;
    // Debounce exact same violation within 6 seconds
    if (now - last < 6000) return;
    this.lastViolationTime[type] = now;

    const violationId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();
    const screenBase64 = this.captureImage(this.config.screenVideo, 640) || undefined;
    const webcamBase64 = this.captureImage(this.config.webcamVideo, 480) || undefined;

    const payload = {
      id: violationId,
      sessionId: this.config.sessionId,
      examId: this.config.examId,
      studentId: this.config.studentId,
      studentName: this.config.studentName,
      rollNo: this.config.rollNo,
      type,
      severity,
      details,
      timestamp,
      screenBase64,
      webcamBase64
    };

    // If offline, save to IndexedDB immediately
    if (!navigator.onLine) {
      await queueViolationOffline(payload);
      return;
    }

    // Attempt direct upload to Firebase Storage & Firestore
    try {
      await this.uploadViolationToFirebase(payload);
    } catch (err) {
      // On network failure, buffer to IndexedDB for safety
      console.warn('Direct upload failed, caching to offline queue:', err);
      await queueViolationOffline(payload);
    }
  }

  // Upload to Firebase Storage & Firestore
  private async uploadViolationToFirebase(item: any) {
    let screenUrl = '';
    let webcamUrl = '';

    // Upload screen capture to Storage if present
    if (item.screenBase64) {
      try {
        const screenRef = ref(storage, `violations/${item.sessionId}/${item.id}_screen.jpg`);
        await uploadString(screenRef, item.screenBase64, 'data_url');
        screenUrl = await getDownloadURL(screenRef);
      } catch (e) {
        // Fallback: use data URI if storage permission requires specific rule
        screenUrl = item.screenBase64;
      }
    }

    // Upload webcam capture to Storage if present
    if (item.webcamBase64) {
      try {
        const camRef = ref(storage, `violations/${item.sessionId}/${item.id}_cam.jpg`);
        await uploadString(camRef, item.webcamBase64, 'data_url');
        webcamUrl = await getDownloadURL(camRef);
      } catch (e) {
        webcamUrl = item.webcamBase64;
      }
    }

    // Write to Firestore `violations/{violationId}`
    const violationDoc = doc(db, 'violations', item.id);
    await setDoc(violationDoc, {
      id: item.id,
      sessionId: item.sessionId,
      examId: item.examId,
      studentId: item.studentId,
      studentName: item.studentName,
      rollNo: item.rollNo,
      type: item.type,
      severity: item.severity,
      details: item.details,
      timestamp: item.timestamp,
      screenUrl,
      webcamUrl,
      createdAt: serverTimestamp()
    });

    // Increment risk score in student session
    let points = 5;
    if (item.severity === 'MEDIUM') points = 15;
    if (item.severity === 'HIGH') points = 25;
    if (item.severity === 'CRITICAL') points = 40;

    const sessionDoc = doc(db, 'sessions', item.sessionId);
    await updateDoc(sessionDoc, {
      riskScore: increment(points),
      violationCount: increment(1)
    }).catch(() => {});
  }

  // Drains the IndexedDB queue when connectivity is restored
  private initOnlineSync() {
    window.addEventListener('online', () => {
      this.checkPendingOfflineQueue();
    });
  }

  private async checkPendingOfflineQueue() {
    if (!navigator.onLine) return;
    try {
      const items = await getQueuedViolations();
      if (items.length === 0) return;

      console.log(`🌐 Restoring ${items.length} queued violations to Firebase...`);
      for (const item of items) {
        try {
          await this.uploadViolationToFirebase(item);
          await removeQueuedViolation(item.id);
        } catch (e) {
          console.warn('Failed syncing queued item:', e);
        }
      }
      console.log('✅ Offline queue synced successfully.');
    } catch (e) {
      console.warn('Error reading offline queue:', e);
    }
  }
}
