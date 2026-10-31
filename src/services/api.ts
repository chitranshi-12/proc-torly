/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OmniProctor Frontend API Client
 */

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('omni_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('omni_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('omni_token');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (credentials: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  register: (payload: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request<any>('/auth/me'),

  // Exams
  getExams: () => request<any>('/exams'),
  getExam: (id: string) => request<any>(`/exams/${id}`),
  createExam: (data: any) => request<any>('/exams', { method: 'POST', body: JSON.stringify(data) }),
  deleteExam: (id: string) => request<any>(`/exams/${id}`, { method: 'DELETE' }),

  // Questions
  addQuestion: (examId: string, q: any) => request<any>(`/exams/${examId}/questions`, { method: 'POST', body: JSON.stringify(q) }),
  importCsvQuestions: (examId: string, csvText: string) =>
    request<any>(`/exams/${examId}/questions/csv`, { method: 'POST', body: JSON.stringify({ csvText }) }),
  importGoogleFormQuestions: (examId: string, questions: any[]) =>
    request<any>(`/exams/${examId}/questions/google-form`, { method: 'POST', body: JSON.stringify({ questions }) }),
  deleteQuestion: (id: string) => request<any>(`/questions/${id}`, { method: 'DELETE' }),

  // Student Flow
  verifyCode: (code: string) => request<any>('/student/verify-code', { method: 'POST', body: JSON.stringify({ code }) }),
  registerSession: (payload: any) => request<any>('/student/register-session', { method: 'POST', body: JSON.stringify(payload) }),
  getSession: (sessionId: string) => request<any>(`/student/session/${sessionId}`),
  startExam: (sessionId: string) => request<any>(`/student/session/${sessionId}/start`, { method: 'POST' }),
  autosaveAnswers: (sessionId: string, answers: any) =>
    request<any>(`/student/session/${sessionId}/autosave`, { method: 'POST', body: JSON.stringify({ answers }) }),
  submitExam: (sessionId: string, payload: any) =>
    request<any>(`/student/session/${sessionId}/submit`, { method: 'POST', body: JSON.stringify(payload) }),
  reportViolation: (payload: any) =>
    request<any>('/student/violation', { method: 'POST', body: JSON.stringify(payload) }),
  sendSnapshot: (payload: any) =>
    request<any>('/student/snapshot', { method: 'POST', body: JSON.stringify(payload) }),

  // Proctor & Reports
  getExamDashboard: (examId: string) => request<any>(`/exams/${examId}/dashboard`),
  getSessionReport: (examId: string, sessionId: string) => request<any>(`/exams/${examId}/reports/${sessionId}`),
  cleanupRecordings: () => request<any>('/admin/cleanup', { method: 'POST' })
};
