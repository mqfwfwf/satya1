import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { 
  users, reportCards, quizzes, userQuizAttempts, miniGames, gameAttempts, userProgress,
  misinformationCache, mediaFiles, ocrResults, deepfakeAnalysis, reverseImageResults,
  type User, type InsertUser, type ReportCard, type Quiz, type QuizAttempt,
  type InsertReportCard, type InsertQuizAttempt, type MiniGame, type InsertMiniGame,
  type GameAttempt, type InsertGameAttempt, type UserProgress, type InsertUserProgress,
  type MisinformationCache, type MediaFile, type InsertMediaFile, type OcrResult, 
  type InsertOcrResult, type DeepfakeAnalysis, type InsertDeepfakeAnalysis, 
  type ReverseImageResult, type InsertReverseImageResult
} from "@shared/schema";
import { eq, desc, count, and, gte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<User>;

  // Report management
  saveReportCard(report: any): Promise<ReportCard>;
  getRecentReports(limit?: number): Promise<ReportCard[]>;
  getUserReports(userId?: string): Promise<ReportCard[]>;

  // Quiz management
  getActiveQuizzes(language: string): Promise<Quiz[]>;
  getQuizById(id: string): Promise<Quiz | undefined>;
  saveQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt>;

  // Mini-games management
  getActiveMiniGames(gameType?: string, language?: string): Promise<MiniGame[]>;
  getMiniGameById(id: string): Promise<MiniGame | undefined>;
  saveGameAttempt(attempt: InsertGameAttempt & { userId?: string }): Promise<GameAttempt>;
  getUserProgress(userId: string, gameType?: string): Promise<UserProgress[]>;
  updateUserProgress(userId: string, gameType: string, progressUpdate: Partial<InsertUserProgress>): Promise<UserProgress>;
  getLeaderboard(gameType?: string, limit?: number): Promise<Array<{ userId: string; username: string; totalXp: number; level: number }>>;

  // Dashboard stats
  getDashboardStats(): Promise<{
    articlesVerified: number;
    misleadingDetected: number;
    xpEarned: number;
    hotspots: Array<{ state: string; riskLevel: "high" | "medium" | "low"; count: number }>;
  }>;

  // Cache management
  getCachedResult(contentHash: string): Promise<MisinformationCache | undefined>;
  saveCachedResult(contentHash: string, result: any): Promise<void>;

  // Media file management
  saveMediaFile(mediaFile: InsertMediaFile & { userId?: string; reportCardId?: string }): Promise<MediaFile>;
  getMediaFile(id: string): Promise<MediaFile | undefined>;
  getMediaFilesByReportCard(reportCardId: string): Promise<MediaFile[]>;

  // OCR results
  saveOcrResult(ocrResult: InsertOcrResult): Promise<OcrResult>;
  getOcrResultsByMediaFile(mediaFileId: string): Promise<OcrResult[]>;

  // Deepfake analysis
  saveDeepfakeAnalysis(analysis: InsertDeepfakeAnalysis): Promise<DeepfakeAnalysis>;
  getDeepfakeAnalysisByMediaFile(mediaFileId: string): Promise<DeepfakeAnalysis | undefined>;

  // Reverse image search
  saveReverseImageResult(result: InsertReverseImageResult): Promise<ReverseImageResult>;
  getReverseImageResultByMediaFile(mediaFileId: string): Promise<ReverseImageResult | undefined>;
}

