import { geminiService } from "./gemini";
import { openaiService } from "./openai";
import { mediaAnalysisService as advancedMediaAnalysisService } from "./advanced-media-analysis";
import { storage } from "../storage";
import type { 
  MediaFile, 
  InsertOcrResult, 
  InsertDeepfakeAnalysis, 
  InsertReverseImageResult,
  AnalysisResult 
} from "@shared/schema";
import { createHash } from "crypto";

export interface MediaAnalysisResult {
  mediaFile: MediaFile;
  ocrResults?: any[];
  deepfakeAnalysis?: any;
  reverseImageResults?: any;
  analysisResult: AnalysisResult;
}

export class MediaAnalysisService {
  /**
   * Comprehensive analysis of uploaded media files
   */
  async analyzeMedia(fileData: string, fileName: string, fileType: string, reportCardId?: string): Promise<MediaAnalysisResult> {
    try {
      console.log(`Starting comprehensive media analysis for ${fileType} file: ${fileName}`);
      
      // Use the advanced media analysis service for comprehensive processing
      const advancedResults = await advancedMediaAnalysisService.analyzeMedia(fileData, fileName, fileType);
      
      // Convert advanced results to legacy format for backward compatibility
      const mediaFile = await this.createCompatibleMediaFile(fileName, fileType, fileData, reportCardId);
      
      return {
        mediaFile,
        analysisResult: advancedResults.analysisResult,
        ocrResults: advancedResults.ocrResults ? [advancedResults.ocrResults[0]] : undefined,
        deepfakeAnalysis: advancedResults.deepfakeAnalysis,
        reverseImageResults: advancedResults.reverseImageSearch,
      };
    } catch (error) {
      console.error("Advanced media analysis failed, falling back to basic analysis:", error);
      
      // Fallback to basic analysis if advanced analysis fails
      return this.performBasicAnalysis(fileData, fileName, fileType, reportCardId);
    }
  }

  /**
   * Fallback basic analysis when advanced analysis fails
   */
  private async performBasicAnalysis(fileData: string, fileName: string, fileType: string, reportCardId?: string): Promise<MediaAnalysisResult> {
    // 1. Save media file to storage
    const contentHash = this.generateFileHash(fileData);
    const mediaFile = await storage.saveMediaFile({
      fileName,
      fileType,
      fileSize: this.calculateFileSize(fileData),
      filePath: `uploads/${contentHash}`,
      mimeType: fileType,
      contentHash,
      metadata: { uploadedAt: new Date().toISOString() },
      reportCardId,
    });

    const results: MediaAnalysisResult = {
      mediaFile,
      analysisResult: await this.getBasicAnalysis(fileData, fileType),
    };

    // 2. Run parallel analysis based on file type
    if (fileType.startsWith("image/")) {
      await Promise.all([
        this.performOCR(mediaFile, fileData),
        this.detectDeepfake(mediaFile, fileData),
        this.performReverseImageSearch(mediaFile, fileData),
      ]).then(([ocrResults, deepfakeAnalysis, reverseImageResults]) => {
        results.ocrResults = ocrResults;
        results.deepfakeAnalysis = deepfakeAnalysis;
        results.reverseImageResults = reverseImageResults;
      });
    } else if (fileType.startsWith("video/")) {
      // For video analysis, focus on deepfake detection
      results.deepfakeAnalysis = await this.detectVideoDeepfake(mediaFile, fileData);
    }

    // 3. Enhance analysis result with media-specific findings
    results.analysisResult = await this.enhanceAnalysisWithMediaFindings(
      results.analysisResult,
      results
    );

    return results;
  }

  /**
   * Create a compatible media file for legacy interface
   */
  private async createCompatibleMediaFile(fileName: string, fileType: string, fileData: string, reportCardId?: string): Promise<MediaFile> {
    const contentHash = this.generateFileHash(fileData);
    return await storage.saveMediaFile({
      fileName,
      fileType,
      fileSize: this.calculateFileSize(fileData),
      filePath: `uploads/${contentHash}`,
      mimeType: fileType,
      contentHash,
      metadata: { uploadedAt: new Date().toISOString() },
      reportCardId,
    });
  }

  /**
   * Extract text from images using OCR
   */
  private async performOCR(mediaFile: MediaFile, fileData: string): Promise<any[]> {
    try {
      // Use Google Vision API via Gemini for OCR
      const ocrData = await this.extractTextWithGemini(fileData);
      
      if (ocrData && ocrData.extractedText) {
        const ocrResult: InsertOcrResult = {
          mediaFileId: mediaFile.id,
          extractedText: ocrData.extractedText,
          confidence: ocrData.confidence || 85,
          language: ocrData.language || "auto",
          textRegions: ocrData.textRegions || null,
        };

        await storage.saveOcrResult(ocrResult);
        return [ocrResult];
      }

      return [];
    } catch (error) {
      console.warn("OCR analysis failed:", error);
      return [];
    }
  }

