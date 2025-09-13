import { geminiService } from "./gemini";
import { openaiService } from "./openai";
import { verificationService } from "./verification.js";
import { mediaAnalysisService } from "./media-analysis";
import { storage } from "../storage";
import type { AnalysisRequest, AnalysisResult } from "@shared/schema";
import { createHash } from "crypto";

export class AnalysisService {
  async analyzeContent(request: AnalysisRequest): Promise<AnalysisResult> {
    try {
      // Generate content hash for caching
      const contentHash = this.generateContentHash(request);
      
      // Check cache first (Tier 1)
      const cached = await storage.getCachedResult(contentHash);
      if (cached) {
        return {
          score: cached.score,
          status: (cached.status as "Credible" | "Questionable" | "Misleading" | "Extremely Misleading") || "Questionable",
          summary: cached.summary || "",
          details: cached.details as any || [],
          claims: [],
          processingTime: 10,
          aiModel: "Cached Result",
        };
      }

      let result: AnalysisResult;

      // Handle different input types
      if (request.fileData && request.fileType) {
        const fileName = request.fileName || "uploaded_file";
        result = await this.analyzeMedia(request.fileData, request.fileType, fileName);
      } else if (request.url) {
        const scrapedContent = await this.scrapeUrl(request.url);
        result = await this.analyzeText(scrapedContent, request.url);
      } else if (request.content) {
        result = await this.analyzeText(request.content);
      } else {
        throw new Error("No content provided for analysis");
      }

      // Run additional verification checks
      result = await this.enhanceWithVerification(result, request);

      // Cache the result
      await storage.saveCachedResult(contentHash, result);

      return result;
    } catch (error) {
      console.error("Analysis service error:", error);
      throw error;
    }
  }

  private generateContentHash(request: AnalysisRequest): string {
    const content = request.content || request.url || request.fileData || "";
    return createHash("sha256").update(content).digest("hex");
  }

  private async analyzeText(content: string, url?: string): Promise<AnalysisResult> {
    try {
      // Try Gemini first (primary)
      console.log("Attempting analysis with Gemini...");
      return await geminiService.analyzeContent(content, url);
    } catch (geminiError) {
      console.warn("Gemini analysis failed, falling back to OpenAI:", geminiError);
      
      try {
        // Fallback to OpenAI
        return await openaiService.analyzeContent(content, url);
      } catch (openaiError) {
        console.error("Both Gemini and OpenAI failed:", { geminiError, openaiError });
        
        // Return basic analysis if both fail
        return this.generateFallbackAnalysis(content);
      }
    }
  }

  private async analyzeMedia(fileData: string, fileType: string, fileName: string = "uploaded_file"): Promise<AnalysisResult> {
    try {
      // Use comprehensive media analysis service
      console.log(`Starting comprehensive analysis for ${fileType} file: ${fileName}`);
      const mediaResults = await mediaAnalysisService.analyzeMedia(fileData, fileName, fileType);
      
      // Return the enhanced analysis result that includes OCR, deepfake detection, and reverse image search
      return mediaResults.analysisResult;
    } catch (error) {
      console.error("Comprehensive media analysis failed, falling back to basic analysis:", error);
      
      // Fallback to basic image analysis
      if (fileType.startsWith("image/")) {
        try {
          // Try Gemini first for image analysis
          return await geminiService.analyzeImage(fileData);
        } catch (geminiError) {
          console.warn("Gemini image analysis failed, falling back to OpenAI:", geminiError);
          
          try {
            return await openaiService.analyzeImage(fileData);
          } catch (openaiError) {
            console.error("Both image analysis services failed:", { geminiError, openaiError });
            return this.generateFallbackAnalysis("Image content analysis");
          }
        }
      } else if (fileType.startsWith("video/")) {
        // Basic video analysis fallback
        return this.generateFallbackAnalysis("Video content analysis - comprehensive analysis temporarily unavailable");
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
    }
  }

  private async scrapeUrl(url: string): Promise<string> {
    try {
      // SSRF Protection: Validate and sanitize URL
      const validatedUrl = this.validateUrl(url);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(validatedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SatyaBot/1.0; +https://satya.app/bot)',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Basic text extraction (in production, use a proper HTML parser)
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!textContent || textContent.length < 50) {
        throw new Error("Could not extract meaningful content from URL");
      }

      return textContent.substring(0, 5000); // Limit content length
    } catch (error) {
      console.error("URL scraping failed:", error);
      throw new Error(`Failed to scrape URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are allowed');
      }

      // Block private/internal IP ranges and localhost
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Block localhost variants
      if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
        throw new Error('Access to localhost is not allowed');
      }
      
      // Block private IP ranges (basic check)
      if (hostname.match(/^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^169\.254\.|^fc00:|^fe80:/)) {
        throw new Error('Access to private IP ranges is not allowed');
      }
      
      // Block common internal domains
      if (hostname.includes('.local') || hostname.includes('.internal')) {
        throw new Error('Access to internal domains is not allowed');
      }

      return url;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Invalid URL format');
      }
      throw error;
    }
  }

  private async enhanceWithVerification(result: AnalysisResult, request: AnalysisRequest): Promise<AnalysisResult> {
    try {
      // Run additional verification checks
      const verificationResults = await verificationService.runVerificationChecks(result, request);
      
      // Merge verification results with AI analysis
      const enhancedDetails = [...result.details];
      
      if (verificationResults.factCheckResults.length > 0) {
        enhancedDetails.push({
          section: "Fact-Check Database",
          status: verificationResults.factCheckResults.some((r: any) => r.rating === "FALSE") ? "False" : "Mixed",
          finding: `Found ${verificationResults.factCheckResults.length} related fact-check reports`,
          proof: verificationResults.factCheckResults.map((r: any) => ({
            url: r.url,
            source: r.publisher,
          })),
        });
      }

      if (verificationResults.deepfakeScore !== undefined) {
        enhancedDetails.push({
          section: "Deepfake Detection",
          status: verificationResults.deepfakeScore > 0.7 ? "False" : "True",
          finding: `Deepfake confidence: ${Math.round(verificationResults.deepfakeScore * 100)}%`,
          proof: [{
            url: "https://sensity.ai",
            source: "Sensity AI Detection",
          }],
        });
      }

      // Adjust overall score based on verification results
      let adjustedScore = result.score;
      if (verificationResults.factCheckResults.some((r: any) => r.rating === "FALSE")) {
        adjustedScore = Math.min(adjustedScore, 30);
      }
      if (verificationResults.deepfakeScore && verificationResults.deepfakeScore > 0.7) {
        adjustedScore = Math.min(adjustedScore, 20);
      }

      return {
        ...result,
        score: adjustedScore,
        details: enhancedDetails,
      };
    } catch (error) {
      console.warn("Verification enhancement failed:", error);
      return result; // Return original result if verification fails
    }
  }

  private generateFallbackAnalysis(content: string): AnalysisResult {
    return {
      score: 50,
      status: "Questionable",
      summary: "Unable to complete full AI analysis. Please verify this content manually using trusted sources like factcheck.org, altnews.in, or snopes.com.",
      details: [
        {
          section: "Analysis Status",
          status: "Caution",
          finding: "Automated analysis services are currently unavailable. Manual verification recommended.",
          proof: [
            {
              url: "https://factcheck.org",
              source: "FactCheck.org",
            },
            {
              url: "https://altnews.in",
              source: "Alt News",
            },
          ],
        },
      ],
      claims: [],
      processingTime: 100,
      aiModel: "Fallback Analysis",
    };
  }
}

export const analysisService = new AnalysisService();
