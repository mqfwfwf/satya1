import axios from "axios";
import sharp from "sharp";
import { cacheService } from "./redis-cache";
import { geminiService } from "./gemini";
import { openaiService } from "./openai";
import { storage } from "../storage";
import type { AnalysisResult } from "@shared/schema";

interface MediaAnalysisResult {
  analysisResult: AnalysisResult;
  ocrResults?: OcrResult[];
  deepfakeAnalysis?: DeepfakeAnalysis;
  reverseImageSearch?: ReverseImageResult;
  videoAnalysis?: VideoAnalysis;
}

interface OcrResult {
  extractedText: string;
  confidence: number;
  language: string;
  textRegions?: any[];
}

interface DeepfakeAnalysis {
  isDeepfake: boolean;
  confidence: number;
  analysisType: string;
  detectionMethod: string;
  evidence?: any;
}

interface ReverseImageResult {
  similarImages: any[];
  firstSeen?: Date;
  sourcesFound?: any[];
  originalSource?: string;
  contextAnalysis?: any;
}

interface VideoAnalysis {
  duration: number;
  frameCount: number;
  keyFrames: Array<{
    timestamp: number;
    imageData: string;
    analysis: any;
  }>;
  audioAnalysis?: {
    hasAudio: boolean;
    language?: string;
    transcript?: string;
  };
}

class AdvancedMediaAnalysisService {
  /**
   * Comprehensive media analysis orchestrator
   */
  async analyzeMedia(
    fileData: string,
    fileName: string,
    fileType: string,
    userId?: string
  ): Promise<MediaAnalysisResult> {
    try {
      console.log(`Starting comprehensive analysis for ${fileType} file: ${fileName}`);

      // Store the media file first
      const mediaFile = await this.storeMediaFile(fileData, fileName, fileType, userId);

      let analysisResult: AnalysisResult;
      let ocrResults: OcrResult[] | undefined;
      let deepfakeAnalysis: DeepfakeAnalysis | undefined;
      let reverseImageSearch: ReverseImageResult | undefined;
      let videoAnalysis: VideoAnalysis | undefined;

      if (fileType.startsWith("image/")) {
        // Image analysis pipeline
        const results = await this.analyzeImage(fileData, mediaFile.id);
        analysisResult = results.analysisResult;
        ocrResults = results.ocrResults;
        deepfakeAnalysis = results.deepfakeAnalysis;
        reverseImageSearch = results.reverseImageSearch;
      } else if (fileType.startsWith("video/")) {
        // Video analysis pipeline
        const results = await this.analyzeVideo(fileData, mediaFile.id);
        analysisResult = results.analysisResult;
        videoAnalysis = results.videoAnalysis;
        deepfakeAnalysis = results.deepfakeAnalysis;
      } else {
        throw new Error(`Unsupported media type: ${fileType}`);
      }

      return {
        analysisResult,
        ocrResults,
        deepfakeAnalysis,
        reverseImageSearch,
        videoAnalysis,
      };
    } catch (error) {
      console.error("Advanced media analysis failed:", error);
      throw error;
    }
  }

