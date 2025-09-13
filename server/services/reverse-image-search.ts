/**
 * Comprehensive Reverse Image Search Service
 * Integrates with TinEye, Google Images, Yandex, and custom implementations
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cacheService } from './redis-enhanced';
import sharp from 'sharp';
import { createHash } from 'crypto';

export interface ImageSearchResult {
  imageUrl: string;
  sourceUrl: string;
  title: string;
  snippet: string;
  publishDate?: string;
  domain: string;
  similarity: number;
  thumbnail?: string;
  dimensions?: { width: number; height: number };
  fileSize?: number;
}

export interface ReverseImageSearchResponse {
  query: {
    imageUrl?: string;
    imageHash: string;
    uploadTime: string;
  };
  results: {
    exact: ImageSearchResult[];
    similar: ImageSearchResult[];
    modified: ImageSearchResult[];
  };
  aggregatedResults: ImageSearchResult[];
  analysis: {
    totalMatches: number;
    oldestMatch?: ImageSearchResult;
    mostRecentMatch?: ImageSearchResult;
    topDomains: { domain: string; count: number }[];
    suspiciousIndicators: string[];
    credibilityScore: number;
  };
  searchEngines: {
    engine: string;
    status: 'success' | 'failed' | 'timeout';
    resultCount: number;
    responseTime: number;
  }[];
}

export interface ImageFingerprint {
  phash: string; // Perceptual hash
  dhash: string; // Difference hash  
  ahash: string; // Average hash
  whash: string; // Wavelet hash
  colorHistogram: number[];
  edgeFeatures: number[];
}

class ReverseImageSearchService {
  private searchEngines = {
    tineye: {
      endpoint: 'https://tineye.com/search',
      apiEndpoint: 'https://api.tineye.com/rest/search/',
      apiKey: process.env.TINEYE_API_KEY,
      enabled: !!process.env.TINEYE_API_KEY
    },
    google: {
      endpoint: 'https://images.google.com/searchbyimage',
      enabled: true
    },
    yandex: {
      endpoint: 'https://yandex.com/images/search',
      enabled: true
    },
    bing: {
      endpoint: 'https://www.bing.com/images/search',
      enabled: true
    }
  };

  /**
   * Main reverse image search orchestrator
   */
  async searchByImage(
    imageData: string | Buffer, 
    imageUrl?: string,
    options: {
      engines?: string[];
      includeModified?: boolean;
      maxResults?: number;
      timeout?: number;
    } = {}
  ): Promise<ReverseImageSearchResponse> {
    
    const searchStartTime = Date.now();
    const { engines = ['tineye', 'google', 'yandex'], includeModified = true, maxResults = 50, timeout = 30000 } = options;

    try {
      // Prepare image data
      const imageBuffer = typeof imageData === 'string' ? Buffer.from(imageData, 'base64') : imageData;
      const imageHash = this.generateImageHash(imageBuffer);
      
      // Check cache first
      const cacheKey = `reverse_search:${imageHash}`;
      const cached = await cacheService.get<ReverseImageSearchResponse>(cacheKey);
      if (cached) {
        return cached;
      }

      console.log('Starting reverse image search...');

      // Generate image fingerprint for comparison
      const fingerprint = await this.generateImageFingerprint(imageBuffer);

      // Search across multiple engines in parallel
      const searchPromises = engines.map(engine => this.searchWithEngine(engine, imageBuffer, imageUrl, timeout));
      const searchResults = await Promise.allSettled(searchPromises);

      // Process and aggregate results
      const allResults: ImageSearchResult[] = [];
      const engineStatus = [];

      for (let i = 0; i < searchResults.length; i++) {
        const engine = engines[i];
        const result = searchResults[i];
        
        if (result.status === 'fulfilled') {
          allResults.push(...result.value.results);
          engineStatus.push({
            engine,
            status: 'success' as const,
            resultCount: result.value.results.length,
            responseTime: result.value.responseTime
          });
        } else {
          engineStatus.push({
            engine,
            status: 'failed' as const,
            resultCount: 0,
            responseTime: timeout
          });
        }
      }

      // Deduplicate and categorize results
      const { exact, similar, modified } = await this.categorizeResults(allResults, fingerprint);

      // Sort by similarity and limit results
      const sortedResults = [...exact, ...similar, ...modified]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);

      // Analyze results
      const analysis = this.analyzeSearchResults(sortedResults);

      const response: ReverseImageSearchResponse = {
        query: {
          imageUrl,
          imageHash,
          uploadTime: new Date().toISOString()
        },
        results: { exact, similar, modified },
        aggregatedResults: sortedResults,
        analysis,
        searchEngines: engineStatus
      };

      // Cache for 1 hour
      await cacheService.set(cacheKey, response, { ttl: 3600 });

      console.log(`Reverse image search completed in ${Date.now() - searchStartTime}ms`);
      return response;

    } catch (error) {
      console.error('Reverse image search failed:', error);
      throw error;
    }
  }

  /**
   * Search with specific search engine
   */
  private async searchWithEngine(
    engineName: string, 
    imageBuffer: Buffer, 
    imageUrl?: string,
    timeout: number = 30000
  ): Promise<{ results: ImageSearchResult[]; responseTime: number }> {
    
    const startTime = Date.now();
    
    try {
      let results: ImageSearchResult[] = [];

      switch (engineName) {
        case 'tineye':
          results = await this.searchTinEye(imageBuffer, imageUrl);
          break;
        case 'google':
          results = await this.searchGoogleImages(imageBuffer, imageUrl);
          break;
        case 'yandex':
          results = await this.searchYandexImages(imageBuffer, imageUrl);
          break;
        case 'bing':
          results = await this.searchBingImages(imageBuffer, imageUrl);
          break;
        default:
          throw new Error(`Unknown search engine: ${engineName}`);
      }

      return {
        results,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      console.error(`${engineName} search failed:`, error.message);
      return {
        results: [],
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * TinEye reverse image search
   */
  private async searchTinEye(imageBuffer: Buffer, imageUrl?: string): Promise<ImageSearchResult[]> {
    const engine = this.searchEngines.tineye;
    
    if (!engine.enabled || !engine.apiKey) {
      // Fallback to web scraping
      return await this.scrapeTinEye(imageBuffer, imageUrl);
    }

    try {
      // Use TinEye API
      const formData = new FormData();
      formData.append('image', new Blob([imageBuffer]), 'image.jpg');
      
      const response = await axios.post(engine.apiEndpoint!, formData, {
        headers: {
          'Authorization': `Bearer ${engine.apiKey}`,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 25000
      });

      const data = response.data;
      
      return data.results?.map((result: any) => ({
        imageUrl: result.image_url,
        sourceUrl: result.backlink,
        title: result.title || 'TinEye Result',
        snippet: result.snippet || '',
        publishDate: result.crawl_date,
        domain: new URL(result.backlink).hostname,
        similarity: result.score || 1.0,
        thumbnail: result.image_url,
        dimensions: {
          width: result.width,
          height: result.height
        },
        fileSize: result.size
      })) || [];

    } catch (error) {
      console.error('TinEye API search failed:', error);
      return [];
    }
  }

  /**
   * TinEye web scraping fallback
   */
  private async scrapeTinEye(imageBuffer: Buffer, imageUrl?: string): Promise<ImageSearchResult[]> {
    try {
      // Upload image to TinEye
      const uploadResponse = await axios.post('https://tineye.com/search', {
        image: imageBuffer.toString('base64'),
        sort: 'score',
        order: 'desc'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(uploadResponse.data);
      const results: ImageSearchResult[] = [];

      $('.match').each((i, element) => {
        const $match = $(element);
        const $img = $match.find('img').first();
        const $link = $match.find('a.image-link').first();
        const $details = $match.find('.match-details');

        const imageUrl = $img.attr('src') || '';
        const sourceUrl = $link.attr('href') || '';
        const domain = $details.find('.domain').text().trim();
        const title = $details.find('.title').text().trim() || domain;

        if (imageUrl && sourceUrl) {
          results.push({
            imageUrl,
            sourceUrl,
            title,
            snippet: '',
            domain,
            similarity: 0.9, // TinEye doesn't provide exact scores via scraping
            thumbnail: imageUrl
          });
        }
      });

      return results;
    } catch (error) {
      console.error('TinEye scraping failed:', error);
      return [];
    }
  }

  /**
   * Google Images reverse search
   */
  private async searchGoogleImages(imageBuffer: Buffer, imageUrl?: string): Promise<ImageSearchResult[]> {
    try {
      // Upload image to Google Images
      const searchUrl = imageUrl 
        ? `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`
        : 'https://www.google.com/searchbyimage/upload';

      let response;
      if (imageUrl) {
        response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
      } else {
        const formData = new FormData();
        formData.append('encoded_image', new Blob([imageBuffer]), 'image.jpg');
        
        response = await axios.post(searchUrl, formData, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
      }

      const $ = cheerio.load(response.data);
      const results: ImageSearchResult[] = [];

      // Parse Google's search results
      $('[data-ved] img').each((i, element) => {
        if (i >= 20) return; // Limit results

        const $img = $(element);
        const $parent = $img.closest('[data-ved]');
        const $link = $parent.find('a').first();

        const imageUrl = $img.attr('src') || '';
        const sourceUrl = $link.attr('href') || '';
        const title = $img.attr('alt') || $parent.text().trim();

        if (imageUrl && sourceUrl && !sourceUrl.includes('google.com')) {
          try {
            const domain = new URL(sourceUrl).hostname;
            results.push({
              imageUrl,
              sourceUrl,
              title,
              snippet: '',
              domain,
              similarity: 0.8, // Estimated similarity
              thumbnail: imageUrl
            });
          } catch (urlError) {
            // Skip invalid URLs
          }
        }
      });

      return results;
    } catch (error) {
      console.error('Google Images search failed:', error);
      return [];
    }
  }

  /**
   * Yandex Images reverse search
   */
  private async searchYandexImages(imageBuffer: Buffer, imageUrl?: string): Promise<ImageSearchResult[]> {
    try {
      const searchUrl = 'https://yandex.com/images/search?rpt=imageview&format=json&request=';
      
      // Upload image to Yandex
      const formData = new FormData();
      formData.append('upfile', new Blob([imageBuffer]), 'image.jpg');
      
      const uploadResponse = await axios.post('https://yandex.com/images/search?rpt=imageview', formData, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(uploadResponse.data);
      const results: ImageSearchResult[] = [];

      $('.other-sites__preview-link').each((i, element) => {
        if (i >= 20) return;

        const $link = $(element);
        const $img = $link.find('img').first();
        const sourceUrl = $link.attr('href') || '';
        const imageUrl = $img.attr('src') || '';
        const title = $img.attr('alt') || '';

        if (imageUrl && sourceUrl) {
          try {
            const domain = new URL(sourceUrl).hostname;
            results.push({
              imageUrl,
              sourceUrl,
              title,
              snippet: '',
              domain,
              similarity: 0.75,
              thumbnail: imageUrl
            });
          } catch (urlError) {
            // Skip invalid URLs
          }
        }
      });

      return results;
    } catch (error) {
      console.error('Yandex Images search failed:', error);
      return [];
    }
  }

  /**
   * Bing Images reverse search
   */
  private async searchBingImages(imageBuffer: Buffer, imageUrl?: string): Promise<ImageSearchResult[]> {
    try {
      const searchUrl = 'https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIHMP';
      
      const formData = new FormData();
      formData.append('imageBin', new Blob([imageBuffer]), 'image.jpg');
      
      const response = await axios.post(searchUrl, formData, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const results: ImageSearchResult[] = [];

      $('.img_cont img').each((i, element) => {
        if (i >= 15) return;

        const $img = $(element);
        const $parent = $img.closest('.img_cont');
        const $link = $parent.find('a').first();

        const imageUrl = $img.attr('src') || '';
        const sourceUrl = $link.attr('href') || '';
        const title = $img.attr('alt') || $link.attr('title') || '';

        if (imageUrl && sourceUrl) {
          try {
            const domain = new URL(sourceUrl).hostname;
            results.push({
              imageUrl,
              sourceUrl,
              title,
              snippet: '',
              domain,
              similarity: 0.7,
              thumbnail: imageUrl
            });
          } catch (urlError) {
            // Skip invalid URLs
          }
        }
      });

      return results;
    } catch (error) {
      console.error('Bing Images search failed:', error);
      return [];
    }
  }

  /**
   * Generate image fingerprint for comparison
   */
  private async generateImageFingerprint(imageBuffer: Buffer): Promise<ImageFingerprint> {
    try {
      const image = sharp(imageBuffer);
      const { width, height } = await image.metadata();
      
      // Resize for consistent comparison
      const resized = await image.resize(64, 64).raw().toBuffer();
      
      return {
        phash: this.calculatePerceptualHash(resized, 64, 64),
        dhash: this.calculateDifferenceHash(resized, 64, 64),
        ahash: this.calculateAverageHash(resized, 64, 64),
        whash: this.calculateWaveletHash(resized, 64, 64),
        colorHistogram: this.calculateColorHistogram(resized),
        edgeFeatures: this.extractEdgeFeatures(resized, 64, 64)
      };
    } catch (error) {
      console.error('Fingerprint generation failed:', error);
      return {
        phash: '',
        dhash: '',
        ahash: '',
        whash: '',
        colorHistogram: [],
        edgeFeatures: []
      };
    }
  }

  /**
   * Categorize search results based on similarity
   */
  private async categorizeResults(
    results: ImageSearchResult[],
    fingerprint: ImageFingerprint
  ): Promise<{ exact: ImageSearchResult[]; similar: ImageSearchResult[]; modified: ImageSearchResult[] }> {
    
    const exact: ImageSearchResult[] = [];
    const similar: ImageSearchResult[] = [];
    const modified: ImageSearchResult[] = [];

    // Remove duplicates first
    const uniqueResults = this.removeDuplicates(results);

    for (const result of uniqueResults) {
      try {
        // Calculate similarity with our fingerprint
        const actualSimilarity = await this.calculateImageSimilarity(result.imageUrl, fingerprint);
        result.similarity = actualSimilarity;

        if (actualSimilarity >= 0.95) {
          exact.push(result);
        } else if (actualSimilarity >= 0.75) {
          similar.push(result);
        } else if (actualSimilarity >= 0.5) {
          modified.push(result);
        }
        // Skip results with similarity < 0.5
      } catch (error) {
        // If we can't calculate similarity, keep the original estimate
        if (result.similarity >= 0.9) {
          exact.push(result);
        } else if (result.similarity >= 0.7) {
          similar.push(result);
        } else {
          modified.push(result);
        }
      }
    }

    return { exact, similar, modified };
  }

  /**
   * Calculate similarity between query image and found image
   */
  private async calculateImageSimilarity(imageUrl: string, queryFingerprint: ImageFingerprint): Promise<number> {
    try {
      // Download and analyze the found image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const imageBuffer = Buffer.from(response.data);
      const foundFingerprint = await this.generateImageFingerprint(imageBuffer);

      // Calculate similarity using multiple metrics
      const phashSim = this.hammingDistance(queryFingerprint.phash, foundFingerprint.phash);
      const dhashSim = this.hammingDistance(queryFingerprint.dhash, foundFingerprint.dhash);
      const ahashSim = this.hammingDistance(queryFingerprint.ahash, foundFingerprint.ahash);
      const colorSim = this.colorHistogramSimilarity(queryFingerprint.colorHistogram, foundFingerprint.colorHistogram);

      // Weighted average
      const similarity = (phashSim * 0.4 + dhashSim * 0.3 + ahashSim * 0.2 + colorSim * 0.1);
      
      return Math.max(0, Math.min(1, similarity));
    } catch (error) {
      console.error('Similarity calculation failed:', error);
      return 0.5; // Default similarity if calculation fails
    }
  }

  /**
   * Hash and comparison utility methods
   */
  private calculatePerceptualHash(imageData: Buffer, width: number, height: number): string {
    // Simplified perceptual hash implementation
    const gray = this.convertToGrayscale(imageData, width, height);
    const dct = this.simpleDCT(gray, width, height);
    return this.hashFromDCT(dct);
  }

  private calculateDifferenceHash(imageData: Buffer, width: number, height: number): string {
    const gray = this.convertToGrayscale(imageData, width, height);
    let hash = '';
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width - 1; x++) {
        const current = gray[y * width + x];
        const next = gray[y * width + x + 1];
        hash += current > next ? '1' : '0';
      }
    }
    
    return hash;
  }

  private calculateAverageHash(imageData: Buffer, width: number, height: number): string {
    const gray = this.convertToGrayscale(imageData, width, height);
    const average = gray.reduce((sum, val) => sum + val, 0) / gray.length;
    
    return gray.map(val => val > average ? '1' : '0').join('');
  }

  private calculateWaveletHash(imageData: Buffer, width: number, height: number): string {
    // Simplified wavelet hash (placeholder implementation)
    return this.calculateAverageHash(imageData, width, height);
  }

  private calculateColorHistogram(imageData: Buffer): number[] {
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < imageData.length; i += 3) {
      const gray = Math.round(0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]);
      histogram[gray]++;
    }
    
    return histogram;
  }

  private extractEdgeFeatures(imageData: Buffer, width: number, height: number): number[] {
    // Simplified edge detection
    const gray = this.convertToGrayscale(imageData, width, height);
    const edges = [];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const gx = gray[(y-1)*width + x-1] + 2*gray[y*width + x-1] + gray[(y+1)*width + x-1] -
                   gray[(y-1)*width + x+1] - 2*gray[y*width + x+1] - gray[(y+1)*width + x+1];
        const gy = gray[(y-1)*width + x-1] + 2*gray[(y-1)*width + x] + gray[(y-1)*width + x+1] -
                   gray[(y+1)*width + x-1] - 2*gray[(y+1)*width + x] - gray[(y+1)*width + x+1];
        edges.push(Math.sqrt(gx*gx + gy*gy));
      }
    }
    
    return edges.slice(0, 100); // Return first 100 edge features
  }

  private convertToGrayscale(imageData: Buffer, width: number, height: number): number[] {
    const gray = [];
    for (let i = 0; i < imageData.length; i += 3) {
      gray.push(Math.round(0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]));
    }
    return gray;
  }

  private simpleDCT(data: number[], width: number, height: number): number[] {
    // Simplified DCT implementation
    return data.slice(0, 64); // Return first 64 values as DCT coefficients
  }

  private hashFromDCT(dct: number[]): string {
    const median = [...dct].sort((a, b) => a - b)[Math.floor(dct.length / 2)];
    return dct.map(val => val > median ? '1' : '0').join('');
  }

  private hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 0;
    
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    
    return 1 - (distance / hash1.length);
  }

  private colorHistogramSimilarity(hist1: number[], hist2: number[]): number {
    if (hist1.length !== hist2.length) return 0;
    
    const sum1 = hist1.reduce((sum, val) => sum + val, 0);
    const sum2 = hist2.reduce((sum, val) => sum + val, 0);
    
    if (sum1 === 0 || sum2 === 0) return 0;
    
    // Normalize histograms
    const norm1 = hist1.map(val => val / sum1);
    const norm2 = hist2.map(val => val / sum2);
    
    // Calculate correlation
    let correlation = 0;
    for (let i = 0; i < norm1.length; i++) {
      correlation += Math.min(norm1[i], norm2[i]);
    }
    
    return correlation;
  }

  private removeDuplicates(results: ImageSearchResult[]): ImageSearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = `${result.imageUrl}|${result.sourceUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private analyzeSearchResults(results: ImageSearchResult[]): ReverseImageSearchResponse['analysis'] {
    if (results.length === 0) {
      return {
        totalMatches: 0,
        topDomains: [],
        suspiciousIndicators: ['no_matches_found'],
        credibilityScore: 0.1
      };
    }

    // Find oldest and most recent matches
    const datedResults = results.filter(r => r.publishDate);
    const oldestMatch = datedResults.sort((a, b) => 
      new Date(a.publishDate!).getTime() - new Date(b.publishDate!).getTime()
    )[0];
    const mostRecentMatch = datedResults.sort((a, b) => 
      new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime()
    )[0];

    // Count domains
    const domainCounts = new Map<string, number>();
    results.forEach(result => {
      const count = domainCounts.get(result.domain) || 0;
      domainCounts.set(result.domain, count + 1);
    });

    const topDomains = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Detect suspicious indicators
    const suspiciousIndicators = [];
    
    if (results.length < 3) {
      suspiciousIndicators.push('very_few_matches');
    }
    
    const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
    if (avgSimilarity < 0.7) {
      suspiciousIndicators.push('low_similarity_matches');
    }

    // Check for potential stock photo or template usage
    const stockPhotoSites = ['shutterstock', 'getty', 'unsplash', 'pexels', 'pixabay'];
    const hasStockPhotoMatches = results.some(r => 
      stockPhotoSites.some(site => r.domain.includes(site))
    );
    if (hasStockPhotoMatches) {
      suspiciousIndicators.push('stock_photo_usage');
    }

    // Calculate credibility score
    let credibilityScore = 0.5;
    
    if (results.length > 10) credibilityScore += 0.2;
    if (avgSimilarity > 0.8) credibilityScore += 0.2;
    if (topDomains.length > 3) credibilityScore += 0.1;
    if (oldestMatch) credibilityScore += 0.1;

    return {
      totalMatches: results.length,
      oldestMatch,
      mostRecentMatch,
      topDomains,
      suspiciousIndicators,
      credibilityScore: Math.min(credibilityScore, 1.0)
    };
  }

  private generateImageHash(imageBuffer: Buffer): string {
    return createHash('md5').update(imageBuffer).digest('hex');
  }

  /**
   * Quick image search for real-time verification
   */
  async quickImageSearch(imageData: string | Buffer): Promise<{
    foundMatches: boolean;
    matchCount: number;
    topMatch?: ImageSearchResult;
    credibilityScore: number;
  }> {
    try {
      const results = await this.searchByImage(imageData, undefined, {
        engines: ['google'], // Use only Google for speed
        maxResults: 10,
        timeout: 10000
      });

      const matchCount = results.aggregatedResults.length;
      const topMatch = results.aggregatedResults[0];

      return {
        foundMatches: matchCount > 0,
        matchCount,
        topMatch,
        credibilityScore: results.analysis.credibilityScore
      };
    } catch (error) {
      console.error('Quick image search failed:', error);
      return {
        foundMatches: false,
        matchCount: 0,
        credibilityScore: 0
      };
    }
  }

  /**
   * Search by image URL (without uploading image data)
   */
  async searchByUrl(imageUrl: string, options = {}): Promise<ReverseImageSearchResponse> {
    try {
      // Download image first
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });
      
      const imageBuffer = Buffer.from(response.data);
      return await this.searchByImage(imageBuffer, imageUrl, options);
    } catch (error) {
      console.error('Search by URL failed:', error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{ engine: string; status: 'available' | 'degraded' | 'unavailable' }[]> {
    const healthChecks = [];
    
    for (const [engineName, config] of Object.entries(this.searchEngines)) {
      try {
        if (config.enabled) {
          // Simple connectivity test
          const response = await axios.head(config.endpoint, { timeout: 5000 });
          healthChecks.push({
            engine: engineName,
            status: response.status === 200 ? 'available' as const : 'degraded' as const
          });
        } else {
          healthChecks.push({
            engine: engineName,
            status: 'unavailable' as const
          });
        }
      } catch (error) {
        healthChecks.push({
          engine: engineName,
          status: 'unavailable' as const
        });
      }
    }

    return healthChecks;
  }
}

export const reverseImageSearchService = new ReverseImageSearchService();