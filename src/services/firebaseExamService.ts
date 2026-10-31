/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Firebase Firestore & Auth Exam Service
 */

import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, handleFirestoreError, OperationType } from './firebase';

const GOOGLE_REDIRECT_PENDING_KEY = 'omni_google_redirect_pending';
const GOOGLE_REDIRECT_TIMESTAMP_KEY = 'omni_google_redirect_ts';
const REDIRECT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function getGoogleSignInErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';

  if (code === 'auth/unauthorized-domain') {
    return 'This site is not authorized for Firebase Authentication. In Firebase Console, open Authentication > Settings > Authorized domains and add the current hostname (for local development, add localhost), then try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is disabled for this Firebase project. In Firebase Console, open Authentication > Sign-in method and enable the Google provider.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google Sign-In popup was closed before completion. Please try again.';
  }

  return error instanceof Error ? error.message : 'Google Sign-In authentication failed.';
}

export interface Question {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  marks: number;
}

export interface ExamData {
  id: string;
  code: string;
  title: string;
  description: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  createdBy: string;
  questions: Question[];
  createdAt: string;
  instituteName?: string;
  requireFullscreen?: boolean;
  retentionDays?: number;
}

export const firebaseExamService = {
  // Listen to current auth user
  onAuthChange(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  hasPendingGoogleRedirect(): boolean {
    if (sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) !== 'true') return false;
    // Expire stale flags so a crashed redirect doesn't block the login page forever
    const ts = Number(sessionStorage.getItem(GOOGLE_REDIRECT_TIMESTAMP_KEY) || 0);
    if (Date.now() - ts > REDIRECT_EXPIRY_MS) {
      sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
      sessionStorage.removeItem(GOOGLE_REDIRECT_TIMESTAMP_KEY);
      return false;
    }
    return true;
  },

  async completeGoogleSignInRedirect() {
    // Always call getRedirectResult — Firebase returns null if there's no pending redirect.
    // We don't gate on hasPendingGoogleRedirect() here so that a redirect that cleared
    // sessionStorage mid-flight (mobile/incognito) is still handled.
    try {
      const credential = await getRedirectResult(auth);
      sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
      sessionStorage.removeItem(GOOGLE_REDIRECT_TIMESTAMP_KEY);
      if (!credential) return null;
      // Upsert the Firestore user doc and return
      return this._upsertInvigilatorDoc(credential.user);
    } catch (error) {
      sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
      sessionStorage.removeItem(GOOGLE_REDIRECT_TIMESTAMP_KEY);
      throw new Error(getGoogleSignInErrorMessage(error));
    }
  },

  // Popup with automatic fallback to redirect when popups are blocked.
  async signInWithGoogle(): Promise<FirebaseUser | null> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const cred = await signInWithPopup(auth, provider);
      return cred.user;
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : '';

      // User deliberately closed the popup — surface a friendly message, don't redirect.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw new Error(getGoogleSignInErrorMessage(error));
      }

      // Popup blocked or unsupported environment — fall back to redirect.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, 'true');
        sessionStorage.setItem(GOOGLE_REDIRECT_TIMESTAMP_KEY, String(Date.now()));
        try {
          await signInWithRedirect(auth, provider);
          return null; // Page will reload; result handled in completeGoogleSignInRedirect
        } catch (redirectError) {
          sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
          sessionStorage.removeItem(GOOGLE_REDIRECT_TIMESTAMP_KEY);
          throw new Error(getGoogleSignInErrorMessage(redirectError));
        }
      }

      throw new Error(getGoogleSignInErrorMessage(error));
    }
  },

  // Internal: upsert Firestore user doc for an invigilator and return the user + role.
  async _upsertInvigilatorDoc(signedInUser: FirebaseUser) {
    const userDoc = doc(db, 'users', signedInUser.uid);
    const snap = await getDoc(userDoc);
    let role = 'invigilator';

    if (!snap.exists()) {
      await setDoc(userDoc, {
        id: signedInUser.uid,
        name: signedInUser.displayName || signedInUser.email?.split('@')[0] || 'Invigilator',
        email: signedInUser.email?.toLowerCase(),
        role: 'invigilator',
        createdAt: new Date().toISOString()
      });
    } else {
      role = snap.data()?.role || 'invigilator';
    }

    return { user: signedInUser, role };
  },

  // Student Enrollment / Sign In
  async enrollStudent(data: {
    name: string;
    email: string;
    rollNo: string;
    examCode: string;
    institute?: string;
    password?: string;
  }) {
    const email = data.email.trim().toLowerCase();
    const rollNo = data.rollNo.trim();
    const pwd = data.password || `Exam@${data.examCode}123!`;

    // 1. Verify Exam Code first so student knows immediately if code is invalid
    const exam = await this.getExamByCode(data.examCode);
    if (!exam) {
      throw new Error(`Exam code "${data.examCode}" was not found. Please verify with your instructor.`);
    }

    // 2. Check for duplicate completed attempts with the same rollNo or email
    try {
      const qRoll = query(
        collection(db, 'sessions'),
        where('examId', '==', exam.id),
        where('rollNo', '==', rollNo)
      );
      const rollSnap = await getDocs(qRoll);
      const duplicateRoll = rollSnap.docs.find((d) => d.data().status === 'submitted');
      if (duplicateRoll) {
        throw new Error(
          `Duplicate attempt rejected: Candidate with Roll No "${rollNo}" has already completed and submitted this examination.`
        );
      }

      const qEmail = query(
        collection(db, 'sessions'),
        where('examId', '==', exam.id),
        where('email', '==', email)
      );
      const emailSnap = await getDocs(qEmail);
      const duplicateEmail = emailSnap.docs.find((d) => d.data().status === 'submitted');
      if (duplicateEmail) {
        throw new Error(
          `Duplicate attempt rejected: Candidate with Email "${email}" has already completed and submitted this examination.`
        );
      }
    } catch (checkErr: any) {
      if (checkErr.message?.includes('Duplicate attempt')) {
        throw checkErr;
      }
    }

    // 3. Resolve or establish Firebase Auth user
    let user: FirebaseUser | null = auth.currentUser;

    if (!user) {
      // Strategy A: Try Anonymous Auth (zero friction, immediate entry)
      try {
        const anonCred = await signInAnonymously(auth);
        user = anonCred.user;
      } catch (anonErr: any) {
        console.warn('Anonymous sign-in unavailable, trying email/password:', anonErr.message);
      }
    }

    if (!user) {
      // Strategy B: Try Email/Password
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pwd);
        user = cred.user;
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          try {
            const cred = await signInWithEmailAndPassword(auth, email, pwd);
            user = cred.user;
          } catch (loginErr: any) {
            // Password mismatch
            throw new Error('This email is already registered with a different password. Please click "Continue with Google" or verify your credentials.');
          }
        } else if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found') {
          // Email/password is disabled in Firebase console - prompt Google sign in!
          throw new Error('Email/Password provider is disabled in Firebase Console. Please click the "Sign in with Google" button below to continue.');
        } else {
          throw new Error(err.message || 'Failed to authenticate student account.');
        }
      }
    }

    if (!user) {
      throw new Error('Authentication required. Please click "Continue with Google" to authenticate.');
    }

    // Save profile in Firestore `users/{uid}`
    const userDoc = doc(db, 'users', user.uid);
    await setDoc(
      userDoc,
      {
        id: user.uid,
        name: data.name.trim(),
        email,
        role: 'student',
        rollNo: rollNo,
        institute: data.institute?.trim() || '',
        createdAt: new Date().toISOString()
      },
      { merge: true }
    );

    // Find or create session
    const sessionId = `${exam.id}_${user.uid}`;
    const sessionDoc = doc(db, 'sessions', sessionId);
    const existingSnap = await getDoc(sessionDoc);

    if (existingSnap.exists() && existingSnap.data()?.status === 'submitted') {
      throw new Error('You have already completed and submitted this examination. Duplicate attempts are not allowed.');
    }

    if (!existingSnap.exists()) {
      await setDoc(sessionDoc, {
        id: sessionId,
        examId: exam.id,
        studentId: user.uid,
        studentName: data.name.trim(),
        rollNo: rollNo,
        email,
        institute: data.institute?.trim() || '',
        status: 'registered',
        consentAgreed: false,
        consentTimestamp: null,
        answers: {},
        score: null,
        totalMarks: exam.questions?.reduce((sum, q) => sum + (q.marks || 1), 0) || 0,
        riskScore: 0,
        violationCount: 0,
        isOnline: true,
        lastHeartbeat: Date.now(),
        startedAt: null,
        endedAt: null
      });
    }

    return {
      user,
      exam,
      sessionId
    };
  },

  // Invigilator Login with Email/Password or Google
  async loginInvigilator(email: string, pass: string) {
    try {
      let user: FirebaseUser;
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
        user = cred.user;
      } catch (loginErr: any) {
        // Firebase v9+ uses auth/invalid-credential for wrong password OR user not found
        const notFound =
          loginErr.code === 'auth/user-not-found' ||
          loginErr.code === 'auth/invalid-credential' ||
          loginErr.code === 'auth/invalid-email';
        if (notFound) {
          try {
            const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
            user = cred.user;
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              // Account exists but password is wrong
              throw new Error('Incorrect password. Please try again or use Google Sign-In.');
            }
            throw createErr;
          }
        } else if (loginErr.code === 'auth/operation-not-allowed') {
          throw new Error('Email/password provider is not enabled in Firebase Console. Please click "Sign in with Google" below.');
        } else {
          throw loginErr;
        }
      }

      const userDoc = doc(db, 'users', user.uid);
      const snap = await getDoc(userDoc);
      let role = 'invigilator';

      if (!snap.exists()) {
        await setDoc(userDoc, {
          id: user.uid,
          name: email.split('@')[0],
          email: email.trim().toLowerCase(),
          role: 'invigilator',
          createdAt: new Date().toISOString()
        });
      } else {
        role = snap.data()?.role || 'invigilator';
      }

      return { user, role };
    } catch (err: any) {
      throw new Error(err.message || 'Invalid invigilator credentials.');
    }
  },

  // Invigilator Login via Google (popup → redirect fallback)
  async loginInvigilatorWithGoogle() {
    const signedInUser = await this.signInWithGoogle();
    if (!signedInUser) return null; // redirect in progress
    return this._upsertInvigilatorDoc(signedInUser);
  },

  async logout() {
    await signOut(auth);
  },

  // Find Exam by 6-char code (Public read allowed in firestore.rules)
  async getExamByCode(code: string): Promise<ExamData | null> {
    try {
      const q = query(collection(db, 'exams'), where('code', '==', code.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const docData = snap.docs[0].data();
      return { id: snap.docs[0].id, ...docData } as ExamData;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'exams');
    }
  },

  // Create new Exam
  async createExam(data: Omit<ExamData, 'id' | 'createdAt'>) {
    const examId = `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const examDoc = doc(db, 'exams', examId);
    const payload: ExamData = {
      ...data,
      id: examId,
      code: data.code.trim().toUpperCase(),
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(examDoc, payload);
      return payload;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `exams/${examId}`);
    }
  },

  // List all Exams
  async getExams(): Promise<ExamData[]> {
    try {
      const snap = await getDocs(collection(db, 'exams'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamData));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'exams');
    }
  },

  // Delete Exam
  async deleteExam(examId: string) {
    try {
      await deleteDoc(doc(db, 'exams', examId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${examId}`);
    }
  },

  // Save Student Consent & Reference Photo
  async recordConsentAndPhoto(sessionId: string, referencePhotoBase64?: string) {
    let photoUrl = '';
    if (referencePhotoBase64) {
      try {
        const photoRef = ref(storage, `references/${sessionId}_ref.jpg`);
        await uploadString(photoRef, referencePhotoBase64, 'data_url');
        photoUrl = await getDownloadURL(photoRef);
      } catch (e) {
        photoUrl = referencePhotoBase64;
      }
    }

    const sessionDoc = doc(db, 'sessions', sessionId);
    await updateDoc(sessionDoc, {
      consentAgreed: true,
      consentTimestamp: new Date().toISOString(),
      referencePhotoUrl: photoUrl,
      status: 'waiting'
    });
  },

  // Start exam session
  async startExamSession(sessionId: string) {
    const sessionDoc = doc(db, 'sessions', sessionId);
    await updateDoc(sessionDoc, {
      status: 'in_progress',
      startedAt: new Date().toISOString()
    });
  },

  // Autosave answers
  async autosaveSessionAnswers(sessionId: string, answers: Record<string, string>) {
    const sessionDoc = doc(db, 'sessions', sessionId);
    await updateDoc(sessionDoc, {
      answers,
      lastSavedAt: new Date().toISOString()
    });
  },

  // Final Submission
  async submitExamSession(sessionId: string, answers: Record<string, string>, questions: Question[]) {
    let scoredMarks = 0;
    let totalMarks = 0;

    for (const q of questions) {
      totalMarks += q.marks || 1;
      const given = answers[q.id];
      if (given && given.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase()) {
        scoredMarks += q.marks || 1;
      }
    }

    const sessionDoc = doc(db, 'sessions', sessionId);
    await updateDoc(sessionDoc, {
      answers,
      score: scoredMarks,
      totalMarks,
      status: 'submitted',
      endedAt: new Date().toISOString()
    });

    return {
      scoredMarks,
      totalMarks,
      percentage: totalMarks > 0 ? Math.round((scoredMarks / totalMarks) * 100) : 0
    };
  },

  // Real-time listener for students in an exam (invigilator dashboard)
  subscribeExamSessions(examId: string, callback: (sessions: any[]) => void) {
    const q = query(collection(db, 'sessions'), where('examId', '==', examId));
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sessions');
      }
    );
  },

  // Real-time listener for violations in an exam (invigilator threat alerts)
  subscribeExamViolations(examId: string, callback: (violations: any[]) => void) {
    const q = query(collection(db, 'violations'), where('examId', '==', examId));
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'violations');
      }
    );
  },

  // Record an integrity violation to Firestore
  async recordViolation(sessionId: string, violation: any) {
    try {
      const vId = `viol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const vDoc = doc(db, 'violations', vId);
      await setDoc(vDoc, {
        id: vId,
        sessionId,
        examId: violation.examId,
        studentId: auth.currentUser?.uid || violation.studentId || 'anonymous',
        studentName: violation.studentName || 'Student',
        rollNo: violation.rollNo || '',
        type: violation.type,
        severity: violation.severity || 'HIGH',
        description: violation.description || '',
        screenImageUrl: violation.screenImageUrl || '',
        camImageUrl: violation.camImageUrl || '',
        timestamp: new Date().toISOString()
      });

      // Update session violationCount
      try {
        const sessionDoc = doc(db, 'sessions', sessionId);
        await updateDoc(sessionDoc, {
          violationCount: violation.count || 1,
          lastViolationAt: new Date().toISOString()
        });
      } catch (e) {}
    } catch (err) {
      console.warn('Firebase record violation note:', err);
    }
  },

  // Manually terminate a student's session (invigilator action)
  async terminateStudentSession(sessionId: string, reason?: string) {
    const sessionDoc = doc(db, 'sessions', sessionId);
    await updateDoc(sessionDoc, {
      status: 'terminated',
      isTerminated: true,
      terminationReason: reason || 'Test manually terminated by invigilator',
      endedAt: new Date().toISOString()
    });
  },

  // Real-time listener for individual session (to detect remote termination)
  subscribeSession(sessionId: string, callback: (session: any) => void) {
    const sessionDoc = doc(db, 'sessions', sessionId);
    return onSnapshot(
      sessionDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          callback({ id: snapshot.id, ...snapshot.data() });
        }
      },
      (error) => {
        console.warn('Session subscribe notice:', error);
      }
    );
  }
};