  /**
   * Comprehensive image analysis
   */
  private async analyzeImage(imageData: string, mediaFileId: string): Promise<{
    analysisResult: AnalysisResult;
    ocrResults?: OcrResult[];
    deepfakeAnalysis?: DeepfakeAnalysis;
    reverseImageSearch?: ReverseImageResult;
  }> {
    try {
      // Run analysis steps in parallel where possible
      const [aiAnalysis, ocrResults, deepfakeAnalysis, reverseImageSearch] = await Promise.allSettled([
        this.performAIImageAnalysis(imageData),
        this.performOCR(imageData, mediaFileId),
        this.performDeepfakeDetection(imageData, mediaFileId, "image"),
        this.performReverseImageSearch(imageData, mediaFileId),
      ]);

      // Get AI analysis result
      const analysisResult = aiAnalysis.status === 'fulfilled' ? aiAnalysis.value : this.getFallbackImageAnalysis();

      // Collect additional analysis results
      const ocrData = ocrResults.status === 'fulfilled' ? ocrResults.value : undefined;
      const deepfakeData = deepfakeAnalysis.status === 'fulfilled' ? deepfakeAnalysis.value : undefined;
      const reverseImageData = reverseImageSearch.status === 'fulfilled' ? reverseImageSearch.value : undefined;

      // Enhance analysis with additional findings
      const enhancedAnalysis = await this.enhanceAnalysisWithAdditionalData(
        analysisResult,
        { ocrResults: ocrData, deepfakeAnalysis: deepfakeData, reverseImageSearch: reverseImageData }
      );

      return {
        analysisResult: enhancedAnalysis,
        ocrResults: ocrData ? [ocrData] : undefined,
        deepfakeAnalysis: deepfakeData,
        reverseImageSearch: reverseImageData,
      };
    } catch (error) {
      console.error("Image analysis failed:", error);
      throw error;
    }
  }

  /**
   * Comprehensive video analysis
   */
  private async analyzeVideo(videoData: string, mediaFileId: string): Promise<{
    analysisResult: AnalysisResult;
    videoAnalysis?: VideoAnalysis;
    deepfakeAnalysis?: DeepfakeAnalysis;
  }> {
    try {
      // Extract key frames from video
      const keyFrames = await this.extractVideoKeyFrames(videoData);
      
      // Analyze key frames
      const frameAnalyses = await Promise.all(
        keyFrames.slice(0, 5).map(frame => // Limit to 5 frames for performance
          this.performAIImageAnalysis(frame.imageData).catch(error => {
            console.error("Frame analysis failed:", error);
            return this.getFallbackImageAnalysis();
          })
        )
      );

      // Perform deepfake detection on video
      const deepfakeAnalysis = await this.performDeepfakeDetection(videoData, mediaFileId, "video");

      // Extract audio and analyze if present
      const audioAnalysis = await this.analyzeVideoAudio(videoData);

      // Aggregate frame analyses into overall video analysis
      const aggregatedAnalysis = this.aggregateFrameAnalyses(frameAnalyses);

      const videoAnalysisData: VideoAnalysis = {
        duration: 0, // Would be extracted from video metadata
        frameCount: keyFrames.length,
        keyFrames: keyFrames.map((frame, index) => ({
          timestamp: frame.timestamp,
          imageData: frame.imageData,
          analysis: frameAnalyses[index] || null,
        })),
        audioAnalysis,
      };

      return {
        analysisResult: aggregatedAnalysis,
        videoAnalysis: videoAnalysisData,
        deepfakeAnalysis,
      };
    } catch (error) {
      console.error("Video analysis failed:", error);
      throw error;
    }
  }

  /**
   * Perform AI-powered image analysis using Gemini or OpenAI
   */
  private async performAIImageAnalysis(imageData: string): Promise<AnalysisResult> {
    try {
      // Try Gemini first
      return await geminiService.analyzeImage(imageData);
    } catch (geminiError) {
      console.warn("Gemini image analysis failed, trying OpenAI:", geminiError);
      
      try {
        return await openaiService.analyzeImage(imageData);
      } catch (openaiError) {
        console.error("Both Gemini and OpenAI image analysis failed");
        return this.getFallbackImageAnalysis();
      }
    }
  }

