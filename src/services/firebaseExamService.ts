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
  updateProfile,
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
  deleteDoc,
  writeBatch,
  deleteField,
  orderBy
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { api } from './api';

const GOOGLE_REDIRECT_PENDING_KEY = 'omni_google_redirect_pending';
const GOOGLE_REDIRECT_TIMESTAMP_KEY = 'omni_google_redirect_ts';
const REDIRECT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
type GoogleSignInResult = { user: FirebaseUser; role: string };
let googleRedirectCompletion: Promise<GoogleSignInResult | null> | null = null;

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

export type QuestionType = 'mcq' | 'multiple_select' | 'short_answer';

export interface Question {
  id: string;
  type?: QuestionType;
  question: string;
  options?: string[];
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer?: string | string[];
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
  totalMarks?: number;
  requireFullscreen?: boolean;
  retentionDays?: number;
  status?: string;
  allowEarlyStart?: boolean;
  settings?: {
    requireFullscreen?: boolean;
    instituteName?: string;
    allowEarlyStart?: boolean;
    [key: string]: any;
  };
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

  completeGoogleSignInRedirect(): Promise<GoogleSignInResult | null> {
    // Always call getRedirectResult — Firebase returns null if there's no pending redirect.
    // We don't gate on hasPendingGoogleRedirect() here so that a redirect that cleared
    // sessionStorage mid-flight (mobile/incognito) is still handled.
    if (!googleRedirectCompletion) {
      googleRedirectCompletion = (async () => {
        try {
          const credential = await getRedirectResult(auth);
          sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
          sessionStorage.removeItem(GOOGLE_REDIRECT_TIMESTAMP_KEY);
          if (!credential) return null;
          return this._upsertInvigilatorDoc(credential.user);
        } catch (error) {
          sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
          sessionStorage.removeItem(GOOGLE_REDIRECT_TIMESTAMP_KEY);
          throw new Error(getGoogleSignInErrorMessage(error));
        }
      })();
    }
    return googleRedirectCompletion;
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

  // Synchronize teacher identity to Firestore with resilient error handling
  async _upsertInvigilatorDoc(signedInUser: FirebaseUser) {
    try {
      const userDoc = doc(db, 'users', signedInUser.uid);
      const snap = await getDoc(userDoc);
      let role = 'teacher';

      if (!snap.exists()) {
        await setDoc(userDoc, {
          id: signedInUser.uid,
          name: signedInUser.displayName || signedInUser.email?.split('@')[0] || 'Teacher',
          email: signedInUser.email?.toLowerCase(),
          role: 'teacher',
          createdAt: new Date().toISOString()
        });
      } else {
        role = snap.data()?.role || 'teacher';
      }

      return { user: signedInUser, role };
    } catch (err) {
      console.warn('Firestore user profile sync warning (proceeding with Firebase Auth):', err);
      return { user: signedInUser, role: 'teacher' };
    }
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

    // Resolve a student identity, not a teacher account used to preview a test.
    let user: FirebaseUser | null = auth.currentUser;
    if (user) {
      const currentProfile = await getDoc(doc(db, 'users', user.uid));
      if (currentProfile.data()?.role !== 'student') {
        await signOut(auth);
        user = null;
      }
    }

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
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
      return this._upsertInvigilatorDoc(credential.user);
    } catch (err: any) {
      throw new Error(err.message || 'Invalid invigilator credentials.');
    }
  },

