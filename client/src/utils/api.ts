import { AnalysisRequest, AnalysisResult } from "@shared/schema";
import { backgroundSync } from "./background-sync";

const API_BASE = "/api";

export class ApiClient {
  async analyzeContent(request: AnalysisRequest): Promise<AnalysisResult> {
    const url = `${API_BASE}/analyze`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    };

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Analysis failed: ${error}`);
      }

      return response.json();
    } catch (error) {
      // If request fails and we're offline, queue it for background sync
      if (!navigator.onLine) {
        await backgroundSync.queueRequest(url, options);
        throw new Error("Request queued for when you're back online");
      }
      throw error;
    }
  }

  async getDashboardStats(): Promise<{
    articlesVerified: number;
    misleadingDetected: number;
    xpEarned: number;
    hotspots: Array<{ state: string; riskLevel: "high" | "medium" | "low"; count: number }>;
  }> {
    const response = await fetch(`${API_BASE}/dashboard/stats`);
    
    if (!response.ok) {
      throw new Error("Failed to fetch dashboard stats");
    }

    return response.json();
  }

  async getQuizzes(language: string = "en"): Promise<Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }>> {
    const response = await fetch(`${API_BASE}/quizzes?lang=${language}`);
    
    if (!response.ok) {
      throw new Error("Failed to fetch quizzes");
    }

    return response.json();
  }

  async submitQuizAnswer(quizId: string, selectedAnswer: number): Promise<{
    isCorrect: boolean;
    xpEarned: number;
    explanation: string;
  }> {
    const response = await fetch(`${API_BASE}/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ selectedAnswer }),
    });

    if (!response.ok) {
      throw new Error("Failed to submit quiz answer");
    }

    return response.json();
  }

  async saveReport(reportData: any): Promise<void> {
    const url = `${API_BASE}/reports`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reportData),
    };

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error("Failed to save report");
      }
    } catch (error) {
      // If request fails and we're offline, queue it for background sync
      if (!navigator.onLine) {
        await backgroundSync.queueRequest(url, options);
        console.log("Report queued for background sync");
        return; // Don't throw error for queued requests
      }
      throw error;
    }
  }
}

export const apiClient = new ApiClient();
