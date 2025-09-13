import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import fs from "fs/promises";
import path from "path";

class DatabaseService {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.db = drizzle(this.pool);
  }

  /**
   * Run database migrations
   */
  async runMigrations(): Promise<void> {
    try {
      console.log("Running database migrations...");
      
      // Read migration files
      const migrationsDir = path.join(process.cwd(), "migrations");
      const migrationFiles = await fs.readdir(migrationsDir);
      const sqlFiles = migrationFiles
        .filter(file => file.endsWith(".sql"))
        .sort(); // Run migrations in order

      // Create migrations tracking table if it doesn't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Check which migrations have been run
      const executedMigrations = await this.pool.query(
        "SELECT filename FROM _migrations ORDER BY executed_at"
      );
      const executedSet = new Set(executedMigrations.rows.map(row => row.filename));

      // Run pending migrations
      for (const filename of sqlFiles) {
        if (!executedSet.has(filename)) {
          console.log(`Running migration: ${filename}`);
          
          const migrationPath = path.join(migrationsDir, filename);
          const migrationSQL = await fs.readFile(migrationPath, "utf-8");
          
          // Run migration in a transaction
          const client = await this.pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(migrationSQL);
            await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [filename]);
            await client.query("COMMIT");
            console.log(`Migration ${filename} completed successfully`);
          } catch (error) {
            await client.query("ROLLBACK");
            throw new Error(`Migration ${filename} failed: ${error}`);
          } finally {
            client.release();
          }
        }
      }

      console.log("All migrations completed successfully");
    } catch (error) {
      console.error("Migration error:", error);
      throw error;
    }
  }

  /**
   * Check database connection
   */
  async checkConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log("Database connection successful");
      return true;
    } catch (error) {
      console.error("Database connection failed:", error);
      return false;
    }
  }

  /**
   * Seed initial data
   */
  async seedData(): Promise<void> {
    try {
      console.log("Seeding initial data...");
      
      // Check if data already exists
      const userCount = await this.pool.query("SELECT COUNT(*) FROM users");
      if (parseInt(userCount.rows[0].count) > 0) {
        console.log("Data already seeded, skipping...");
        return;
      }

      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        // Seed admin user
        const adminPasswordHash = await import("bcryptjs").then(bcrypt => 
          bcrypt.hash("Admin@123", 12)
        );
        
        await client.query(`
          INSERT INTO users (username, password, xp) 
          VALUES ('admin', $1, 1000)
        `, [adminPasswordHash]);

        // Seed sample quizzes
        const quizzes = [
          {
            question: "Which of these headlines is most likely to be misinformation?",
            options: JSON.stringify([
              "RBI Announces New Cryptocurrency Legal Framework by December 2024",
              "Government Launches Digital Rupee Pilot in 13 Banks", 
              "All UPI Transactions Will Be Charged 2% Fee Starting January 2025"
            ]),
            correctAnswer: 2,
            explanation: "The RBI has not announced any such fee structure for UPI transactions. This type of claim often circulates to create panic about financial services.",
            language: "en",
            difficulty: "medium",
            category: "financial"
          },
          {
            question: "कौन सी हेडलाइन गलत सूचना होने की सबसे ज्यादा संभावना है?",
            options: JSON.stringify([
              "आरबीआई ने दिसंबर 2024 तक नई क्रिप्टोकरेंसी कानूनी ढांचे की घोषणा की",
              "सरकार ने 13 बैंकों में डिजिटल रुपया पायलट लॉन्च किया",
              "जनवरी 2025 से सभी UPI ट्रांजैक्शन पर 2% फीस लगेगी"
            ]),
            correctAnswer: 2,
            explanation: "आरबीआई ने UPI ट्रांजैक्शन के लिए ऐसी कोई फीस संरचना की घोषणा नहीं की है। इस प्रकार के दावे अक्सर वित्तीय सेवाओं के बारे में घबराहट पैदा करने के लिए फैलाए जाते हैं।",
            language: "hi",
            difficulty: "medium",
            category: "financial"
          }
        ];

        for (const quiz of quizzes) {
          await client.query(`
            INSERT INTO quizzes (question, options, correct_answer, explanation, language, difficulty, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [quiz.question, quiz.options, quiz.correctAnswer, quiz.explanation, quiz.language, quiz.difficulty, quiz.category]);
        }

        // Seed sample mini-games
        const miniGames = [
          {
            title: "Spot the Fake News",
            gameType: "spot-the-fake",
            difficulty: "medium",
            content: JSON.stringify({
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
            }),
            correctAnswer: JSON.stringify({ fakeArticleIndex: 0 }),
            explanation: "The first article lacks credible sources and makes extraordinary medical claims without scientific backing. Always verify health information with trusted medical sources.",
            xpReward: 15,
            language: "en",
            category: "health"
          },
          {
            title: "Source Detective Challenge",
            gameType: "source-detective",
            difficulty: "easy",
            content: JSON.stringify({
              url: "www.factnewstoday.in",
              clues: [
                "Domain registered last month",
                "No contact information available",
                "Claims to be 'India's #1 news source'",
                "Only publishes sensational content"
              ]
            }),
            correctAnswer: JSON.stringify({ credibilityScore: "low", reasoning: "Recent domain, no transparency, sensational content" }),
            explanation: "Multiple red flags indicate this is not a credible source: new domain, lack of transparency, and sensational claims without backing.",
            xpReward: 10,
            language: "en",
            category: "digital-literacy"
          }
        ];

        for (const game of miniGames) {
          await client.query(`
            INSERT INTO mini_games (title, game_type, difficulty, content, correct_answer, explanation, xp_reward, language, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [game.title, game.gameType, game.difficulty, game.content, game.correctAnswer, game.explanation, game.xpReward, game.language, game.category]);
        }

        await client.query("COMMIT");
        console.log("Initial data seeded successfully");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Data seeding error:", error);
      throw error;
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Get database instance
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Get connection pool
   */
  getPool() {
    return this.pool;
  }
}

export const databaseService = new DatabaseService();

// Auto-initialize database on import
if (process.env.NODE_ENV !== "test") {
  databaseService.checkConnection()
    .then(async (connected) => {
      if (connected) {
        await databaseService.runMigrations();
        await databaseService.seedData();
      }
    })
    .catch(error => {
      console.error("Database initialization failed:", error);
    });
}