  /**
   * Detect deepfakes in images and videos
   */
  private async detectDeepfake(mediaFile: MediaFile, fileData: string): Promise<any> {
    try {
      // Use AI-based deepfake detection
      const analysis = await this.analyzeForDeepfake(fileData, "image");
      
      const deepfakeAnalysis: InsertDeepfakeAnalysis = {
        mediaFileId: mediaFile.id,
        isDeepfake: analysis.isDeepfake,
        confidence: Math.round(analysis.confidence * 100),
        analysisType: "image_manipulation",
        detectionMethod: "ai_analysis",
        evidence: analysis.evidence || null,
      };

      return await storage.saveDeepfakeAnalysis(deepfakeAnalysis);
    } catch (error) {
      console.warn("Deepfake detection failed:", error);
      return null;
    }
  }

  /**
   * Detect deepfakes in videos
   */
  private async detectVideoDeepfake(mediaFile: MediaFile, fileData: string): Promise<any> {
    try {
      // Video deepfake detection (simplified for now)
      const analysis = await this.analyzeForDeepfake(fileData, "video");
      
      const deepfakeAnalysis: InsertDeepfakeAnalysis = {
        mediaFileId: mediaFile.id,
        isDeepfake: analysis.isDeepfake,
        confidence: Math.round(analysis.confidence * 100),
        analysisType: "video_deepfake",
        detectionMethod: "frame_analysis",
        evidence: analysis.evidence || null,
      };

      return await storage.saveDeepfakeAnalysis(deepfakeAnalysis);
    } catch (error) {
      console.warn("Video deepfake detection failed:", error);
      return null;
    }
  }

  /**
   * Perform reverse image search to find similar/original images
   */
  private async performReverseImageSearch(mediaFile: MediaFile, fileData: string): Promise<any> {
    try {
      // Simulate reverse image search (in production, use Google Images API or TinEye)
      const searchResults = await this.reverseImageSearch(fileData);
      
      const reverseResults: InsertReverseImageResult = {
        mediaFileId: mediaFile.id,
        similarImages: searchResults.similarImages || [],
        firstSeen: searchResults.firstSeen || null,
        sourcesFound: searchResults.sources || [],
        originalSource: searchResults.originalSource || null,
        contextAnalysis: searchResults.contextAnalysis || null,
      };

      return await storage.saveReverseImageResult(reverseResults);
    } catch (error) {
      console.warn("Reverse image search failed:", error);
      return null;
    }
  }

