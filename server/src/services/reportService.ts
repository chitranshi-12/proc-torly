import { Exam } from '../models/Exam.js';
import { Attempt } from '../models/Attempt.js';
import { isDBConnected } from '../config/db.js';
import { memoryStore } from './memoryStore.js';
import { examService } from './examService.js';
import { ENV } from '../config/env.js';

export const reportService = {
  async getExamResults(examId: string): Promise<{
    exam: any;
    stats: {
      totalCandidates: number;
      completedAttempts: number;
      pendingSubmissions: number;
      averageScore: number;
      highestScore: number;
      lowestScore: number;
      totalMarks: number;
    };
    results: any[];
  }> {
    const exam = await examService.getExamById(examId);
    if (!exam) throw new Error('Exam not found.');

    let attempts: any[] = [];
    if (isDBConnected()) {
      try {
        attempts = await Attempt.find({ examId }).sort({ score: -1 });
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    } else {
      attempts = Array.from(memoryStore.attempts.values())
        .filter((a) => a.examId === examId)
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    const totalCandidates = attempts.length;
    const completedAttempts = attempts.filter((a) => a.status === 'submitted' || a.status === 'terminated').length;
    const pendingSubmissions = totalCandidates - completedAttempts;

    const scores = attempts
      .filter((a) => typeof a.score === 'number' && a.status === 'submitted')
      .map((a) => a.score as number);

    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

    const totalExamMarks = (exam.questions || []).reduce((acc: number, q: any) => acc + (Number(q.marks) || 1), 0);

    const results = attempts.map((a) => ({
      id: String(a._id),
      rollNo: a.rollNo,
      studentName: a.studentName,
      studentEmail: a.studentEmail || '',
      status: a.status,
      score: a.score ?? 0,
      totalMarks: a.totalMarks ?? totalExamMarks,
      percentage: totalExamMarks > 0 ? Math.round(((a.score || 0) / totalExamMarks) * 100) : 0,
      riskScore: a.riskScore || 0,
      submittedAt: a.submittedAt ? (a.submittedAt.toISOString ? a.submittedAt.toISOString() : String(a.submittedAt)) : null
    }));

    return {
      exam: {
        id: String(exam._id || exam.id),
        title: exam.title,
        examCode: exam.examCode,
        duration: exam.duration,
        questionCount: (exam.questions || []).length,
        totalMarks: totalExamMarks
      },
      stats: {
        totalCandidates,
        completedAttempts,
        pendingSubmissions,
        averageScore,
        highestScore,
        lowestScore,
        totalMarks: totalExamMarks
      },
      results
    };
  },

  async generateCSV(examId: string): Promise<string> {
    const data = await this.getExamResults(examId);

    const headers = ['Roll No', 'Student Name', 'Email', 'Status', 'Score', 'Total Marks', 'Percentage', 'Risk Score', 'Submitted At'];
    const rows = data.results.map((r) => [
      `"${r.rollNo}"`,
      `"${r.studentName.replace(/"/g, '""')}"`,
      `"${r.studentEmail}"`,
      `"${r.status}"`,
      r.score,
      r.totalMarks,
      `${r.percentage}%`,
      r.riskScore,
      `"${r.submittedAt || 'N/A'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    return csvContent;
  }
};
