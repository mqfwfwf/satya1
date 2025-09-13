// Tier 0: On-device offline analysis using TensorFlow.js
import * as tf from "@tensorflow/tfjs";
import { get, set, keys, del } from "idb-keyval";

interface CachedResult {
  id: string;
  embedding: number[];
  metadata: {
    score: number;
    status: string;
    summary: string;
    details: any[];
  };
  createdAt: number;
}

class Tier0Analyzer {
  private model: tf.LayersModel | null = null;
  private isInitialized = false;
  private readonly CACHE_SIZE = 10000;
  private readonly SIMILARITY_THRESHOLD = 0.8;

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log("Initializing Tier 0 offline analyzer...");
      
      // Try to load a pre-trained model, fallback to rule-based analysis
      try {
        // In production, this would load a quantized sentence embedding model
        // this.model = await tf.loadLayersModel('/models/sentence-bert/model.json');
        console.log("Pre-trained model not available, using rule-based analysis");
        this.model = null; // Will use rule-based analysis instead
      } catch (modelError) {
        console.log("Model loading failed, using rule-based analysis:", modelError);
        this.model = null;
      }
      
      this.isInitialized = true;
      console.log("Tier 0 analyzer initialized with rule-based misinformation detection");
    } catch (error) {
      console.error("Failed to initialize Tier 0 analyzer:", error);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Simple text preprocessing
      const processedText = this.preprocessText(text);
      
      if (this.model) {
        // Use TensorFlow model if available
        const inputVector = this.textToVector(processedText);
        const inputTensor = tf.tensor2d([inputVector], [1, 384]);
        const prediction = this.model.predict(inputTensor) as tf.Tensor;
        const embedding = await prediction.data();
        
        inputTensor.dispose();
        prediction.dispose();
        
        return Array.from(embedding);
      } else {
        // Use rule-based feature extraction as fallback
        return this.extractTextFeatures(processedText);
      }
    } catch (error) {
      console.error("Error generating embedding:", error);
      // Fallback to simple text features
      return this.extractTextFeatures(this.preprocessText(text));
    }
  }

  private extractTextFeatures(text: string): number[] {
    // Rule-based feature extraction for offline misinformation detection
    const features = new Array(20).fill(0);
    
    // Misinformation indicators
    const suspiciousWords = [
      'breaking', 'urgent', 'scientists discover', 'they don\'t want you to know',
      'secret', 'hidden', 'conspiracy', 'cover-up', 'truth revealed',
      'shocking', 'exposed', 'leaked', 'insider', 'government lies'
    ];
    
    const emotionalWords = [
      'fear', 'scared', 'terrifying', 'dangerous', 'deadly', 'catastrophic',
      'amazing', 'incredible', 'miraculous', 'revolutionary', 'breakthrough'
    ];
    
    const uncertaintyWords = [
      'might', 'could', 'possibly', 'allegedly', 'reportedly', 'sources say',
      'unconfirmed', 'rumor', 'speculation', 'believed to be'
    ];
    
    const lowerText = text.toLowerCase();
    
    // Feature 1-5: Suspicious word counts
    features[0] = this.countWordsInText(lowerText, suspiciousWords) / text.length * 1000;
    features[1] = this.countWordsInText(lowerText, emotionalWords) / text.length * 1000;
    features[2] = this.countWordsInText(lowerText, uncertaintyWords) / text.length * 1000;
    
    // Feature 6-10: Text structure indicators
    features[3] = (text.match(/[!]{2,}/g) || []).length; // Multiple exclamation marks
    features[4] = (text.match(/[A-Z]{3,}/g) || []).length; // ALL CAPS words
    features[5] = (text.match(/\?\?\?+/g) || []).length; // Multiple question marks
    
    // Feature 11-15: Content patterns
    features[6] = lowerText.includes('share if') || lowerText.includes('share this') ? 1 : 0;
    features[7] = lowerText.includes('before it\'s removed') || lowerText.includes('censored') ? 1 : 0;
    features[8] = text.split(' ').length > 200 ? 1 : 0; // Very long text
    
    // Feature 16-20: Numeric and date patterns
    features[9] = (text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g) || []).length; // Date patterns
    features[10] = (text.match(/\d+%/g) || []).length; // Percentage claims
    
    // Normalize features to 0-1 range
    return features.map(f => Math.min(f, 1));
  }

  private countWordsInText(text: string, words: string[]): number {
    return words.reduce((count, word) => {
      return count + (text.includes(word) ? 1 : 0);
    }, 0);
  }

  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 512); // Limit length
  }

  private textToVector(text: string): number[] {
    // Simplified text vectorization (in production, use proper tokenization)
    const words = text.split(" ");
    const vector = new Array(384).fill(0);
    
    for (let i = 0; i < Math.min(words.length, 384); i++) {
      const word = words[i];
      vector[i] = word ? word.charCodeAt(0) / 255 : 0;
    }
    
    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (normA * normB);
  }

  async findSimilarContent(embedding: number[]): Promise<CachedResult | null> {
    try {
      const cacheKeys = await keys();
      const satyaKeys = cacheKeys.filter(key => 
        typeof key === 'string' && key.startsWith('satya-cache-')
      );

      let bestMatch: CachedResult | null = null;
      let bestSimilarity = 0;

      for (const key of satyaKeys) {
        const cached = await get(key) as CachedResult;
        if (!cached?.embedding) continue;

        const similarity = this.cosineSimilarity(embedding, cached.embedding);
        
        if (similarity > bestSimilarity && similarity > this.SIMILARITY_THRESHOLD) {
          bestSimilarity = similarity;
          bestMatch = cached;
        }
      }

      return bestMatch;
    } catch (error) {
      console.error("Error finding similar content:", error);
      return null;
    }
  }

  async cacheResult(content: string, result: any): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(content);
      const cacheKey = `satya-cache-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const cachedResult: CachedResult = {
        id: cacheKey,
        embedding,
        metadata: {
          score: result.score || 0,
          status: result.status || 'Unknown',
          summary: result.summary || '',
          details: result.details || []
        },
        createdAt: Date.now()
      };

      await set(cacheKey, cachedResult);
      
      // Cleanup old entries if cache is full
      await this.cleanupCache();
    } catch (error) {
      console.error("Error caching result:", error);
    }
  }

  private async cleanupCache(): Promise<void> {
    try {
      const cacheKeys = await keys();
      const satyaKeys = cacheKeys.filter(key => 
        typeof key === 'string' && key.startsWith('satya-cache-')
      );

      if (satyaKeys.length > this.CACHE_SIZE) {
        // Remove oldest entries
        const entriesToRemove = satyaKeys.slice(0, satyaKeys.length - this.CACHE_SIZE);
        await Promise.all(entriesToRemove.map(key => del(key)));
      }
    } catch (error) {
      console.error("Error cleaning up cache:", error);
    }
  }

  async analyze(content: string): Promise<CachedResult | null> {
    await this.initialize();
    
    try {
      // First check cache for similar content
      const embedding = await this.generateEmbedding(content);
      const cachedResult = await this.findSimilarContent(embedding);
      
      if (cachedResult) {
        console.log("Found similar content in cache");
        return cachedResult;
      }
      
      // No cache hit, perform rule-based offline analysis
      const analysis = this.performOfflineAnalysis(content, embedding);
      
      // Cache this new analysis
      await this.cacheResult(content, analysis);
      
      return {
        id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        embedding,
        metadata: analysis,
        createdAt: Date.now()
      };
    } catch (error) {
      console.error("Tier 0 analysis failed:", error);
      return null;
    }
  }

  performOfflineAnalysis(content: string, features: number[]): {
    score: number;
    status: string;
    summary: string;
    details: any[];
  } {
    // Rule-based credibility scoring using extracted features
    let suspicionScore = 0;
    let reasons: string[] = [];
    
    // Analyze suspicious words (features[0])
    if (features[0] > 0.02) { // >2% suspicious words
      suspicionScore += 30;
      reasons.push("Contains suspicious language patterns commonly used in misinformation");
    }
    
    // Analyze emotional manipulation (features[1])
    if (features[1] > 0.015) { // >1.5% emotional words
      suspicionScore += 25;
      reasons.push("Uses emotionally charged language to manipulate reader response");
    }
    
    // Analyze uncertainty indicators (features[2])
    if (features[2] > 0.01) { // >1% uncertainty words
      suspicionScore += 15;
      reasons.push("Contains uncertain language that may indicate unverified claims");
    }
    
    // Analyze text formatting (features[3-5])
    if (features[3] > 0 || features[4] > 2 || features[5] > 0) {
      suspicionScore += 20;
      reasons.push("Uses attention-grabbing formatting typical of sensationalized content");
    }
    
    // Analyze viral sharing patterns (features[6-7])
    if (features[6] > 0 || features[7] > 0) {
      suspicionScore += 25;
      reasons.push("Contains urgency tactics pressuring readers to share quickly");
    }
    
    // Calculate credibility score (inverse of suspicion)
    const credibilityScore = Math.max(0, Math.min(100, 100 - suspicionScore));
    
    // Determine status based on score
    let status: string;
    if (credibilityScore >= 80) {
      status = "Credible";
    } else if (credibilityScore >= 60) {
      status = "Questionable";
    } else if (credibilityScore >= 30) {
      status = "Misleading";
    } else {
      status = "Extremely Misleading";
    }
    
    // Generate summary
    const summary = this.generateOfflineSummary(credibilityScore, reasons);
    
    // Generate details
    const details = [
      {
        section: "Offline Analysis",
        status: credibilityScore >= 70 ? "True" : credibilityScore >= 40 ? "Caution" : "False",
        finding: `Rule-based analysis completed. ${reasons.length > 0 ? 'Found ' + reasons.length + ' potential concern(s).' : 'No significant red flags detected.'}`,
        proof: [
          {
            url: "https://en.wikipedia.org/wiki/Misinformation",
            source: "Wikipedia: Misinformation"
          }
        ]
      }
    ];
    
    if (reasons.length > 0) {
      details.push({
        section: "Detected Issues",
        status: "Caution",
        finding: reasons.join(". "),
        proof: [
          {
            url: "https://www.factcheck.org/2020/02/how-to-spot-misinformation/",
            source: "FactCheck.org Guide"
          }
        ]
      });
    }
    
    return {
      score: credibilityScore,
      status,
      summary,
      details
    };
  }

  private generateOfflineSummary(score: number, reasons: string[]): string {
    if (score >= 80) {
      return "Offline analysis suggests this content appears credible with no major red flags detected. However, verify with trusted sources for important information.";
    } else if (score >= 60) {
      return `Offline analysis found some questionable elements. Review carefully and cross-check with reliable sources. ${reasons.length > 0 ? 'Main concerns: ' + reasons.slice(0, 2).join(', ') + '.' : ''}`;
    } else if (score >= 30) {
      return `Offline analysis detected multiple misinformation indicators. This content should be verified with authoritative sources before sharing. Key issues: ${reasons.slice(0, 3).join(', ')}.`;
    } else {
      return `Offline analysis indicates this content is highly likely to be misleading or false. Contains multiple red flags typical of misinformation. Do not share without thorough fact-checking.`;
    }
  }
}

export const tier0Analyzer = new Tier0Analyzer();