class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    this.db = drizzle(pool);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<User> {
    const result = await this.db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }

  async saveReportCard(reportData: any): Promise<ReportCard> {
    const reportCard: InsertReportCard = {
      contentUrl: reportData.contentUrl || null,
      contentText: reportData.contentText || null,
      score: reportData.score || 0,
      status: reportData.status || "Unknown",
      summary: reportData.summary || "",
      details: reportData.details || [],
      claims: reportData.claims || [],
      verificationResults: reportData.verificationResults || [],
    };

    const result = await this.db.insert(reportCards).values(reportCard).returning();
    return result[0];
  }

  async getRecentReports(limit: number = 10): Promise<ReportCard[]> {
    return await this.db
      .select()
      .from(reportCards)
      .orderBy(desc(reportCards.createdAt))
      .limit(limit);
  }

  async getUserReports(userId?: string): Promise<ReportCard[]> {
    if (!userId) {
      return await this.getRecentReports();
    }

    return await this.db
      .select()
      .from(reportCards)
      .where(eq(reportCards.userId, userId))
      .orderBy(desc(reportCards.createdAt));
  }

  async getActiveQuizzes(language: string): Promise<Quiz[]> {
    return await this.db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.language, language), eq(quizzes.active, true)))
      .limit(10);
  }

  async getQuizById(id: string): Promise<Quiz | undefined> {
    const result = await this.db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
    return result[0];
  }

  async saveQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt> {
    const result = await this.db.insert(userQuizAttempts).values(attempt).returning();
    return result[0];
  }

  async getDashboardStats(): Promise<{
    articlesVerified: number;
    misleadingDetected: number;
    xpEarned: number;
    hotspots: Array<{ state: string; riskLevel: "high" | "medium" | "low"; count: number }>;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Count articles verified in last 30 days
    const articlesResult = await this.db
      .select({ count: count() })
      .from(reportCards)
      .where(gte(reportCards.createdAt, thirtyDaysAgo));

    // Count misleading articles in last 30 days
    const misleadingResult = await this.db
      .select({ count: count() })
      .from(reportCards)
      .where(and(
        gte(reportCards.createdAt, thirtyDaysAgo),
        eq(reportCards.status, "Misleading") || eq(reportCards.status, "Extremely Misleading")
      ));

    // Sum XP earned (simplified - would need user sessions in real implementation)
    const xpResult = await this.db
      .select({ total: count() })
      .from(userQuizAttempts)
      .where(gte(userQuizAttempts.completedAt, thirtyDaysAgo));

    // Mock hotspots data (would come from real geolocation analysis)
    const hotspots = [
      { state: "Maharashtra", riskLevel: "high" as const, count: 45 },
      { state: "Delhi", riskLevel: "medium" as const, count: 23 },
      { state: "Karnataka", riskLevel: "low" as const, count: 12 },
      { state: "West Bengal", riskLevel: "high" as const, count: 38 },
      { state: "Tamil Nadu", riskLevel: "medium" as const, count: 19 },
    ];

    return {
      articlesVerified: articlesResult[0]?.count || 0,
      misleadingDetected: misleadingResult[0]?.count || 0,
      xpEarned: (xpResult[0]?.total || 0) * 50, // Assume 50 XP per correct answer
      hotspots,
    };
  }

  async getCachedResult(contentHash: string): Promise<MisinformationCache | undefined> {
    const result = await this.db
      .select()
      .from(misinformationCache)
      .where(eq(misinformationCache.contentHash, contentHash))
      .limit(1);

    const cached = result[0];
    if (cached && cached.expiresAt && cached.expiresAt < new Date()) {
      // Remove expired cache
      await this.db.delete(misinformationCache).where(eq(misinformationCache.id, cached.id));
      return undefined;
    }

    return cached;
  }

  async saveCachedResult(contentHash: string, result: any): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Cache for 24 hours

    await this.db.insert(misinformationCache).values({
      contentHash,
      embedding: JSON.stringify(result.embedding || []),
      metadata: result,
      score: result.score || 0,
      status: result.status || "Unknown",
      summary: result.summary || "",
      details: result.details || [],
      expiresAt,
    });
  }

  // Media file management
  async saveMediaFile(mediaFileData: InsertMediaFile & { userId?: string; reportCardId?: string }): Promise<MediaFile> {
    const result = await this.db.insert(mediaFiles).values({
      userId: mediaFileData.userId,
      reportCardId: mediaFileData.reportCardId,
      fileName: mediaFileData.fileName,
      fileType: mediaFileData.fileType,
      fileSize: mediaFileData.fileSize,
      filePath: mediaFileData.filePath,
      mimeType: mediaFileData.mimeType,
      contentHash: mediaFileData.contentHash,
      metadata: mediaFileData.metadata,
    }).returning();
    return result[0];
  }

  async getMediaFile(id: string): Promise<MediaFile | undefined> {
    const result = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
    return result[0];
  }

  async getMediaFilesByReportCard(reportCardId: string): Promise<MediaFile[]> {
    return await this.db.select().from(mediaFiles).where(eq(mediaFiles.reportCardId, reportCardId));
  }

  // OCR results
  async saveOcrResult(ocrResult: InsertOcrResult): Promise<OcrResult> {
    const result = await this.db.insert(ocrResults).values(ocrResult).returning();
    return result[0];
  }

  async getOcrResultsByMediaFile(mediaFileId: string): Promise<OcrResult[]> {
    return await this.db.select().from(ocrResults).where(eq(ocrResults.mediaFileId, mediaFileId));
  }

  // Deepfake analysis
  async saveDeepfakeAnalysis(analysis: InsertDeepfakeAnalysis): Promise<DeepfakeAnalysis> {
    const result = await this.db.insert(deepfakeAnalysis).values(analysis).returning();
    return result[0];
  }

  async getDeepfakeAnalysisByMediaFile(mediaFileId: string): Promise<DeepfakeAnalysis | undefined> {
    const result = await this.db.select().from(deepfakeAnalysis).where(eq(deepfakeAnalysis.mediaFileId, mediaFileId)).limit(1);
    return result[0];
  }

  // Reverse image search
  async saveReverseImageResult(resultData: InsertReverseImageResult): Promise<ReverseImageResult> {
    const result = await this.db.insert(reverseImageResults).values(resultData).returning();
    return result[0];
  }

  async getReverseImageResultByMediaFile(mediaFileId: string): Promise<ReverseImageResult | undefined> {
    const result = await this.db.select().from(reverseImageResults).where(eq(reverseImageResults.mediaFileId, mediaFileId)).limit(1);
    return result[0];
  }

  // Mini-games management
  async getActiveMiniGames(gameType?: string, language: string = "en"): Promise<MiniGame[]> {
    let conditions = [eq(miniGames.active, true), eq(miniGames.language, language)];
    
    if (gameType) {
      conditions.push(eq(miniGames.gameType, gameType));
    }
    
    return await this.db.select()
      .from(miniGames)
      .where(and(...conditions))
      .limit(20);
  }

  async getMiniGameById(id: string): Promise<MiniGame | undefined> {
    const result = await this.db.select().from(miniGames).where(eq(miniGames.id, id)).limit(1);
    return result[0];
  }

  async saveGameAttempt(attemptData: InsertGameAttempt & { userId?: string }): Promise<GameAttempt> {
    const result = await this.db.insert(gameAttempts).values({
      userId: attemptData.userId,
      gameId: attemptData.gameId,
      userAnswer: attemptData.userAnswer,
      isCorrect: attemptData.isCorrect,
      score: attemptData.score,
      timeSpent: attemptData.timeSpent,
      xpEarned: attemptData.xpEarned,
    }).returning();
    return result[0];
  }

  async getUserProgress(userId: string, gameType?: string): Promise<UserProgress[]> {
    let conditions = [eq(userProgress.userId, userId)];
    
    if (gameType) {
      conditions.push(eq(userProgress.gameType, gameType));
    }
    
    return await this.db.select()
      .from(userProgress)
      .where(and(...conditions));
  }

  async updateUserProgress(userId: string, gameType: string, progressUpdate: Partial<InsertUserProgress>): Promise<UserProgress> {
    // First try to get existing progress
    const existing = await this.db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.gameType, gameType)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing progress
      const result = await this.db
        .update(userProgress)
        .set({
          ...progressUpdate,
          lastPlayedAt: new Date(),
        })
        .where(and(eq(userProgress.userId, userId), eq(userProgress.gameType, gameType)))
        .returning();
      return result[0];
    } else {
      // Create new progress entry
      const result = await this.db.insert(userProgress).values({
        userId,
        gameType,
        level: progressUpdate.level || 1,
        totalXp: progressUpdate.totalXp || 0,
        gamesPlayed: progressUpdate.gamesPlayed || 0,
        gamesWon: progressUpdate.gamesWon || 0,
        averageScore: progressUpdate.averageScore || 0,
        streak: progressUpdate.streak || 0,
      }).returning();
      return result[0];
    }
  }

  async getLeaderboard(gameType?: string, limit: number = 10): Promise<Array<{ userId: string; username: string; totalXp: number; level: number }>> {
    const baseQuery = this.db
      .select({
        userId: userProgress.userId,
        username: users.username,
        totalXp: userProgress.totalXp,
        level: userProgress.level,
      })
      .from(userProgress)
      .innerJoin(users, eq(userProgress.userId, users.id));

    if (gameType) {
      const result = await baseQuery
        .where(eq(userProgress.gameType, gameType))
        .orderBy(desc(userProgress.totalXp))
        .limit(limit);
      
      return result.map(row => ({
        userId: row.userId || "",
        username: row.username,
        totalXp: row.totalXp || 0,
        level: row.level || 0
      }));
    }

    const result = await baseQuery
      .orderBy(desc(userProgress.totalXp))
      .limit(limit);
      
    return result.map(row => ({
      userId: row.userId || "",
      username: row.username,
      totalXp: row.totalXp || 0,
      level: row.level || 0
    }));
  }
}

