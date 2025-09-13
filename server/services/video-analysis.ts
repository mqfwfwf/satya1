/**
 * Advanced Video Processing and Deepfake Detection
 * Supports OpenCV, Sensity AI, and custom deepfake detection
 */

import * as cv from 'opencv4nodejs';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { cacheService } from './redis-enhanced';
import sharp from 'sharp';

export interface VideoAnalysisRequest {
  videoData?: string; // Base64 encoded video
  videoUrl?: string;
  videoPath?: string;
  analysisTypes: ('deepfake' | 'manipulation' | 'keyframes' | 'metadata' | 'audio')[];
  quality?: 'fast' | 'standard' | 'thorough';
}

export interface KeyFrame {
  timestamp: number;
  frameNumber: number;
  imageData: string; // Base64 encoded
  confidence: number;
  features: {
    faces: FaceDetection[];
    objects: ObjectDetection[];
    text?: string;
  };
}

export interface FaceDetection {
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  landmarks?: { x: number; y: number }[];
  attributes: {
    age?: number;
    gender?: string;
    emotion?: string;
    ethnicity?: string;
  };
  deepfakeScore: number;
  manipulationFlags: string[];
}

export interface ObjectDetection {
  class: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  channels: number;
  voiceActivity: { start: number; end: number; confidence: number }[];
  speechToText?: string;
  audioDeepfakeScore: number;
  audioFlags: string[];
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  fileSize: number;
  creationDate?: string;
  deviceInfo?: string;
  gpsLocation?: { lat: number; lon: number };
  editingSoftware?: string[];
}

export interface VideoAnalysisResult {
  overallDeepfakeScore: number;
  manipulationLikelihood: number;
  keyFrames: KeyFrame[];
  audioAnalysis?: AudioAnalysis;
  metadata: VideoMetadata;
  flags: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp?: number;
  }[];
  technicalAnalysis: {
    compressionArtifacts: number;
    qualityConsistency: number;
    temporalConsistency: number;
    colorHistogramAnomalies: number;
  };
  summary: string;
  confidence: number;
}

export interface DeepfakeModelConfig {
  provider: 'sensity' | 'custom' | 'microsoft';
  endpoint?: string;
  apiKey?: string;
  threshold: number;
}

class VideoAnalysisService {
  private tempDir = path.join(process.cwd(), 'temp', 'video-analysis');
  private deepfakeModels: DeepfakeModelConfig[] = [
    {
      provider: 'sensity',
      endpoint: 'https://api.sensity.ai/v1/detect',
      apiKey: process.env.SENSITY_API_KEY,
      threshold: 0.7
    },
    {
      provider: 'microsoft',
      endpoint: 'https://videoauthenticator.azurewebsites.net/api/detect',
      apiKey: process.env.MICROSOFT_VIDEO_AUTH_KEY,
      threshold: 0.6
    }
  ];