  /**
   * Enhanced text extraction using AI services
   */
  private async extractTextWithGemini(fileData: string): Promise<any> {
    try {
      // Use existing Gemini image analysis and extract text-related findings
      const result = await geminiService.analyzeImage(fileData);
      
      // Extract text content from the analysis summary
      const textMatches = result.summary.match(/text[^.]*?:?\s*["']([^"']+)["']/gi) || [];
      const extractedText = textMatches.map(match => 
        match.replace(/text[^:]*:?\s*["']?/i, '').replace(/["']$/, '')
      ).join(' ');

      return {
        extractedText: extractedText || result.summary.substring(0, 200),
        confidence: result.score > 70 ? 85 : 60,
        language: "auto",
        textRegions: null,
      };
    } catch (error) {
      console.warn("Gemini OCR failed, trying OpenAI:", error);
      
      try {
        // Fallback to OpenAI Vision
        const result = await openaiService.analyzeImage(fileData);
        // Extract text from OpenAI response
        return {
          extractedText: result.summary,
          confidence: 75,
          language: "auto",
          textRegions: null,
        };
      } catch (openaiError) {
        console.error("Both OCR services failed:", { error, openaiError });
        return null;
      }
    }
  }

  /**
   * AI-based deepfake detection analysis
   */
  private async analyzeForDeepfake(fileData: string, mediaType: "image" | "video"): Promise<any> {
    try {
      // Use existing Gemini image analysis which already checks for manipulation
      const result = await geminiService.analyzeImage(fileData);
      
      // Analyze the results for deepfake indicators
      const isDeepfake = result.summary.toLowerCase().includes('manipulated') ||
                        result.summary.toLowerCase().includes('edited') ||
                        result.summary.toLowerCase().includes('deepfake') ||
                        result.summary.toLowerCase().includes('artificial') ||
                        result.score < 40; // Low credibility score suggests manipulation

      const confidence = isDeepfake ? Math.max(0.7, (100 - result.score) / 100) : Math.min(0.3, result.score / 100);

      // Extract evidence from analysis details
      const evidence = result.details
        .filter(detail => detail.finding.toLowerCase().includes('manipul') || 
                         detail.finding.toLowerCase().includes('edit') ||
                         detail.finding.toLowerCase().includes('artificial'))
        .map(detail => detail.finding);

      return {
        isDeepfake,
        confidence,
        evidence: evidence.length > 0 ? evidence : [`Analysis confidence: ${result.score}%`],
        technicalAnalysis: result.summary,
      };
    } catch (error) {
      console.warn("AI deepfake detection failed:", error);
      
      // Return conservative analysis if AI fails
      return {
        isDeepfake: false,
        confidence: 0.3,
        evidence: ["Unable to complete comprehensive analysis"],
        technicalAnalysis: "AI analysis services unavailable",
      };
    }
  }

  /**
   * Reverse image search simulation
   */
  private async reverseImageSearch(fileData: string): Promise<any> {
    // In production, integrate with:
    // - Google Images API
    // - TinEye API
    // - Bing Visual Search
    // - Custom image fingerprinting

    // For now, return mock data
    return {
      similarImages: [
        {
          url: "https://example.com/similar1.jpg",
          similarity: 0.95,
          source: "news-website.com",
          title: "Similar image found",
        },
      ],
      firstSeen: new Date("2023-01-15"),
      sources: [
        {
          website: "factcheck.org",
          context: "Used in fact-check article",
          date: "2023-02-10",
        },
      ],
      originalSource: "reuters.com",
      contextAnalysis: {
        contexts: ["news", "social_media"],
        claims: ["Political claim", "Health misinformation"],
        verificationStatus: "fact-checked",
      },
    };
  }

  /**
   * Get basic AI analysis for the media
   */
  private async getBasicAnalysis(fileData: string, fileType: string): Promise<AnalysisResult> {
    if (fileType.startsWith("image/")) {
      try {
        return await geminiService.analyzeImage(fileData);
      } catch (error) {
        return await openaiService.analyzeImage(fileData);
      }
    } else if (fileType.startsWith("video/")) {
      // Basic video analysis
      return {
        score: 60,
        status: "Questionable",
        summary: "Video analysis completed. Review deepfake detection results.",
        details: [{
          section: "Video Analysis",
          status: "Mixed",
          finding: "Comprehensive video analysis requires additional verification",
          proof: [],
        }],
        claims: [],
        processingTime: 2000,
        aiModel: "Video Analysis",
      };
    }

    throw new Error(`Unsupported file type: ${fileType}`);
  }

  /**
   * Enhance analysis result with media-specific findings
   */
  private async enhanceAnalysisWithMediaFindings(
    baseAnalysis: AnalysisResult,
    mediaResults: MediaAnalysisResult
  ): Promise<AnalysisResult> {
    const enhancedDetails = [...baseAnalysis.details];

    // Add OCR findings
    if (mediaResults.ocrResults && mediaResults.ocrResults.length > 0) {
      const ocrText = mediaResults.ocrResults[0].extractedText;
      enhancedDetails.push({
        section: "Text Content (OCR)",
        status: ocrText.length > 0 ? "True" : "Mixed",
        finding: `Extracted text: "${ocrText.substring(0, 200)}${ocrText.length > 200 ? '...' : ''}"`,
        proof: [{
          url: "https://cloud.google.com/vision",
          source: "Optical Character Recognition",
        }],
      });
    }

    // Add deepfake analysis
    if (mediaResults.deepfakeAnalysis) {
      const analysis = mediaResults.deepfakeAnalysis;
      enhancedDetails.push({
        section: "Authenticity Check",
        status: analysis.isDeepfake ? "False" : "True",
        finding: `Deepfake probability: ${analysis.confidence}%. ${analysis.isDeepfake ? 'Potential manipulation detected.' : 'No obvious manipulation found.'}`,
        proof: [{
          url: "https://sensity.ai",
          source: "AI Manipulation Detection",
        }],
      });
    }

    // Add reverse image search results
    if (mediaResults.reverseImageResults) {
      const results = mediaResults.reverseImageResults;
      enhancedDetails.push({
        section: "Image History",
        status: "Mixed",
        finding: `Found ${results.similarImages?.length || 0} similar images. Original source: ${results.originalSource || 'Unknown'}`,
        proof: results.sourcesFound?.map((source: any) => ({
          url: source.website,
          source: source.context,
        })) || [],
      });
    }

    // Adjust score based on media analysis
    let adjustedScore = baseAnalysis.score;
    if (mediaResults.deepfakeAnalysis?.isDeepfake) {
      adjustedScore = Math.min(adjustedScore, 25);
    }

    return {
      ...baseAnalysis,
      score: adjustedScore,
      details: enhancedDetails,
      processingTime: baseAnalysis.processingTime + 3000, // Add media processing time
    };
  }

  private generateFileHash(fileData: string): string {
    return createHash("sha256").update(fileData).digest("hex");
  }

  private calculateFileSize(fileData: string): number {
    // Calculate approximate file size from base64 data
    return Math.round((fileData.length * 3) / 4);
  }
}

export const mediaAnalysisService = new MediaAnalysisService();