  async registerInvigilator(name: string, email: string, pass: string) {
    const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
    await updateProfile(credential.user, { displayName: name.trim() });
    const result = await this._upsertInvigilatorDoc(credential.user);
    return result;
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
      const result = await api.getPublicExamByCode(code.trim().toUpperCase());
      return result.exam as ExamData;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Exam code not found')) return null;
      throw err;
    }
  },

  // Create new Exam
  async createExam(data: Omit<ExamData, 'id' | 'createdAt'>) {
    const examId = `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const { questions, ...examFields } = data;
    const examDoc = doc(db, 'exams', examId);
    const payload: ExamData = {
      ...examFields,
      questions: [],
      id: examId,
      code: data.code.trim().toUpperCase(),
      createdAt: new Date().toISOString()
    };

    try {
      const examData = { ...payload } as Record<string, unknown>;
      delete examData.questions;
      await setDoc(examDoc, examData);

      for (let offset = 0; offset < questions.length; offset += 200) {
        const batch = writeBatch(db);
        const chunk = questions.slice(offset, offset + 200);
        for (const [index, question] of chunk.entries()) {
          const questionId = question.id || `q_${offset + index + 1}`;
          const questionRef = doc(db, 'exams', examId, 'questions', questionId);
          const answerRef = doc(db, 'exams', examId, 'answerKeys', questionId);
          const { correctAnswer, ...publicQuestion } = question;
          batch.set(questionRef, { ...publicQuestion, id: questionId, orderNum: offset + index + 1 });
          batch.set(answerRef, { correctAnswer: correctAnswer || 'A' });
        }
        await batch.commit();
      }

      return { ...payload, questions };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `exams/${examId}`);
    }
  },

  async updateExam(examId: string, data: Partial<ExamData>) {
    try {
      const examRef = doc(db, 'exams', examId);
      const { questions, ...fields } = data;
      await updateDoc(examRef, fields as any);

      if (questions && Array.isArray(questions)) {
        const batch = writeBatch(db);
        for (const [index, question] of questions.entries()) {
          const questionId = question.id || `q_${index + 1}`;
          const questionRef = doc(db, 'exams', examId, 'questions', questionId);
          const answerRef = doc(db, 'exams', examId, 'answerKeys', questionId);
          const { correctAnswer, ...publicQuestion } = question;
          batch.set(questionRef, { ...publicQuestion, id: questionId, orderNum: index + 1 });
          if (correctAnswer !== undefined) {
            batch.set(answerRef, { correctAnswer });
          }
        }
        await batch.commit();
      }
    } catch (err) {
      console.warn('Firebase updateExam note:', err);
    }
  },

  // List all Exams
  async getExams(): Promise<ExamData[]> {
    try {
      const snap = await getDocs(collection(db, 'exams'));
      const exams = await Promise.all(snap.docs.map(async (examDoc) => {
        const exam = { id: examDoc.id, ...examDoc.data() } as ExamData;
        if (Array.isArray(exam.questions) && exam.questions.length > 0) {
          await this.migrateLegacyQuestions(examDoc.ref, exam.questions);
        }
        const questionQuery = query(collection(db, 'exams', examDoc.id, 'questions'), orderBy('orderNum'));
        const questionDocs = await getDocs(questionQuery);
        const answerDocs = await getDocs(collection(db, 'exams', examDoc.id, 'answerKeys'));
        const answers = new Map(answerDocs.docs.map((answer) => [answer.id, answer.data().correctAnswer]));
        exam.questions = questionDocs.docs.map((questionDoc) => ({
          id: questionDoc.id,
          ...questionDoc.data(),
          correctAnswer: answers.get(questionDoc.id)
        } as Question));
        return exam;
      }));
      return exams.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'exams');
    }
  },

  async migrateLegacyQuestions(examRef: ReturnType<typeof doc>, questions: Question[]) {
    for (let offset = 0; offset < questions.length; offset += 200) {
      const batch = writeBatch(db);
      const chunk = questions.slice(offset, offset + 200);
      for (const [index, question] of chunk.entries()) {
        const questionId = question.id || `q_${offset + index + 1}`;
        const questionRef = doc(examRef, 'questions', questionId);
        const answerRef = doc(examRef, 'answerKeys', questionId);
        const { correctAnswer, ...publicQuestion } = question;
        batch.set(questionRef, { ...publicQuestion, id: questionId, orderNum: offset + index + 1 });
        batch.set(answerRef, { correctAnswer: correctAnswer || 'A' });
      }
      await batch.commit();
    }
    await updateDoc(examRef, { questions: deleteField() });
  },

  // Delete Exam
  async deleteExam(examId: string) {
    try {
      for (const collectionName of ['questions', 'answerKeys']) {
        const subcollection = await getDocs(collection(db, 'exams', examId, collectionName));
        for (let offset = 0; offset < subcollection.docs.length; offset += 450) {
          const batch = writeBatch(db);
          subcollection.docs.slice(offset, offset + 450).forEach((item) => batch.delete(item.ref));
          await batch.commit();
        }
      }
      await deleteDoc(doc(db, 'exams', examId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${examId}`);
    }
  },

  // Save Student Consent & Reference Photo (Zero-budget Spark plan: Cloud Storage disabled)
  async recordConsentAndPhoto(sessionId: string, _referencePhotoBase64?: string) {
    if (!sessionId) return;
    // On Firebase Spark (free tier), Cloud Storage is disabled to avoid Blaze billing requirement.
    // Consent metadata and verification status are recorded directly in MongoDB through the backend API.
    try {
      const sessionDoc = doc(db, 'sessions', sessionId);
      const updatePromise = updateDoc(sessionDoc, {
        consentAgreed: true,
        consentTimestamp: new Date().toISOString(),
        referencePhotoUrl: '',
        photoUploadStatus: 'not_provided',
        status: 'waiting'
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore session update timeout')), 2000)
      );
      await Promise.race([updatePromise, timeoutPromise]);
    } catch (err) {
      console.warn('Firestore session consent note:', err);
    }
  },

  // Start exam session
  async startExamSession(sessionId: string) {
    return api.startExam(sessionId);
  },

  // Autosave answers
  async autosaveSessionAnswers(sessionId: string, answers: Record<string, string>) {
    return api.saveAnswers(sessionId, answers);
  },

  // Final Submission
  async submitExamSession(sessionId: string, answers: Record<string, string>, terminated: boolean) {
    return api.submitExam(sessionId, { answers, terminated });
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

  // Record an integrity violation to Firestore (Spark ₹0 Tier: Cloud image upload disabled; live streaming active)
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
        screenImageUrl: '',
        camImageUrl: '',
        evidenceStatus: 'live_stream_only',
        timestamp: new Date().toISOString()
      });

      // Update session violationCount
      try {
        const sessionDoc = doc(db, 'sessions', sessionId);
        await updateDoc(sessionDoc, {
          violationCount: violation.count || 1,
          lastViolationAt: new Date().toISOString()
        });
      } catch (error) {
        console.error('Violation was saved, but the session violation counter could not be updated:', error);
      }
    } catch (err) {
      console.error('Failed to save violation evidence to Firebase:', err);
      throw err;
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
