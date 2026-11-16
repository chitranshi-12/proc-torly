/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * exam.co Unified API Client
 */

import { auth } from './firebase';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function getAuthToken(): string | null {
  return localStorage.getItem('examco_token') || localStorage.getItem('omni_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('examco_token', token);
  localStorage.setItem('omni_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('examco_token');
  localStorage.removeItem('omni_token');
}

export function getStudentSessionToken(): string | null {
  const token = localStorage.getItem('examco_student_token') || localStorage.getItem('examco_student_session');
  if (!token) return null;
  if (token.startsWith('{')) {
    try {
      const parsed = JSON.parse(token);
      return parsed.sessionToken || parsed.token || null;
    } catch {
      return null;
    }
  }
  return token;
}

export function setStudentSessionToken(token: string | any) {
  if (!token) return;
  if (typeof token === 'object') {
    const rawSecret = token.sessionToken || token.token || '';
    if (rawSecret) {
      localStorage.setItem('examco_student_token', rawSecret);
    }
  } else if (typeof token === 'string') {
    const trimmed = token.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const rawSecret = parsed.sessionToken || parsed.token || '';
        if (rawSecret) {
          localStorage.setItem('examco_student_token', rawSecret);
          return;
        }
      } catch {}
    }
    localStorage.setItem('examco_student_token', trimmed);
  }
}

