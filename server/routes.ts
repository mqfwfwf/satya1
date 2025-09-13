import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { analysisService } from "./services/analysis.js";
import { authService } from "./services/auth";
import { authenticateToken, optionalAuth, rateLimitAuth, extractUserId } from "./middleware/auth";
import { analysisRequestSchema, insertQuizAttemptSchema, insertGameAttemptSchema, insertUserSchema, type MiniGame } from "@shared/schema";

// Helper functions for mini-games
async function evaluateGameAnswer(miniGame: MiniGame, userAnswer: any): Promise<boolean> {
  const correctAnswer = miniGame.correctAnswer as any;
  
  switch (miniGame.gameType) {
    case "spot-the-fake":
      return userAnswer.selectedIndex === correctAnswer?.fakeArticleIndex;
      
    case "source-detective":
      return userAnswer.credibilityScore === correctAnswer?.credibilityScore;
      
    case "image-truth":
      return userAnswer.isManipulated === correctAnswer?.isManipulated;
      
    case "quiz-challenge":
      return userAnswer.selectedOption === correctAnswer?.correctOption;
      
    default:
      return false;
  }
}

function calculateGameScore(miniGame: MiniGame, userAnswer: any, isCorrect: boolean, timeSpent?: number): number {
  let baseScore = isCorrect ? 100 : 0;
  
  // Apply time bonus (faster = higher score)
  if (isCorrect && timeSpent) {
    const timeBonus = Math.max(0, 50 - Math.floor(timeSpent / 2)); // Max 50 bonus, decreases with time
    baseScore += timeBonus;
  }
  
  // Apply difficulty multiplier
  switch (miniGame.difficulty) {
    case "easy":
      baseScore = Math.round(baseScore * 1.0);
      break;
    case "medium":
      baseScore = Math.round(baseScore * 1.2);
      break;
    case "hard":
      baseScore = Math.round(baseScore * 1.5);
      break;
  }
  
  return Math.min(150, Math.max(0, baseScore)); // Cap between 0-150
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ========================================
  // AUTHENTICATION ENDPOINTS
  // ========================================
  
  // Register new user
  app.post("/api/auth/register", rateLimitAuth(3, 15 * 60 * 1000), async (req, res) => {
    try {
      const { username, password, confirmPassword } = req.body;
      
      if (!username || !password || !confirmPassword) {
        return res.status(400).json({ 
          error: "All fields are required",
          code: "MISSING_FIELDS"
        });
      }

      const result = await authService.register({ username, password, confirmPassword });
      
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: result.user,
        tokens: result.tokens
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Registration failed",
        code: "REGISTRATION_FAILED"
      });
    }
  });

  // Login user
  app.post("/api/auth/login", rateLimitAuth(5, 15 * 60 * 1000), async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ 
          error: "Username and password are required",
          code: "MISSING_CREDENTIALS"
        });
      }

      const result = await authService.login({ username, password });
      
      res.json({
        success: true,
        message: "Login successful",
        user: result.user,
        tokens: result.tokens
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({ 
        error: error instanceof Error ? error.message : "Login failed",
        code: "LOGIN_FAILED"
      });
    }
  });

  // Get current user profile
  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      res.json({
        success: true,
        user: req.user
      });
    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ 
        error: "Failed to fetch user profile",
        code: "PROFILE_FETCH_FAILED"
      });
    }
  });

  // Change password
  app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
    try {
      const { oldPassword, newPassword, confirmPassword } = req.body;
      
      if (!oldPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ 
          error: "All fields are required",
          code: "MISSING_FIELDS"
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ 
          error: "New passwords do not match",
          code: "PASSWORD_MISMATCH"
        });
      }

      await authService.changePassword(req.userId!, oldPassword, newPassword);
      
      res.json({
        success: true,
        message: "Password changed successfully"
      });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Password change failed",
        code: "PASSWORD_CHANGE_FAILED"
      });
    }
  });

  // Logout (client-side token removal, but we can log it)
  app.post("/api/auth/logout", authenticateToken, async (req, res) => {
    try {
      // In a production app, you might want to blacklist the token
      console.log(`User ${req.user?.username} logged out`);
      
      res.json({
        success: true,
        message: "Logged out successfully"
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ 
        error: "Logout failed",
        code: "LOGOUT_FAILED"
      });
    }
  });

  // ========================================
  // CONTENT ANALYSIS ENDPOINTS
  // ========================================
  
  // Content Analysis Endpoint (with optional auth)
  app.post("/api/analyze", optionalAuth, async (req, res) => {
    try {
      const request = analysisRequestSchema.parse(req.body);
      const result = await analysisService.analyzeContent(request);
      res.json(result);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ 
        error: "Analysis failed", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Dashboard Stats Endpoint
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Quizzes Endpoint
  app.get("/api/quizzes", async (req, res) => {
    try {
      const language = req.query.lang as string || "en";
      const quizzes = await storage.getActiveQuizzes(language);
      res.json(quizzes);
    } catch (error) {
      console.error("Quizzes fetch error:", error);
      res.status(500).json({ error: "Failed to fetch quizzes" });
    }
  });

  // Submit Quiz Answer
  app.post("/api/quizzes/:quizId/submit", async (req, res) => {
    try {
      const { quizId } = req.params;
      const { selectedAnswer } = z.object({ selectedAnswer: z.number() }).parse(req.body);
      
      const quiz = await storage.getQuizById(quizId);
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      const isCorrect = selectedAnswer === quiz.correctAnswer;
      const xpEarned = isCorrect ? 50 : 10;

      // Save attempt (if user system is implemented)
      const attempt = {
        quizId,
        selectedAnswer,
        isCorrect,
        xpEarned,
      };

      await storage.saveQuizAttempt(attempt);

      res.json({
        isCorrect,
        xpEarned,
        explanation: quiz.explanation,
        correctAnswer: quiz.correctAnswer,
      });
    } catch (error) {
      console.error("Quiz submission error:", error);
      res.status(500).json({ error: "Failed to submit quiz answer" });
    }
  });

  // Mini-Games Endpoints
  
  // Get Active Mini-Games
  app.get("/api/mini-games", async (req, res) => {
    try {
      const gameType = req.query.type as string;
      const language = req.query.lang as string || "en";
      const miniGames = await storage.getActiveMiniGames(gameType, language);
      res.json(miniGames);
    } catch (error) {
      console.error("Mini-games fetch error:", error);
      res.status(500).json({ error: "Failed to fetch mini-games" });
    }
  });

  // Get Specific Mini-Game
  app.get("/api/mini-games/:gameId", async (req, res) => {
    try {
      const { gameId } = req.params;
      const miniGame = await storage.getMiniGameById(gameId);
      
      if (!miniGame) {
        return res.status(404).json({ error: "Mini-game not found" });
      }

      res.json(miniGame);
    } catch (error) {
      console.error("Mini-game fetch error:", error);
      res.status(500).json({ error: "Failed to fetch mini-game" });
    }
  });

  // Submit Game Attempt
  app.post("/api/mini-games/:gameId/submit", async (req, res) => {
    try {
      const { gameId } = req.params;
      const { userAnswer, timeSpent } = z.object({ 
        userAnswer: z.any(),
        timeSpent: z.number().optional()
      }).parse(req.body);
      
      const miniGame = await storage.getMiniGameById(gameId);
      if (!miniGame) {
        return res.status(404).json({ error: "Mini-game not found" });
      }

      // Calculate if answer is correct and score
      const isCorrect = await evaluateGameAnswer(miniGame, userAnswer);
      const score = calculateGameScore(miniGame, userAnswer, isCorrect, timeSpent);
      const baseXp = miniGame.xpReward || 10;
      const xpEarned = isCorrect ? baseXp : Math.round(baseXp * 0.3);

      // Save attempt
      const attempt = {
        gameId,
        userAnswer,
        isCorrect,
        score,
        timeSpent,
        xpEarned,
      };

      await storage.saveGameAttempt(attempt);

      // Update user progress (simplified - would use actual user ID in full implementation)
      try {
        const userId = "demo-user"; // In real app, get from session/auth
        const currentProgress = await storage.getUserProgress(userId, miniGame.gameType);
        const progress = currentProgress[0] || {
          level: 1,
          totalXp: 0,
          gamesPlayed: 0,
          gamesWon: 0,
          averageScore: 0,
          streak: 0,
        };

        const currentGamesPlayed = progress.gamesPlayed || 0;
        const currentGamesWon = progress.gamesWon || 0;
        const currentTotalXp = progress.totalXp || 0;
        const currentAverageScore = progress.averageScore || 0;
        const currentStreak = progress.streak || 0;
        
        const newGamesPlayed = currentGamesPlayed + 1;
        const newGamesWon = currentGamesWon + (isCorrect ? 1 : 0);
        const newTotalXp = currentTotalXp + (xpEarned || 0);
        const newAverageScore = Math.round(((currentAverageScore * currentGamesPlayed) + score) / newGamesPlayed);
        const newStreak = isCorrect ? currentStreak + 1 : 0;
        const newLevel = Math.floor(newTotalXp / 100) + 1;

        await storage.updateUserProgress(userId, miniGame.gameType, {
          level: newLevel,
          totalXp: newTotalXp,
          gamesPlayed: newGamesPlayed,
          gamesWon: newGamesWon,
          averageScore: newAverageScore,
          streak: newStreak,
        });
      } catch (progressError) {
        console.error("Progress update error:", progressError);
        // Continue without failing the response
      }

      res.json({
        isCorrect,
        score,
        xpEarned,
        explanation: miniGame.explanation,
        correctAnswer: miniGame.correctAnswer,
      });
    } catch (error) {
      console.error("Game submission error:", error);
      res.status(500).json({ error: "Failed to submit game attempt" });
    }
  });

  // Get User Progress
  app.get("/api/mini-games/progress/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const gameType = req.query.type as string;
      const progress = await storage.getUserProgress(userId, gameType);
      res.json(progress);
    } catch (error) {
      console.error("User progress fetch error:", error);
      res.status(500).json({ error: "Failed to fetch user progress" });
    }
  });

  // Get Leaderboard
  app.get("/api/mini-games/leaderboard", async (req, res) => {
    try {
      const gameType = req.query.type as string;
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = await storage.getLeaderboard(gameType, limit);
      res.json(leaderboard);
    } catch (error) {
      console.error("Leaderboard fetch error:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // Save Report
  app.post("/api/reports", async (req, res) => {
    try {
      const reportData = req.body;
      await storage.saveReportCard(reportData);
      res.json({ success: true });
    } catch (error) {
      console.error("Save report error:", error);
      res.status(500).json({ error: "Failed to save report" });
    }
  });

  // Get Recent Reports
  app.get("/api/reports/recent", async (req, res) => {
    try {
      const reports = await storage.getRecentReports();
      res.json(reports);
    } catch (error) {
      console.error("Recent reports error:", error);
      res.status(500).json({ error: "Failed to fetch recent reports" });
    }
  });

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      version: "1.0.0" 
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
