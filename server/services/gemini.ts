import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, Claim } from "@shared/schema";
import { cacheService } from "./redis-cache";
import { vectorSearchService } from "./vector-search";

// the newest Gemini model is "gemini-2.5-flash" - do not change this unless explicitly requested by the user
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export class GeminiService {
  async analyzeContent(content: string, contentUrl?: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is required for analysis");
      }

      // Check cache first
      const cacheKey = `gemini:analysis:${this.generateContentHash(content)}`;
      const cachedResult = await cacheService.get<AnalysisResult>(cacheKey);
      if (cachedResult) {
        console.log("Returning cached Gemini analysis");
        return cachedResult;
      }

      // Check for similar content using vector search
      const similarContent = await vectorSearchService.searchSimilarContent(content, {
        topK: 5,
        threshold: 0.8,
        namespace: "misinformation-patterns"
      });

      if (similarContent.matches.length > 0) {
        console.log(`Found ${similarContent.matches.length} similar content patterns`);
      }

      // Extract claims first
      const claims = await this.extractClaims(content);
      
      // Verify each claim
      const verifiedClaims = await Promise.all(
        claims.map(claim => this.verifyClaim(claim))
      );

      // Generate overall analysis with context from similar content
      const analysis = await this.generateOverallAnalysis(content, verifiedClaims, contentUrl, similarContent.matches);
      
      const processingTime = Date.now() - startTime;

      const result: AnalysisResult = {
        ...analysis,
        claims: verifiedClaims,
        processingTime,
        aiModel: "Gemini 2.5 Flash",
      };

      // Cache the result for 1 hour
      await cacheService.set(cacheKey, result, 3600);

      // Store in vector database for future similarity searches
      try {
        await vectorSearchService.storeContent(
          `analysis:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`,
          content,
          {
            score: result.score,
            status: result.status,
            timestamp: new Date().toISOString(),
            contentUrl: contentUrl || null,
          },
          "misinformation-patterns"
        );
      } catch (vectorError) {
        console.warn("Failed to store in vector database:", vectorError);
      }

      return result;
    } catch (error) {
      console.error("Gemini analysis failed:", error);
      throw new Error(`Gemini analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateContentHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private async extractClaims(content: string): Promise<string[]> {
    const prompt = `Analyze the following content and extract 3-5 key factual claims that can be verified. Focus on specific, verifiable statements rather than opinions.

Content: ${content}

Return only a JSON array of claim strings.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: { type: "string" }
          }
        }
      });

      clearTimeout(timeoutId);
      const claimsText = result.text;
      if (!claimsText) {
        throw new Error("No claims extracted");
      }

      return JSON.parse(claimsText);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async verifyClaim(claimText: string): Promise<Claim> {
    const prompt = `Verify this claim using your knowledge and provide a structured analysis:

Claim: "${claimText}"

Analyze the claim for:
1. Factual accuracy 
2. Available evidence
3. Source credibility requirements
4. Confidence level

Respond with this exact JSON structure:`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
              verdict: { 
                type: "string",
                enum: ["True", "False", "Mixed", "Unverifiable"]
              },
              confidence: { 
                type: "number",
                minimum: 0,
                maximum: 1
              },
              evidence: { type: "string" },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    source: { type: "string" }
                  }
                }
              }
            },
            required: ["text", "verdict", "confidence", "evidence", "sources"]
          }
        }
      });

      clearTimeout(timeoutId);
      const resultText = result.text;
      if (!resultText) {
        throw new Error("No verification result");
      }

      const resultData = JSON.parse(resultText);
      
      return {
        text: claimText,
        verdict: resultData.verdict,
        confidence: resultData.confidence,
        evidence: resultData.evidence,
        sources: resultData.sources || [],
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async generateOverallAnalysis(
    content: string, 
    claims: Claim[], 
    contentUrl?: string,
    similarContent?: any[]
  ): Promise<Omit<AnalysisResult, 'claims' | 'processingTime' | 'aiModel'>> {
    const claimsContext = claims.map(claim => 
      `Claim: "${claim.text}" - Verdict: ${claim.verdict} (${Math.round(claim.confidence * 100)}% confidence)`
    ).join('\n');

    const prompt = `Analyze this content for misinformation indicators based on the claim verification results:

Content: ${content}
${contentUrl ? `Source URL: ${contentUrl}` : ''}

Claim Analysis Results:
${claimsContext}

Provide a comprehensive analysis covering:
1. Overall credibility score (0-100)
2. Status classification 
3. Summary explanation
4. Detailed findings for each analysis section

Consider:
- Source reliability indicators
- Emotional manipulation tactics  
- Logical fallacies
- Evidence quality
- Cross-referencing with verified information

Respond with this exact JSON structure:`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              score: { 
                type: "integer", 
                minimum: 0, 
                maximum: 100 
              },
              status: { 
                type: "string",
                enum: ["Credible", "Questionable", "Misleading", "Extremely Misleading"]
              },
              summary: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    section: { type: "string" },
                    status: { 
                      type: "string",
                      enum: ["True", "False", "Caution", "Mixed"]
                    },
                    finding: { type: "string" },
                    proof: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          url: { type: "string" },
                          source: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            },
            required: ["score", "status", "summary", "details"]
          }
        }
      });

      clearTimeout(timeoutId);
      const resultText = result.text;
      if (!resultText) {
        throw new Error("No analysis result");
      }

      return JSON.parse(resultText);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async analyzeImage(imageData: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const prompt = `Analyze this image for potential misinformation indicators:

1. Check for signs of manipulation or editing
2. Look for misleading context or captions
3. Assess visual credibility indicators
4. Identify any deepfake or AI-generated characteristics

Provide a comprehensive analysis with credibility scoring.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const result = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: imageData,
                  mimeType: "image/jpeg",
                },
              },
              { text: prompt }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              status: { 
                type: "string",
                enum: ["Credible", "Questionable", "Misleading", "Extremely Misleading"]
              },
              summary: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    section: { type: "string" },
                    status: { type: "string" },
                    finding: { type: "string" },
                    proof: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          }
        }
      });

      clearTimeout(timeoutId);
      const resultData = JSON.parse(result.text || "{}");
      const processingTime = Date.now() - startTime;

      return {
        ...resultData,
        claims: [],
        processingTime,
        aiModel: "Gemini 2.5 Pro Vision",
      };
    } catch (error) {
      console.error("Gemini image analysis failed:", error);
      throw new Error(`Gemini image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const geminiService = new GeminiService();