export function removeStudentSessionToken() {
  localStorage.removeItem('examco_student_token');
  localStorage.removeItem('examco_student_session');
  localStorage.removeItem('examco_student_data');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let token = getAuthToken();

  // If Firebase has an active user, prefer its current fresh token for teacher calls
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
      if (token) setAuthToken(token);
    } catch {
      // Fall back to stored token
    }
  }

  const studentToken = getStudentSessionToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  // Strict credential separation: Never cross-attach student and teacher tokens
  const isTeacherRoute = endpoint.startsWith('/exams') || endpoint.startsWith('/auth');
  const isTeacherResetRoute = endpoint.includes('/reset-session');
  const isEligibilityRoute = endpoint.includes('/eligibility');
  const isStudentRoute =
    endpoint.startsWith('/student') ||
    (endpoint.startsWith('/attempts') && !isTeacherResetRoute) ||
    endpoint === '/incidents';

  if (token && (isTeacherRoute || isTeacherResetRoute || (isEligibilityRoute && !studentToken))) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (studentToken && isStudentRoute) {
    headers['x-student-session'] = studentToken;
  }

  const url = `${API_BASE}/api${endpoint}`;

  let res: Response;
  const controller = new AbortController();
  // Support Render Free cold start (spinning up idle service can take up to 45-60s)
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Server request timed out. Free-tier cloud backend may be waking up; please retry in a few seconds.');
    }
    throw new Error('Server connection failed. Please retry.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {
      errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }

  // Handle CSV/text downloads
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  // ── Auth ──
  getMe: () => request<{ user: any }>('/auth/me'),
  verifyAuth: () => request<{ success: boolean; user: any }>('/auth/verify', { method: 'POST' }),

  // ── Teacher Examinations ──
  listExams: () => request<{ exams: any[] }>('/exams'),
  createExam: (data: any) => request<{ exam: any }>('/exams', { method: 'POST', body: JSON.stringify(data) }),
  getExam: (id: string) => request<{ exam: any }>(`/exams/${encodeURIComponent(id)}`),
  updateExam: (id: string, data: any) =>
    request<{ exam: any }>(`/exams/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExam: (id: string) =>
    request<{ success: boolean }>(`/exams/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  publishExam: (id: string) =>
    request<{ exam: any }>(`/exams/${encodeURIComponent(id)}/publish`, { method: 'POST' }),

  // ── Monitoring & Reports ──
  getExamMonitoring: (examId: string) =>
    request<{
      candidates: any[];
      totalRegistered: number;
      activeCount: number;
      submittedCount: number;
      incidentCount: number;
      incidents?: any[];
    }>(`/exams/${encodeURIComponent(examId)}/monitor`),

  getExamResults: (examId: string) =>
    request<{
      exam: any;
      stats: any;
      results: any[];
    }>(`/exams/${encodeURIComponent(examId)}/results`),

  getExportCSVUrl: (examId: string) => `${API_BASE}/api/exams/${encodeURIComponent(examId)}/export`,

  // ── Student Flow ──
  getPublicExamByCode: (code: string) =>
    request<{ exam: any }>(`/student/exams/${encodeURIComponent(code)}`),

  joinExam: (data: {
    examCode: string;
    studentName: string;
    rollNo: string;
    studentEmail?: string;
    institute?: string;
  }) =>
    request<{
      success: boolean;
      attemptId: string;
      studentId: string;
      sessionId: string;
      sessionToken: string;
      exam: any;
      isResuming: boolean;
    }>('/student/join', { method: 'POST', body: JSON.stringify(data) }),

  getAttempt: (attemptId: string) =>
    request<{ attempt: any; exam: any }>(`/attempts/${encodeURIComponent(attemptId)}`),

  getStartEligibility: (attemptId: string) =>
    request<{
      canStart: boolean;
      reason?: string;
      code?: string;
      serverTime: string;
      startTime?: string;
      endTime?: string;
      allowEarlyStart: boolean;
      timeLeftMs: number;
      attemptStatus: string;
      examStatus: string;
      isAuthorized: boolean;
    }>(`/attempts/${encodeURIComponent(attemptId)}/eligibility`),

  submitStudentEvidence: (
    attemptId: string,
    data: { consentAgreed: boolean; consentVersion?: string; referencePhoto?: string }
  ) =>
    request<{
      success: boolean;
      consentTimestamp: string;
      photoUploadStatus: string;
      consentVersion: string;
    }>(`/attempts/${encodeURIComponent(attemptId)}/evidence`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  startExam: (attemptId: string) =>
    request<{ status: string; startedAt: string; expiresAt: string }>(
      `/attempts/${encodeURIComponent(attemptId)}/start`,
      { method: 'POST' }
    ),

  saveAnswers: (
    attemptId: string,
    answers: Record<string, any>,
    markedForReview?: Record<string, boolean>
  ) =>
    request<{ savedAt: string; answeredCount: number }>(
      `/attempts/${encodeURIComponent(attemptId)}/answers`,
      {
        method: 'PUT',
        body: JSON.stringify({ answers, markedForReview })
      }
    ),

  submitExam: (
    attemptId: string,
    payload: {
      answers?: Record<string, any>;
      terminated?: boolean;
      terminationReason?: string;
      terminationSource?: string;
      gradingOutcome?: string;
    }
  ) =>
    request<{
      score: number;
      totalMarks: number;
      riskScore: number;
      incidentCount?: number;
      status: string;
      terminationReason?: string;
      terminationSource?: string;
      terminatedAt?: string;
      reviewStatus?: string;
      gradingOutcome?: string;
      submittedAt: string;
      incidents?: any[];
    }>(`/attempts/${encodeURIComponent(attemptId)}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  terminateExam: (
    attemptId: string,
    payload: {
      reason?: string;
      source?: 'invigilator' | 'automated_rule' | 'system';
      gradingOutcome?: 'evaluated' | 'withheld' | 'invalidated';
      examId?: string;
    }
  ) =>
    request<{
      score: number;
      totalMarks: number;
      riskScore: number;
      incidentCount?: number;
      status: string;
      terminationReason?: string;
      terminationSource?: string;
      terminatedAt?: string;
      reviewStatus: string;
      gradingOutcome: string;
      submittedAt: string;
      incidents?: any[];
    }>(`/attempts/${encodeURIComponent(attemptId)}/terminate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  recordIncident: (data: {
    examId: string;
    attemptId: string;
    studentId: string;
    studentName?: string;
    incidentType: string;
    severity?: string;
    metadata?: any;
  }) => request<{ incident: any }>('/incidents', { method: 'POST', body: JSON.stringify(data) })
};