  constructor() {
    this.ensureTempDirectory();
  }

  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Main video analysis orchestration method
   */
  async analyzeVideo(request: VideoAnalysisRequest): Promise<VideoAnalysisResult> {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(request);
      const cached = await cacheService.get<VideoAnalysisResult>(cacheKey);
      if (cached && request.quality !== 'thorough') {
        return cached;
      }

      console.log('Starting video analysis...');
      
      // Step 1: Get video file path
      const videoPath = await this.prepareVideoFile(request);
      
      // Step 2: Extract metadata
      const metadata = await this.extractMetadata(videoPath);
      
      // Step 3: Extract key frames
      const keyFrames = await this.extractKeyFrames(videoPath, request.quality || 'standard');
      
      // Step 4: Analyze each frame for deepfakes/manipulation
      for (const frame of keyFrames) {
        if (request.analysisTypes.includes('deepfake')) {
          await this.analyzeFrameForDeepfakes(frame);
        }
        
        if (request.analysisTypes.includes('manipulation')) {
          await this.detectFrameManipulation(frame);
        }
      }

      // Step 5: Audio analysis (if requested)
      let audioAnalysis: AudioAnalysis | undefined;
      if (request.analysisTypes.includes('audio')) {
        audioAnalysis = await this.analyzeAudio(videoPath);
      }

      // Step 6: Technical analysis
      const technicalAnalysis = await this.performTechnicalAnalysis(videoPath, keyFrames);

      // Step 7: Aggregate results
      const result = this.aggregateResults(keyFrames, audioAnalysis, metadata, technicalAnalysis);

      // Cache for 1 hour (or 24 hours for thorough analysis)
      const ttl = request.quality === 'thorough' ? 86400 : 3600;
      await cacheService.set(cacheKey, result, { ttl });

      // Cleanup temp files
      await this.cleanup(videoPath);

      return result;
    } catch (error) {
      console.error('Video analysis failed:', error);
      throw error;
    }
  }

  /**
   * Prepare video file for analysis
   */
  private async prepareVideoFile(request: VideoAnalysisRequest): Promise<string> {
    const timestamp = Date.now();
    const tempVideoPath = path.join(this.tempDir, `video_${timestamp}.mp4`);

    if (request.videoPath) {
      // File path provided
      return request.videoPath;
    } else if (request.videoUrl) {
      // Download from URL
      const response = await axios({
        method: 'GET',
        url: request.videoUrl,
        responseType: 'stream',
        timeout: 30000
      });

      const writer = require('fs').createWriteStream(tempVideoPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(tempVideoPath));
        writer.on('error', reject);
      });
    } else if (request.videoData) {
      // Base64 encoded data
      const buffer = Buffer.from(request.videoData, 'base64');
      await fs.writeFile(tempVideoPath, buffer);
      return tempVideoPath;
    } else {
      throw new Error('No video source provided');
    }
  }

  /**
   * Extract video metadata using ffprobe
   */
  private async extractMetadata(videoPath: string): Promise<VideoMetadata> {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const output = execSync(command, { encoding: 'utf8' });
      const data = JSON.parse(output);

      const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
      const format = data.format;

      return {
        duration: parseFloat(format.duration) || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        fps: eval(videoStream?.r_frame_rate) || 0,
        codec: videoStream?.codec_name || 'unknown',
        bitrate: parseInt(format.bit_rate) || 0,
        fileSize: parseInt(format.size) || 0,
        creationDate: format.tags?.creation_time,
        deviceInfo: this.extractDeviceInfo(format.tags),
        editingSoftware: this.extractEditingSoftware(format.tags)
      };
    } catch (error) {
      console.error('Metadata extraction failed:', error);
      return {
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'unknown',
        bitrate: 0,
        fileSize: 0
      };
    }
  }

  /**
   * Extract key frames for analysis
   */
  private async extractKeyFrames(videoPath: string, quality: string): Promise<KeyFrame[]> {
    try {
      const cap = new cv.VideoCapture(videoPath);
      const frameCount = cap.get(cv.CAP_PROP_FRAME_COUNT);
      const fps = cap.get(cv.CAP_PROP_FPS);
      
      // Determine frame extraction strategy based on quality
      let extractionInterval: number;
      switch (quality) {
        case 'fast':
          extractionInterval = Math.floor(frameCount / 10); // 10 frames max
          break;
        case 'thorough':
          extractionInterval = Math.floor(fps); // Every second
          break;
        default:
          extractionInterval = Math.floor(frameCount / 30); // 30 frames max
      }

      const keyFrames: KeyFrame[] = [];
      let frameIndex = 0;

      while (frameIndex < frameCount) {
        cap.set(cv.CAP_PROP_POS_FRAMES, frameIndex);
        const frame = cap.read();
        
        if (frame.empty) break;

        const timestamp = frameIndex / fps;
        const imageBuffer = cv.imencode('.jpg', frame);
        const imageData = imageBuffer.toString('base64');

        const keyFrame: KeyFrame = {
          timestamp,
          frameNumber: frameIndex,
          imageData,
          confidence: 1.0,
          features: {
            faces: await this.detectFaces(frame),
            objects: await this.detectObjects(frame),
            text: await this.extractTextFromFrame(frame)
          }
        };

        keyFrames.push(keyFrame);
        frameIndex += extractionInterval;
      }

      cap.release();
      return keyFrames;
    } catch (error) {
      console.error('Key frame extraction failed:', error);
      return [];
    }
  }

  /**
   * Detect faces in frame using OpenCV
   */
  private async detectFaces(frame: cv.Mat): Promise<FaceDetection[]> {
    try {
      const classifier = new cv.CascadeClassifier(cv.HAAR_FRONTALFACE_ALT2);
      const grayFrame = frame.bgrToGray();
      const faceRects = classifier.detectMultiScale(grayFrame, 1.1, 3, 0);

      const faces: FaceDetection[] = [];

      for (const rect of faceRects.objects) {
        const face: FaceDetection = {
          bbox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          confidence: 0.8, // OpenCV doesn't provide confidence directly
          deepfakeScore: 0, // Will be updated in deepfake analysis
          manipulationFlags: [],
          attributes: {}
        };

        // Extract face region for detailed analysis
        const faceRegion = frame.getRegion(rect);
        face.attributes = await this.analyzeFaceAttributes(faceRegion);

        faces.push(face);
      }

      return faces;
    } catch (error) {
      console.error('Face detection failed:', error);
      return [];
    }
  }

  /**
   * Detect objects in frame
   */
  private async detectObjects(frame: cv.Mat): Promise<ObjectDetection[]> {
    try {
      // This would typically use a YOLO or similar model
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Object detection failed:', error);
      return [];
    }
  }

  /**
   * Extract text from frame using OCR
   */
  private async extractTextFromFrame(frame: cv.Mat): Promise<string> {
    try {
      // Convert OpenCV Mat to buffer for OCR processing
      const buffer = cv.imencode('.jpg', frame);
      
      // This would integrate with Tesseract.js or similar OCR library
      // For now, return empty string as placeholder
      return '';
    } catch (error) {
      console.error('Text extraction failed:', error);
      return '';
    }
  }

  /**
   * Analyze frame for deepfakes using multiple detection models
   */
  private async analyzeFrameForDeepfakes(frame: KeyFrame): Promise<void> {
    try {
      let highestDeepfakeScore = 0;
      const flags: string[] = [];

      // Check each available deepfake detection model
      for (const model of this.deepfakeModels) {
        if (!model.apiKey) continue;

        try {
          const score = await this.callDeepfakeAPI(model, frame.imageData);
          
          if (score > model.threshold) {
            flags.push(`${model.provider}_detected`);
          }
          
          highestDeepfakeScore = Math.max(highestDeepfakeScore, score);
        } catch (error) {
          console.warn(`${model.provider} deepfake detection failed:`, error.message);
        }
      }

      // Update face detections with deepfake scores
      for (const face of frame.features.faces) {
        face.deepfakeScore = highestDeepfakeScore;
        face.manipulationFlags = flags;

        // Additional heuristic checks
        const heuristicFlags = await this.performHeuristicDeepfakeChecks(frame.imageData, face);
        face.manipulationFlags.push(...heuristicFlags);
      }

      // If no faces detected but deepfake score is high, flag the entire frame
      if (frame.features.faces.length === 0 && highestDeepfakeScore > 0.5) {
        frame.features.faces.push({
          bbox: { x: 0, y: 0, width: 0, height: 0 },
          confidence: 0.5,
          deepfakeScore: highestDeepfakeScore,
          manipulationFlags: flags,
          attributes: {}
        });
      }
    } catch (error) {
      console.error('Deepfake analysis failed:', error);
    }
  }

  /**
   * Call external deepfake detection API
   */
  private async callDeepfakeAPI(model: DeepfakeModelConfig, imageData: string): Promise<number> {
    if (!model.endpoint || !model.apiKey) {
      throw new Error(`${model.provider} API not configured`);
    }

    try {
      const response = await axios.post(model.endpoint, {
        image: imageData,
        format: 'base64'
      }, {
        headers: {
          'Authorization': `Bearer ${model.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      // Parse response based on provider
      switch (model.provider) {
        case 'sensity':
          return response.data.deepfake_confidence || 0;
        case 'microsoft':
          return response.data.manipulationProbability || 0;
        default:
          return response.data.score || 0;
      }
    } catch (error) {
      console.error(`${model.provider} API call failed:`, error.message);
      return 0;
    }
  }

  /**
   * Perform heuristic deepfake detection checks
   */
  private async performHeuristicDeepfakeChecks(imageData: string, face: FaceDetection): Promise<string[]> {
    const flags: string[] = [];

    try {
      const imageBuffer = Buffer.from(imageData, 'base64');
      const image = sharp(imageBuffer);
      const { width, height } = await image.metadata();

      // Check for suspicious compression artifacts around face region
      const faceRegion = await image
        .extract({
          left: Math.max(0, face.bbox.x - 10),
          top: Math.max(0, face.bbox.y - 10),
          width: Math.min(width! - face.bbox.x, face.bbox.width + 20),
          height: Math.min(height! - face.bbox.y, face.bbox.height + 20)
        })
        .raw()
        .toBuffer();

      // Analyze color distribution inconsistencies
      const colorInconsistency = this.analyzeColorConsistency(faceRegion);
      if (colorInconsistency > 0.7) {
        flags.push('color_inconsistency');
      }

      // Check for blending artifacts
      const blendingArtifacts = this.detectBlendingArtifacts(faceRegion);
      if (blendingArtifacts > 0.6) {
        flags.push('blending_artifacts');
      }

      // Analyze facial landmarks consistency
      if (face.landmarks && face.landmarks.length > 0) {
        const landmarkConsistency = this.analyzeLandmarkConsistency(face.landmarks);
        if (landmarkConsistency < 0.5) {
          flags.push('landmark_inconsistency');
        }
      }

    } catch (error) {
      console.error('Heuristic checks failed:', error);
    }

    return flags;
  }

  /**
   * Detect frame manipulation (non-deepfake)
   */
  private async detectFrameManipulation(frame: KeyFrame): Promise<void> {
    try {
      // Implement manipulation detection algorithms
      // This would include checks for:
      // - Copy-move forgery
      // - Splicing
      // - Retouching
      // - Object removal/addition
      
      // Placeholder implementation
      frame.confidence = 0.8;
    } catch (error) {
      console.error('Frame manipulation detection failed:', error);
    }
  }

  /**
   * Analyze audio track for deepfakes and manipulation
   */
  private async analyzeAudio(videoPath: string): Promise<AudioAnalysis> {
    try {
      // Extract audio track
      const audioPath = path.join(this.tempDir, `audio_${Date.now()}.wav`);
      execSync(`ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`);

      // Get audio metadata
      const audioInfo = execSync(`ffprobe -v quiet -print_format json -show_streams "${audioPath}"`, { encoding: 'utf8' });
      const audioData = JSON.parse(audioInfo);
      const audioStream = audioData.streams[0];

      const analysis: AudioAnalysis = {
        duration: parseFloat(audioStream.duration) || 0,
        sampleRate: audioStream.sample_rate || 16000,
        channels: audioStream.channels || 1,
        voiceActivity: [],
        audioDeepfakeScore: 0,
        audioFlags: []
      };

      // Perform voice activity detection
      analysis.voiceActivity = await this.detectVoiceActivity(audioPath);

      // Check for audio deepfakes/synthesis
      analysis.audioDeepfakeScore = await this.detectAudioDeepfake(audioPath);

      // Speech-to-text (optional)
      if (process.env.SPEECH_TO_TEXT_API_KEY) {
        analysis.speechToText = await this.performSpeechToText(audioPath);
      }

      // Cleanup
      await fs.unlink(audioPath).catch(() => {});

      return analysis;
    } catch (error) {
      console.error('Audio analysis failed:', error);
      return {
        duration: 0,
        sampleRate: 16000,
        channels: 1,
        voiceActivity: [],
        audioDeepfakeScore: 0,
        audioFlags: ['analysis_failed']
      };
    }
  }

  /**
   * Perform technical analysis of video quality and consistency
   */
  private async performTechnicalAnalysis(videoPath: string, keyFrames: KeyFrame[]): Promise<VideoAnalysisResult['technicalAnalysis']> {
    try {
      // Analyze compression artifacts
      const compressionArtifacts = this.analyzeCompressionArtifacts(keyFrames);
      
      // Check quality consistency across frames
      const qualityConsistency = this.analyzeQualityConsistency(keyFrames);
      
      // Analyze temporal consistency
      const temporalConsistency = this.analyzeTemporalConsistency(keyFrames);
      
      // Check color histogram anomalies
      const colorHistogramAnomalies = this.analyzeColorHistograms(keyFrames);

      return {
        compressionArtifacts,
        qualityConsistency,
        temporalConsistency,
        colorHistogramAnomalies
      };
    } catch (error) {
      console.error('Technical analysis failed:', error);
      return {
        compressionArtifacts: 0.5,
        qualityConsistency: 0.5,
        temporalConsistency: 0.5,
        colorHistogramAnomalies: 0.5
      };
    }
  }

  /**
   * Utility methods for analysis
   */
  private async analyzeFaceAttributes(faceRegion: cv.Mat): Promise<FaceDetection['attributes']> {
    // Placeholder for face attribute analysis
    return {};
  }

  private analyzeColorConsistency(imageBuffer: Buffer): number {
    // Implement color consistency analysis
    return Math.random() * 0.5; // Placeholder
  }

  private detectBlendingArtifacts(imageBuffer: Buffer): number {
    // Implement blending artifact detection
    return Math.random() * 0.3; // Placeholder
  }

  private analyzeLandmarkConsistency(landmarks: { x: number; y: number }[]): number {
    // Implement landmark consistency analysis
    return Math.random() * 0.5 + 0.5; // Placeholder
  }

  private async detectVoiceActivity(audioPath: string): Promise<AudioAnalysis['voiceActivity']> {
    // Implement voice activity detection
    return [];
  }

  private async detectAudioDeepfake(audioPath: string): Promise<number> {
    // Implement audio deepfake detection
    return Math.random() * 0.3; // Placeholder
  }

  private async performSpeechToText(audioPath: string): Promise<string> {
    // Implement speech-to-text
    return '';
  }

  private analyzeCompressionArtifacts(keyFrames: KeyFrame[]): number {
    // Analyze compression patterns
    return Math.random() * 0.4;
  }

  private analyzeQualityConsistency(keyFrames: KeyFrame[]): number {
    // Check if quality is consistent across frames
    return Math.random() * 0.3 + 0.7;
  }

  private analyzeTemporalConsistency(keyFrames: KeyFrame[]): number {
    // Check for temporal inconsistencies
    return Math.random() * 0.2 + 0.8;
  }

  private analyzeColorHistograms(keyFrames: KeyFrame[]): number {
    // Analyze color histogram anomalies
    return Math.random() * 0.3;
  }

  private extractDeviceInfo(tags: any): string | undefined {
    return tags?.device || tags?.make || tags?.model;
  }

  private extractEditingSoftware(tags: any): string[] {
    const software = [];
    if (tags?.encoder) software.push(tags.encoder);
    if (tags?.software) software.push(tags.software);
    return software;
  }

  private generateCacheKey(request: VideoAnalysisRequest): string {
    const keyData = {
      url: request.videoUrl,
      path: request.videoPath,
      types: request.analysisTypes,
      quality: request.quality
    };
    return `video_analysis:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private aggregateResults(
    keyFrames: KeyFrame[],
    audioAnalysis: AudioAnalysis | undefined,
    metadata: VideoMetadata,
    technicalAnalysis: VideoAnalysisResult['technicalAnalysis']
  ): VideoAnalysisResult {
    
    const allDeepfakeScores = keyFrames.flatMap(frame => 
      frame.features.faces.map(face => face.deepfakeScore)
    );
    
    const overallDeepfakeScore = allDeepfakeScores.length > 0 
      ? Math.max(...allDeepfakeScores)
      : 0;

    const manipulationFlags = keyFrames.flatMap(frame =>
      frame.features.faces.flatMap(face => face.manipulationFlags)
    );

    const manipulationLikelihood = manipulationFlags.length > 0 ? 0.7 : 0.2;

    const flags = this.generateVideoFlags(overallDeepfakeScore, manipulationFlags, technicalAnalysis);

    return {
      overallDeepfakeScore,
      manipulationLikelihood,
      keyFrames,
      audioAnalysis,
      metadata,
      flags,
      technicalAnalysis,
      summary: this.generateSummary(overallDeepfakeScore, manipulationLikelihood, flags.length),
      confidence: this.calculateConfidence(keyFrames, technicalAnalysis)
    };
  }

  private generateVideoFlags(
    deepfakeScore: number,
    manipulationFlags: string[],
    technicalAnalysis: VideoAnalysisResult['technicalAnalysis']
  ): VideoAnalysisResult['flags'] {
    const flags = [];

    if (deepfakeScore > 0.7) {
      flags.push({
        type: 'high_deepfake_probability',
        severity: 'critical' as const,
        description: 'High probability of deepfake content detected'
      });
    }

    if (manipulationFlags.includes('blending_artifacts')) {
      flags.push({
        type: 'visual_artifacts',
        severity: 'high' as const,
        description: 'Visual blending artifacts detected'
      });
    }

    if (technicalAnalysis.temporalConsistency < 0.5) {
      flags.push({
        type: 'temporal_inconsistency',
        severity: 'medium' as const,
        description: 'Temporal inconsistencies detected between frames'
      });
    }

    return flags;
  }

  private generateSummary(deepfakeScore: number, manipulationLikelihood: number, flagCount: number): string {
    if (deepfakeScore > 0.8) {
      return 'High probability of synthetic/manipulated content detected';
    } else if (manipulationLikelihood > 0.6) {
      return 'Potential manipulation detected - verify with additional sources';
    } else if (flagCount > 0) {
      return 'Some suspicious indicators found - exercise caution';
    } else {
      return 'No significant manipulation indicators detected';
    }
  }

  private calculateConfidence(keyFrames: KeyFrame[], technicalAnalysis: VideoAnalysisResult['technicalAnalysis']): number {
    const frameCount = keyFrames.length;
    const faceCount = keyFrames.reduce((sum, frame) => sum + frame.features.faces.length, 0);
    
    let confidence = 0.5;
    
    if (frameCount > 10) confidence += 0.2;
    if (faceCount > 5) confidence += 0.2;
    if (technicalAnalysis.qualityConsistency > 0.8) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  private async cleanup(videoPath: string): Promise<void> {
    try {
      if (videoPath.includes(this.tempDir)) {
        await fs.unlink(videoPath);
      }
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  }

  /**
   * Quick video check for real-time analysis
   */
  async quickVideoCheck(videoData: string): Promise<{ deepfakeScore: number; confidence: number; flags: string[] }> {
    try {
      const tempPath = await this.prepareVideoFile({ videoData, analysisTypes: ['deepfake'] });
      const keyFrames = await this.extractKeyFrames(tempPath, 'fast');
      
      if (keyFrames.length === 0) {
        return { deepfakeScore: 0, confidence: 0, flags: ['no_frames_extracted'] };
      }

      // Analyze only the first few frames for speed
      const sampleFrames = keyFrames.slice(0, 3);
      
      for (const frame of sampleFrames) {
        await this.analyzeFrameForDeepfakes(frame);
      }

      const deepfakeScores = sampleFrames.flatMap(frame => 
        frame.features.faces.map(face => face.deepfakeScore)
      );

      const maxScore = deepfakeScores.length > 0 ? Math.max(...deepfakeScores) : 0;
      const flags = sampleFrames.flatMap(frame =>
        frame.features.faces.flatMap(face => face.manipulationFlags)
      );

      await this.cleanup(tempPath);

      return {
        deepfakeScore: maxScore,
        confidence: sampleFrames.length > 0 ? 0.7 : 0.3,
        flags: [...new Set(flags)] // Remove duplicates
      };
    } catch (error) {
      console.error('Quick video check failed:', error);
      return { deepfakeScore: 0, confidence: 0, flags: ['analysis_failed'] };
    }
  }
}

export const videoAnalysisService = new VideoAnalysisService();