class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private reportCards: Map<string, ReportCard> = new Map();
  private quizzes: Map<string, Quiz> = new Map();
  private quizAttempts: Map<string, QuizAttempt> = new Map();
  private miniGamesMap: Map<string, MiniGame> = new Map();
  private gameAttemptsMap: Map<string, GameAttempt> = new Map();
  private userProgressMap: Map<string, UserProgress> = new Map();
  private cache: Map<string, MisinformationCache> = new Map();
  private mediaFiles: Map<string, MediaFile> = new Map();
  private ocrResults: Map<string, OcrResult> = new Map();
  private deepfakeAnalysisMap: Map<string, DeepfakeAnalysis> = new Map();
  private reverseImageResultsMap: Map<string, ReverseImageResult> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed some sample quizzes
    const sampleQuizzes = [
      {
        id: randomUUID(),
        question: "Which of these headlines is most likely to be misinformation?",
        options: [
          "RBI Announces New Cryptocurrency Legal Framework by December 2024",
          "Government Launches Digital Rupee Pilot in 13 Banks", 
          "All UPI Transactions Will Be Charged 2% Fee Starting January 2025"
        ],
        correctAnswer: 2,
        explanation: "The RBI has not announced any such fee structure for UPI transactions. This type of claim often circulates to create panic about financial services.",
        language: "en",
        difficulty: "medium",
        category: "financial",
        active: true,
      },
      {
        id: randomUUID(),
        question: "कौन सी हेडलाइन गलत सूचना होने की सबसे ज्यादा संभावना है?",
        options: [
          "आरबीआई ने दिसंबर 2024 तक नई क्रिप्टोकरेंसी कानूनी ढांचे की घोषणा की",
          "सरकार ने 13 बैंकों में डिजिटल रुपया पायलट लॉन्च किया",
          "जनवरी 2025 से सभी UPI ट्रांजैक्शन पर 2% फीस लगेगी"
        ],
        correctAnswer: 2,
        explanation: "आरबीआई ने UPI ट्रांजैक्शन के लिए ऐसी कोई फीस संरचना की घोषणा नहीं की है। इस प्रकार के दावे अक्सर वित्तीय सेवाओं के बारे में घबराहट पैदा करने के लिए फैलाए जाते हैं।",
        language: "hi",
        difficulty: "medium",
        category: "financial",
        active: true,
      }
    ];

    sampleQuizzes.forEach(quiz => {
      this.quizzes.set(quiz.id, quiz as Quiz);
    });

    // Seed sample mini-games
    const sampleMiniGames = [
      {
        id: randomUUID(),
        title: "Spot the Fake News",
        gameType: "spot-the-fake",
        difficulty: "medium",
        content: {
          articles: [
            {
              headline: "Local Man Discovers Cure for Common Cold Using Kitchen Spices",
              source: "UnverifiedHealth.com",
              publishedDate: "2024-01-15",
              isFake: true
            },
            {
              headline: "Mumbai Metro Line 3 to Begin Operations in Q2 2024",
              source: "Times of India",
              publishedDate: "2024-01-10",
              isFake: false
            }
          ]
        },
        correctAnswer: { fakeArticleIndex: 0 },
        explanation: "The first article lacks credible sources and makes extraordinary medical claims without scientific backing. Always verify health information with trusted medical sources.",
        xpReward: 15,
        language: "en",
        category: "health",
        active: true,
      },
      {
        id: randomUUID(),
        title: "Source Detective Challenge",
        gameType: "source-detective",
        difficulty: "easy",
        content: {
          url: "www.factnewstoday.in",
          clues: [
            "Domain registered last month",
            "No contact information available",
            "Claims to be 'India's #1 news source'",
            "Only publishes sensational content"
          ]
        },
        correctAnswer: { credibilityScore: "low", reasoning: "Recent domain, no transparency, sensational content" },
        explanation: "Multiple red flags indicate this is not a credible source: new domain, lack of transparency, and sensational claims without backing.",
        xpReward: 10,
        language: "en",
        category: "digital-literacy",
        active: true,
      }
    ];

    sampleMiniGames.forEach(game => {
      this.miniGamesMap.set(game.id, game as MiniGame);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      xp: 0,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    
    const updatedUser = { ...user, password: hashedPassword };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async saveReportCard(reportData: any): Promise<ReportCard> {
    const id = randomUUID();
    const report: ReportCard = {
      id,
      userId: null,
      contentUrl: reportData.contentUrl || null,
      contentText: reportData.contentText || null,
      score: reportData.score || 0,
      status: reportData.status || "Unknown",
      summary: reportData.summary || "",
      details: reportData.details || [],
      claims: reportData.claims || [],
      verificationResults: reportData.verificationResults || [],
      createdAt: new Date(),
    };
    this.reportCards.set(id, report);
    return report;
  }

  async getRecentReports(limit: number = 10): Promise<ReportCard[]> {
    return Array.from(this.reportCards.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async getUserReports(userId?: string): Promise<ReportCard[]> {
    if (!userId) {
      return this.getRecentReports();
    }
    return Array.from(this.reportCards.values())
      .filter(report => report.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getActiveQuizzes(language: string): Promise<Quiz[]> {
    return Array.from(this.quizzes.values())
      .filter(quiz => quiz.language === language && quiz.active);
  }

  async getQuizById(id: string): Promise<Quiz | undefined> {
    return this.quizzes.get(id);
  }

  async saveQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt> {
    const id = randomUUID();
    const quizAttempt: QuizAttempt = {
      id,
      quizId: attempt.quizId || null,
      userId: null,
      selectedAnswer: attempt.selectedAnswer,
      isCorrect: attempt.isCorrect,
      xpEarned: attempt.xpEarned || 0,
      completedAt: new Date(),
    };
    this.quizAttempts.set(id, quizAttempt);
    return quizAttempt;
  }

  async getDashboardStats(): Promise<{
    articlesVerified: number;
    misleadingDetected: number;
    xpEarned: number;
    hotspots: Array<{ state: string; riskLevel: "high" | "medium" | "low"; count: number }>;
  }> {
    const reports = Array.from(this.reportCards.values());
    const attempts = Array.from(this.quizAttempts.values());
    
    const misleadingCount = reports.filter(r => 
      r.status === "Misleading" || r.status === "Extremely Misleading"
    ).length;

    const totalXP = attempts.reduce((sum, attempt) => sum + (attempt.xpEarned || 0), 0);

    return {
      articlesVerified: reports.length,
      misleadingDetected: misleadingCount,
      xpEarned: totalXP,
      hotspots: [
        { state: "Maharashtra", riskLevel: "high", count: 45 },
        { state: "Delhi", riskLevel: "medium", count: 23 },
        { state: "Karnataka", riskLevel: "low", count: 12 },
        { state: "West Bengal", riskLevel: "high", count: 38 },
        { state: "Tamil Nadu", riskLevel: "medium", count: 19 },
      ],
    };
  }

  async getCachedResult(contentHash: string): Promise<MisinformationCache | undefined> {
    const cached = this.cache.get(contentHash);
    if (cached && cached.expiresAt && cached.expiresAt < new Date()) {
      this.cache.delete(contentHash);
      return undefined;
    }
    return cached;
  }

  async saveCachedResult(contentHash: string, result: any): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const cached: MisinformationCache = {
      id: randomUUID(),
      contentHash,
      embedding: JSON.stringify(result.embedding || []),
      metadata: result,
      score: result.score || 0,
      status: result.status || "Unknown",
      summary: result.summary || "",
      details: result.details || [],
      expiresAt,
      createdAt: new Date(),
    };

    this.cache.set(contentHash, cached);
  }

  // Media file management
  async saveMediaFile(mediaFileData: InsertMediaFile & { userId?: string; reportCardId?: string }): Promise<MediaFile> {
    const id = randomUUID();
    const mediaFile: MediaFile = {
      id,
      userId: mediaFileData.userId || null,
      reportCardId: mediaFileData.reportCardId || null,
      fileName: mediaFileData.fileName,
      fileType: mediaFileData.fileType,
      fileSize: mediaFileData.fileSize,
      filePath: mediaFileData.filePath,
      mimeType: mediaFileData.mimeType,
      contentHash: mediaFileData.contentHash,
      metadata: mediaFileData.metadata || null,
      uploadedAt: new Date(),
    };
    this.mediaFiles.set(id, mediaFile);
    return mediaFile;
  }

  async getMediaFile(id: string): Promise<MediaFile | undefined> {
    return this.mediaFiles.get(id);
  }

  async getMediaFilesByReportCard(reportCardId: string): Promise<MediaFile[]> {
    return Array.from(this.mediaFiles.values()).filter(file => file.reportCardId === reportCardId);
  }

  // OCR results
  async saveOcrResult(ocrResult: InsertOcrResult): Promise<OcrResult> {
    const id = randomUUID();
    const result: OcrResult = {
      id,
      mediaFileId: ocrResult.mediaFileId || null,
      extractedText: ocrResult.extractedText,
      confidence: ocrResult.confidence || null,
      language: ocrResult.language || "auto",
      textRegions: ocrResult.textRegions || null,
      processedAt: new Date(),
    };
    this.ocrResults.set(id, result);
    return result;
  }

  async getOcrResultsByMediaFile(mediaFileId: string): Promise<OcrResult[]> {
    return Array.from(this.ocrResults.values()).filter(result => result.mediaFileId === mediaFileId);
  }

  // Deepfake analysis
  async saveDeepfakeAnalysis(analysis: InsertDeepfakeAnalysis): Promise<DeepfakeAnalysis> {
    const id = randomUUID();
    const result: DeepfakeAnalysis = {
      id,
      mediaFileId: analysis.mediaFileId || null,
      isDeepfake: analysis.isDeepfake,
      confidence: analysis.confidence,
      analysisType: analysis.analysisType,
      detectionMethod: analysis.detectionMethod,
      evidence: analysis.evidence || null,
      processedAt: new Date(),
    };
    this.deepfakeAnalysisMap.set(id, result);
    return result;
  }

  async getDeepfakeAnalysisByMediaFile(mediaFileId: string): Promise<DeepfakeAnalysis | undefined> {
    return Array.from(this.deepfakeAnalysisMap.values()).find(analysis => analysis.mediaFileId === mediaFileId);
  }

  // Reverse image search
  async saveReverseImageResult(resultData: InsertReverseImageResult): Promise<ReverseImageResult> {
    const id = randomUUID();
    const result: ReverseImageResult = {
      id,
      mediaFileId: resultData.mediaFileId || null,
      similarImages: resultData.similarImages,
      firstSeen: resultData.firstSeen || null,
      sourcesFound: resultData.sourcesFound || null,
      originalSource: resultData.originalSource || null,
      contextAnalysis: resultData.contextAnalysis || null,
      processedAt: new Date(),
    };
    this.reverseImageResultsMap.set(id, result);
    return result;
  }

  async getReverseImageResultByMediaFile(mediaFileId: string): Promise<ReverseImageResult | undefined> {
    return Array.from(this.reverseImageResultsMap.values()).find(result => result.mediaFileId === mediaFileId);
  }

  // Mini-games management
  async getActiveMiniGames(gameType?: string, language: string = "en"): Promise<MiniGame[]> {
    return Array.from(this.miniGamesMap.values()).filter(game => {
      return game.active && 
             game.language === language && 
             (!gameType || game.gameType === gameType);
    });
  }

  async getMiniGameById(id: string): Promise<MiniGame | undefined> {
    return this.miniGamesMap.get(id);
  }

  async saveGameAttempt(attemptData: InsertGameAttempt & { userId?: string }): Promise<GameAttempt> {
    const id = randomUUID();
    const attempt: GameAttempt = {
      id,
      userId: attemptData.userId || null,
      gameId: attemptData.gameId || null,
      userAnswer: attemptData.userAnswer,
      isCorrect: attemptData.isCorrect,
      score: attemptData.score || 0,
      timeSpent: attemptData.timeSpent || null,
      xpEarned: attemptData.xpEarned || 0,
      completedAt: new Date(),
    };
    this.gameAttemptsMap.set(id, attempt);
    return attempt;
  }

  async getUserProgress(userId: string, gameType?: string): Promise<UserProgress[]> {
    return Array.from(this.userProgressMap.values()).filter(progress => {
      return progress.userId === userId && 
             (!gameType || progress.gameType === gameType);
    });
  }

  async updateUserProgress(userId: string, gameType: string, progressUpdate: Partial<InsertUserProgress>): Promise<UserProgress> {
    const progressKey = `${userId}-${gameType}`;
    const existing = Array.from(this.userProgressMap.values()).find(
      progress => progress.userId === userId && progress.gameType === gameType
    );

    if (existing) {
      const updated: UserProgress = {
        ...existing,
        ...progressUpdate,
        lastPlayedAt: new Date(),
      };
      this.userProgressMap.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const newProgress: UserProgress = {
        id,
        userId,
        gameType,
        level: progressUpdate.level || 1,
        totalXp: progressUpdate.totalXp || 0,
        gamesPlayed: progressUpdate.gamesPlayed || 0,
        gamesWon: progressUpdate.gamesWon || 0,
        averageScore: progressUpdate.averageScore || 0,
        streak: progressUpdate.streak || 0,
        lastPlayedAt: new Date(),
      };
      this.userProgressMap.set(id, newProgress);
      return newProgress;
    }
  }

  async getLeaderboard(gameType?: string, limit: number = 10): Promise<Array<{ userId: string; username: string; totalXp: number; level: number }>> {
    const progressList = Array.from(this.userProgressMap.values()).filter(progress => 
      !gameType || progress.gameType === gameType
    );

    const leaderboard = progressList.map(progress => ({
      userId: progress.userId || "",
      username: this.users.get(progress.userId || "")?.username || "Unknown",
      totalXp: progress.totalXp || 0,
      level: progress.level || 1,
    })).sort((a, b) => b.totalXp - a.totalXp);

    return leaderboard.slice(0, limit);
  }
}

// Use database storage if DATABASE_URL is available, otherwise use memory storage
export const storage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();
