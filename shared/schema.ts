import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  xp: integer("xp").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportCards = pgTable("report_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  contentUrl: text("content_url"),
  contentText: text("content_text"),
  score: integer("score").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  details: jsonb("details").notNull(),
  claims: jsonb("claims"),
  verificationResults: jsonb("verification_results"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quizzes = pgTable("quizzes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  options: jsonb("options").notNull(),
  correctAnswer: integer("correct_answer").notNull(),
  explanation: text("explanation").notNull(),
  language: text("language").default("en"),
  difficulty: text("difficulty").default("medium"),
  category: text("category").default("general"),
  active: boolean("active").default(true),
});

export const userQuizAttempts = pgTable("user_quiz_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  quizId: varchar("quiz_id").references(() => quizzes.id),
  selectedAnswer: integer("selected_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  xpEarned: integer("xp_earned").default(0),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const miniGames = pgTable("mini_games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  gameType: text("game_type").notNull(), // spot-the-fake, source-detective, image-truth, quiz-challenge
  difficulty: text("difficulty").default("medium"), // easy, medium, hard
  content: jsonb("content").notNull(), // Game-specific content and options
  correctAnswer: jsonb("correct_answer").notNull(), // Correct answers or solutions
  explanation: text("explanation").notNull(),
  xpReward: integer("xp_reward").default(10),
  language: text("language").default("en"),
  category: text("category").default("general"), // covid, politics, technology, general
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gameAttempts = pgTable("game_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  gameId: varchar("game_id").references(() => miniGames.id),
  userAnswer: jsonb("user_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  score: integer("score").default(0), // 0-100 score
  timeSpent: integer("time_spent"), // seconds
  xpEarned: integer("xp_earned").default(0),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  gameType: text("game_type").notNull(),
  level: integer("level").default(1),
  totalXp: integer("total_xp").default(0),
  gamesPlayed: integer("games_played").default(0),
  gamesWon: integer("games_won").default(0),
  averageScore: integer("average_score").default(0),
  streak: integer("streak").default(0), // consecutive correct answers
  lastPlayedAt: timestamp("last_played_at").defaultNow(),
});

export const misinformationCache = pgTable("misinformation_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentHash: text("content_hash").notNull().unique(),
  embedding: text("embedding"),
  metadata: jsonb("metadata").notNull(),
  score: integer("score").notNull(),
  status: text("status").notNull(),
  summary: text("summary"),
  details: jsonb("details"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mediaFiles = pgTable("media_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  reportCardId: varchar("report_card_id").references(() => reportCards.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // image/jpeg, video/mp4, etc.
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  contentHash: text("content_hash").notNull(),
  metadata: jsonb("metadata"), // EXIF, video metadata, etc.
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const ocrResults = pgTable("ocr_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaFileId: varchar("media_file_id").references(() => mediaFiles.id),
  extractedText: text("extracted_text").notNull(),
  confidence: integer("confidence"), // 0-100
  language: text("language").default("auto"),
  textRegions: jsonb("text_regions"), // Bounding boxes and coordinates
  processedAt: timestamp("processed_at").defaultNow(),
});

export const deepfakeAnalysis = pgTable("deepfake_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaFileId: varchar("media_file_id").references(() => mediaFiles.id),
  isDeepfake: boolean("is_deepfake").notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  analysisType: text("analysis_type").notNull(), // face_swap, voice_clone, etc.
  detectionMethod: text("detection_method").notNull(), // AI model used
  evidence: jsonb("evidence"), // Technical details, anomalies found
  processedAt: timestamp("processed_at").defaultNow(),
});

export const reverseImageResults = pgTable("reverse_image_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaFileId: varchar("media_file_id").references(() => mediaFiles.id),
  similarImages: jsonb("similar_images").notNull(), // Array of similar image URLs
  firstSeen: timestamp("first_seen"), // Earliest known appearance
  sourcesFound: jsonb("sources_found"), // Websites where image was found
  originalSource: text("original_source"), // Likely original source
  contextAnalysis: jsonb("context_analysis"), // How image was used in different contexts
  processedAt: timestamp("processed_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertReportCardSchema = createInsertSchema(reportCards).pick({
  contentUrl: true,
  contentText: true,
  score: true,
  status: true,
  summary: true,
  details: true,
  claims: true,
  verificationResults: true,
});

export const insertQuizSchema = createInsertSchema(quizzes).pick({
  question: true,
  options: true,
  correctAnswer: true,
  explanation: true,
  language: true,
  difficulty: true,
  category: true,
});

export const insertQuizAttemptSchema = createInsertSchema(userQuizAttempts).pick({
  quizId: true,
  selectedAnswer: true,
  isCorrect: true,
  xpEarned: true,
});

export const insertMiniGameSchema = createInsertSchema(miniGames).pick({
  title: true,
  gameType: true,
  difficulty: true,
  content: true,
  correctAnswer: true,
  explanation: true,
  xpReward: true,
  language: true,
  category: true,
});

export const insertGameAttemptSchema = createInsertSchema(gameAttempts).pick({
  gameId: true,
  userAnswer: true,
  isCorrect: true,
  score: true,
  timeSpent: true,
  xpEarned: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).pick({
  gameType: true,
  level: true,
  totalXp: true,
  gamesPlayed: true,
  gamesWon: true,
  averageScore: true,
  streak: true,
});

export const insertMediaFileSchema = createInsertSchema(mediaFiles).pick({
  fileName: true,
  fileType: true,
  fileSize: true,
  filePath: true,
  mimeType: true,
  contentHash: true,
  metadata: true,
});

export const insertOcrResultSchema = createInsertSchema(ocrResults).pick({
  mediaFileId: true,
  extractedText: true,
  confidence: true,
  language: true,
  textRegions: true,
});

export const insertDeepfakeAnalysisSchema = createInsertSchema(deepfakeAnalysis).pick({
  mediaFileId: true,
  isDeepfake: true,
  confidence: true,
  analysisType: true,
  detectionMethod: true,
  evidence: true,
});

export const insertReverseImageResultSchema = createInsertSchema(reverseImageResults).pick({
  mediaFileId: true,
  similarImages: true,
  firstSeen: true,
  sourcesFound: true,
  originalSource: true,
  contextAnalysis: true,
});

// Analysis request/response schemas
export const analysisRequestSchema = z.object({
  content: z.string().optional(),
  url: z.string().url().optional(),
  fileData: z.string().optional(),
  fileType: z.string().optional(),
  fileName: z.string().optional(),
}).refine(data => data.content || data.url || data.fileData, {
  message: "Either content, url, or fileData must be provided"
});

export const claimSchema = z.object({
  text: z.string(),
  verdict: z.enum(["True", "False", "Mixed", "Unverifiable"]),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  sources: z.array(z.object({
    url: z.string(),
    title: z.string(),
    source: z.string(),
  })),
});

export const analysisResultSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["Credible", "Questionable", "Misleading", "Extremely Misleading"]),
  summary: z.string(),
  details: z.array(z.object({
    section: z.string(),
    status: z.enum(["True", "False", "Caution", "Mixed"]),
    finding: z.string(),
    proof: z.array(z.object({
      url: z.string(),
      source: z.string(),
    })),
  })),
  claims: z.array(claimSchema),
  processingTime: z.number(),
  aiModel: z.string(),
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertReportCard = z.infer<typeof insertReportCardSchema>;
export type ReportCard = typeof reportCards.$inferSelect;
export type InsertQuiz = z.infer<typeof insertQuizSchema>;
export type Quiz = typeof quizzes.$inferSelect;
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;
export type QuizAttempt = typeof userQuizAttempts.$inferSelect;
export type InsertMiniGame = z.infer<typeof insertMiniGameSchema>;
export type MiniGame = typeof miniGames.$inferSelect;
export type InsertGameAttempt = z.infer<typeof insertGameAttemptSchema>;
export type GameAttempt = typeof gameAttempts.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type MisinformationCache = typeof misinformationCache.$inferSelect;
export type InsertMediaFile = z.infer<typeof insertMediaFileSchema>;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type InsertOcrResult = z.infer<typeof insertOcrResultSchema>;
export type OcrResult = typeof ocrResults.$inferSelect;
export type InsertDeepfakeAnalysis = z.infer<typeof insertDeepfakeAnalysisSchema>;
export type DeepfakeAnalysis = typeof deepfakeAnalysis.$inferSelect;
export type InsertReverseImageResult = z.infer<typeof insertReverseImageResultSchema>;
export type ReverseImageResult = typeof reverseImageResults.$inferSelect;
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type Claim = z.infer<typeof claimSchema>;