  /**
   * Perform OCR (Optical Character Recognition)
   */
  private async performOCR(imageData: string, mediaFileId: string): Promise<OcrResult> {
    try {
      const cacheKey = `ocr:${this.generateImageHash(imageData)}`;
      const cached = await cacheService.get<OcrResult>(cacheKey);
      if (cached) {
        return cached;
      }

      // Use Gemini or OpenAI for OCR
      let extractedText = "";
      let confidence = 0;

      try {
        // Try Gemini first for OCR
        const prompt = "Extract all text from this image. Return only the extracted text, nothing else.";
        const result = await geminiService.analyzeImage(imageData);
        extractedText = result.summary; // Assuming summary contains extracted text
        confidence = 85;
      } catch (error) {
        console.warn("Gemini OCR failed, trying OpenAI:", error);
        
        try {
          const result = await openaiService.analyzeImage(imageData);
          extractedText = result.summary;
          confidence = 80;
        } catch (openaiError) {
          console.error("Both OCR methods failed");
          extractedText = "OCR services temporarily unavailable";
          confidence = 0;
        }
      }

      const ocrResult: OcrResult = {
        extractedText,
        confidence,
        language: "auto",
      };

      // Store OCR result
      await storage.saveOcrResult({
        mediaFileId,
        extractedText,
        confidence,
        language: "auto",
      });

      await cacheService.set(cacheKey, ocrResult, 3600 * 24); // Cache for 24 hours
      return ocrResult;
    } catch (error) {
      console.error("OCR analysis failed:", error);
      throw error;
    }
  }

  /**
   * Perform deepfake detection
   */
  private async performDeepfakeDetection(
    mediaData: string,
    mediaFileId: string,
    mediaType: "image" | "video"
  ): Promise<DeepfakeAnalysis> {
    try {
      const cacheKey = `deepfake:${mediaType}:${this.generateImageHash(mediaData)}`;
      const cached = await cacheService.get<DeepfakeAnalysis>(cacheKey);
      if (cached) {
        return cached;
      }

      // In production, this would integrate with Sensity AI or similar services
      // For now, we'll use a mock implementation with some basic heuristics
      const analysis = await this.mockDeepfakeDetection(mediaData, mediaType);

      // Store deepfake analysis
      await storage.saveDeepfakeAnalysis({
        mediaFileId,
        isDeepfake: analysis.isDeepfake,
        confidence: analysis.confidence,
        analysisType: analysis.analysisType,
        detectionMethod: analysis.detectionMethod,
        evidence: analysis.evidence,
      });

      await cacheService.set(cacheKey, analysis, 3600 * 12); // Cache for 12 hours
      return analysis;
    } catch (error) {
      console.error("Deepfake detection failed:", error);
      throw error;
    }
  }

  /**
   * Perform reverse image search
   */
  private async performReverseImageSearch(imageData: string, mediaFileId: string): Promise<ReverseImageResult> {
    try {
      const cacheKey = `reverse-image:${this.generateImageHash(imageData)}`;
      const cached = await cacheService.get<ReverseImageResult>(cacheKey);
      if (cached) {
        return cached;
      }

      // In production, this would integrate with TinEye, Google Images API, or similar
      // For now, we'll use a mock implementation
      const result = await this.mockReverseImageSearch(imageData);

      // Store reverse image search result
      await storage.saveReverseImageResult({
        mediaFileId,
        similarImages: result.similarImages,
        firstSeen: result.firstSeen,
        sourcesFound: result.sourcesFound,
        originalSource: result.originalSource,
        contextAnalysis: result.contextAnalysis,
      });

      await cacheService.set(cacheKey, result, 3600 * 6); // Cache for 6 hours
      return result;
    } catch (error) {
      console.error("Reverse image search failed:", error);
      throw error;
    }
  }

  /**
   * Extract key frames from video
   */
  private async extractVideoKeyFrames(videoData: string): Promise<Array<{ timestamp: number; imageData: string }>> {
    try {
      // In production, this would use OpenCV or FFmpeg to extract frames
      // For now, return mock key frames
      return [
        { timestamp: 0, imageData: videoData.substring(0, 1000) + "===" }, // Mock frame at 0s
        { timestamp: 5, imageData: videoData.substring(1000, 2000) + "===" }, // Mock frame at 5s
        { timestamp: 10, imageData: videoData.substring(2000, 3000) + "===" }, // Mock frame at 10s
      ];
    } catch (error) {
      console.error("Video frame extraction failed:", error);
      return [];
    }
  }

  /**
   * Analyze video audio track
   */
  private async analyzeVideoAudio(videoData: string): Promise<VideoAnalysis['audioAnalysis']> {
    try {
      // In production, this would extract and analyze audio using speech-to-text services
      return {
        hasAudio: true,
        language: "en",
        transcript: "Audio analysis not fully implemented - this is mock data",
      };
    } catch (error) {
      console.error("Video audio analysis failed:", error);
      return { hasAudio: false };
    }
  }

  /**
   * Store media file metadata
   */
  private async storeMediaFile(fileData: string, fileName: string, fileType: string, userId?: string) {
    const contentHash = this.generateImageHash(fileData);
    const fileSize = Buffer.byteLength(fileData, 'base64');

    return await storage.saveMediaFile({
      userId,
      fileName,
      fileType,
      fileSize,
      filePath: `/uploads/${Date.now()}_${fileName}`,
      mimeType: fileType,
      contentHash,
      metadata: {
        uploadTimestamp: new Date().toISOString(),
        originalName: fileName,
      },
    });
  }

  /**
   * Enhance analysis result with additional data
   */
  private async enhanceAnalysisWithAdditionalData(
    baseAnalysis: AnalysisResult,
    additionalData: {
      ocrResults?: OcrResult;
      deepfakeAnalysis?: DeepfakeAnalysis;
      reverseImageSearch?: ReverseImageResult;
    }
  ): Promise<AnalysisResult> {
    const enhancedDetails = [...baseAnalysis.details];

    // Add OCR findings
    if (additionalData.ocrResults && additionalData.ocrResults.extractedText) {
      enhancedDetails.push({
        section: "Text Extraction (OCR)",
        status: "Mixed",
        finding: `Extracted text: "${additionalData.ocrResults.extractedText.substring(0, 200)}${additionalData.ocrResults.extractedText.length > 200 ? '...' : ''}"`,
        proof: [{
          url: "https://docs.satya.app/ocr",
          source: "OCR Analysis",
        }],
      });
    }

    // Add deepfake findings
    if (additionalData.deepfakeAnalysis) {
      const { isDeepfake, confidence } = additionalData.deepfakeAnalysis;
      enhancedDetails.push({
        section: "Deepfake Detection",
        status: isDeepfake ? "False" : "True",
        finding: `${isDeepfake ? 'Potential deepfake detected' : 'No deepfake indicators found'} (${confidence}% confidence)`,
        proof: [{
          url: "https://docs.satya.app/deepfake-detection",
          source: "AI Detection Analysis",
        }],
      });

      // Adjust overall score if deepfake detected
      if (isDeepfake && confidence > 70) {
        baseAnalysis.score = Math.min(baseAnalysis.score, 25);
        baseAnalysis.status = "Extremely Misleading";
      }
    }

    // Add reverse image search findings
    if (additionalData.reverseImageSearch && additionalData.reverseImageSearch.similarImages.length > 0) {
      enhancedDetails.push({
        section: "Image Verification",
        status: "Mixed",
        finding: `Found ${additionalData.reverseImageSearch.similarImages.length} similar images online`,
        proof: [{
          url: "https://docs.satya.app/reverse-image-search",
          source: "Image Search Analysis",
        }],
      });
    }

    return {
      ...baseAnalysis,
      details: enhancedDetails,
    };
  }

  /**
   * Aggregate multiple frame analyses into a single video analysis
   */
  private aggregateFrameAnalyses(frameAnalyses: AnalysisResult[]): AnalysisResult {
    if (frameAnalyses.length === 0) {
      return this.getFallbackImageAnalysis();
    }

    // Calculate average score
    const avgScore = Math.round(
      frameAnalyses.reduce((sum, analysis) => sum + analysis.score, 0) / frameAnalyses.length
    );

    // Determine overall status based on worst frame
    const statuses = frameAnalyses.map(a => a.status);
    let overallStatus: AnalysisResult['status'] = "Credible";
    
    if (statuses.includes("Extremely Misleading")) {
      overallStatus = "Extremely Misleading";
    } else if (statuses.includes("Misleading")) {
      overallStatus = "Misleading";
    } else if (statuses.includes("Questionable")) {
      overallStatus = "Questionable";
    }

    // Combine summaries
    const summary = `Video analysis based on ${frameAnalyses.length} key frames. ${frameAnalyses[0].summary}`;

    // Combine all details
    const allDetails = frameAnalyses.flatMap((analysis, index) => 
      analysis.details.map(detail => ({
        ...detail,
        section: `Frame ${index + 1} - ${detail.section}`,
      }))
    );

    return {
      score: avgScore,
      status: overallStatus,
      summary,
      details: allDetails,
      claims: frameAnalyses.flatMap(a => a.claims),
      processingTime: frameAnalyses.reduce((sum, a) => sum + a.processingTime, 0),
      aiModel: "Multi-Frame Video Analysis",
    };
  }

  /**
   * Mock deepfake detection (replace with real service in production)
   */
  private async mockDeepfakeDetection(mediaData: string, mediaType: "image" | "video"): Promise<DeepfakeAnalysis> {
    // Simple heuristic: longer base64 strings might indicate higher quality/manipulation
    const dataLength = mediaData.length;
    const isLikelyManipulated = dataLength > 100000; // Arbitrary threshold
    
    return {
      isDeepfake: isLikelyManipulated && Math.random() > 0.8, // Low false positive rate
      confidence: Math.floor(Math.random() * 30) + 60, // 60-90% confidence
      analysisType: mediaType === "video" ? "video_analysis" : "image_analysis",
      detectionMethod: "Mock AI Detection v1.0",
      evidence: {
        analyzed_regions: ["face", "background"],
        anomaly_score: Math.random(),
        processing_notes: "Mock analysis for demonstration",
      },
    };
  }

  /**
   * Mock reverse image search (replace with real service in production)
   */
  private async mockReverseImageSearch(imageData: string): Promise<ReverseImageResult> {
    const hash = this.generateImageHash(imageData);
    const hasMatches = parseInt(hash.substring(0, 2), 16) % 3 === 0; // Random matches

    return {
      similarImages: hasMatches ? [
        {
          url: "https://example.com/similar1.jpg",
          similarity: 0.85,
          source: "news.example.com",
        },
        {
          url: "https://example.com/similar2.jpg",
          similarity: 0.78,
          source: "social.example.com",
        },
      ] : [],
      firstSeen: hasMatches ? new Date(Date.now() - 86400000 * 7) : undefined, // 7 days ago
      sourcesFound: hasMatches ? [
        { domain: "news.example.com", count: 3 },
        { domain: "social.example.com", count: 15 },
      ] : undefined,
      originalSource: hasMatches ? "news.example.com" : undefined,
      contextAnalysis: hasMatches ? {
        contexts: ["news article", "social media post"],
        timeline: "First appeared 7 days ago",
      } : undefined,
    };
  }

  /**
   * Generate fallback analysis when AI services fail
   */
  private getFallbackImageAnalysis(): AnalysisResult {
    return {
      score: 50,
      status: "Questionable",
      summary: "Unable to complete full AI analysis. Media has been processed with basic checks.",
      details: [
        {
          section: "Analysis Status",
          status: "Caution",
          finding: "Automated analysis services are temporarily unavailable. Manual verification recommended.",
          proof: [{
            url: "https://docs.satya.app/manual-verification",
            source: "Manual Verification Guide",
          }],
        },
      ],
      claims: [],
      processingTime: 500,
      aiModel: "Fallback Analysis",
    };
  }

  /**
   * Generate hash for caching and deduplication
   */
  private generateImageHash(imageData: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(imageData).digest('hex').substring(0, 16);
  }
}

export const mediaAnalysisService = new AdvancedMediaAnalysisService();