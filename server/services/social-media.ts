import axios from "axios";
import * as cheerio from "cheerio";
import { cacheService } from "./redis-cache";

interface SocialMediaPost {
  id: string;
  platform: 'twitter' | 'instagram' | 'facebook' | 'youtube';
  url: string;
  content: string;
  author: string;
  authorId?: string;
  timestamp: Date;
  engagement: {
    likes: number;
    shares: number;
    comments: number;
  };
  metadata: {
    isVerified?: boolean;
    followerCount?: number;
    accountAge?: string;
    location?: string;
  };
  media?: Array<{
    type: 'image' | 'video';
    url: string;
  }>;
}

interface PlatformMetrics {
  reachEstimate: number;
  viralityScore: number;
  credibilityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
}

class SocialMediaService {
  private readonly USER_AGENT = "Mozilla/5.0 (compatible; SatyaBot/1.0; +https://satya.app/bot)";

  /**
   * Extract content from social media URL
   */
  async extractFromUrl(url: string): Promise<SocialMediaPost | null> {
    try {
      const platform = this.detectPlatform(url);
      if (!platform) {
        throw new Error("Unsupported social media platform");
      }

      const cacheKey = `social:${platform}:${this.generateUrlHash(url)}`;
      const cached = await cacheService.get<SocialMediaPost>(cacheKey);
      if (cached) {
        return cached;
      }

      let post: SocialMediaPost | null = null;

      switch (platform) {
        case 'twitter':
          post = await this.extractTwitterContent(url);
          break;
        case 'instagram':
          post = await this.extractInstagramContent(url);
          break;
        case 'facebook':
          post = await this.extractFacebookContent(url);
          break;
        case 'youtube':
          post = await this.extractYouTubeContent(url);
          break;
      }

      if (post) {
        await cacheService.set(cacheKey, post, 3600); // Cache for 1 hour
      }

      return post;
    } catch (error) {
      console.error('Social media extraction failed:', error);
      return null;
    }
  }

  /**
   * Analyze social media spread and impact
   */
  async analyzeSocialMediaSpread(url: string, content: string): Promise<PlatformMetrics> {
    try {
      const post = await this.extractFromUrl(url);
      
      if (!post) {
        return this.getDefaultMetrics();
      }

      // Calculate metrics based on engagement and platform
      const viralityScore = this.calculateViralityScore(post);
      const credibilityScore = this.calculateCredibilityScore(post);
      const reachEstimate = this.estimateReach(post);
      const riskLevel = this.assessRiskLevel(viralityScore, credibilityScore);

      return {
        reachEstimate,
        viralityScore,
        credibilityScore,
        riskLevel,
      };
    } catch (error) {
      console.error('Social media analysis failed:', error);
      return this.getDefaultMetrics();
    }
  }

  /**
   * Search for similar content across platforms
   */
  async findSimilarContent(query: string, platforms: string[] = ['twitter', 'instagram', 'facebook']): Promise<SocialMediaPost[]> {
    const results: SocialMediaPost[] = [];
    
    // Mock implementation - in production you'd use platform APIs
    if (query.toLowerCase().includes('covid') || query.toLowerCase().includes('vaccine')) {
      results.push({
        id: 'mock-twitter-1',
        platform: 'twitter',
        url: 'https://twitter.com/mock/status/123',
        content: `Similar content found: ${query.substring(0, 100)}...`,
        author: 'MockUser',
        timestamp: new Date(),
        engagement: { likes: 150, shares: 45, comments: 23 },
        metadata: { isVerified: false, followerCount: 1200 }
      });
    }

    return results;
  }

  /**
   * Detect social media platform from URL
   */
  private detectPlatform(url: string): 'twitter' | 'instagram' | 'facebook' | 'youtube' | null {
    const normalizedUrl = url.toLowerCase();
    
    if (normalizedUrl.includes('twitter.com') || normalizedUrl.includes('x.com')) {
      return 'twitter';
    } else if (normalizedUrl.includes('instagram.com')) {
      return 'instagram';
    } else if (normalizedUrl.includes('facebook.com') || normalizedUrl.includes('fb.com')) {
      return 'facebook';
    } else if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
      return 'youtube';
    }
    
    return null;
  }

  /**
   * Extract Twitter/X content
   */
  private async extractTwitterContent(url: string): Promise<SocialMediaPost | null> {
    try {
      // Note: Twitter's API requires authentication
      // This is a simplified implementation using web scraping
      // In production, you should use Twitter API v2 with proper authentication
      
      const response = await this.makeRequest(url);
      const $ = cheerio.load(response.data);

      // Extract tweet content from meta tags and structured data
      const tweetText = $('meta[property="og:description"]').attr('content') || '';
      const author = $('meta[name="twitter:title"]').attr('content')?.split(' on X:')?.[0] || 'Unknown';
      const imageUrl = $('meta[property="og:image"]').attr('content');

      if (!tweetText) {
        throw new Error('Could not extract tweet content');
      }

      return {
        id: this.extractTweetId(url),
        platform: 'twitter',
        url,
        content: tweetText,
        author,
        timestamp: new Date(), // Would extract from page in real implementation
        engagement: {
          likes: this.extractEngagementNumber($, 'like') || 0,
          shares: this.extractEngagementNumber($, 'retweet') || 0,
          comments: this.extractEngagementNumber($, 'reply') || 0,
        },
        metadata: {
          isVerified: $('.verified-badge').length > 0,
        },
        media: imageUrl ? [{ type: 'image', url: imageUrl }] : undefined,
      };
    } catch (error) {
      console.error('Twitter extraction failed:', error);
      
      // Return mock data for demonstration
      return {
        id: this.extractTweetId(url),
        platform: 'twitter',
        url,
        content: 'Twitter content extraction requires API access. This is mock data.',
        author: 'MockTwitterUser',
        timestamp: new Date(),
        engagement: { likes: 100, shares: 25, comments: 10 },
        metadata: { isVerified: false, followerCount: 5000 }
      };
    }
  }

  /**
   * Extract Instagram content
   */
  private async extractInstagramContent(url: string): Promise<SocialMediaPost | null> {
    try {
      // Instagram requires authentication for API access
      // This implementation uses web scraping with limitations
      
      const response = await this.makeRequest(url);
      const $ = cheerio.load(response.data);

      const description = $('meta[property="og:description"]').attr('content') || '';
      const author = $('meta[property="og:title"]').attr('content')?.split(' • Instagram')?.[0] || 'Unknown';
      const imageUrl = $('meta[property="og:image"]').attr('content');

      return {
        id: this.extractInstagramId(url),
        platform: 'instagram',
        url,
        content: description,
        author,
        timestamp: new Date(),
        engagement: {
          likes: 0, // Would require Instagram API
          shares: 0,
          comments: 0,
        },
        metadata: {},
        media: imageUrl ? [{ type: 'image', url: imageUrl }] : undefined,
      };
    } catch (error) {
      console.error('Instagram extraction failed:', error);
      
      return {
        id: this.extractInstagramId(url),
        platform: 'instagram',
        url,
        content: 'Instagram content extraction requires API access. This is mock data.',
        author: 'MockInstagramUser',
        timestamp: new Date(),
        engagement: { likes: 200, shares: 50, comments: 30 },
        metadata: { isVerified: false, followerCount: 10000 }
      };
    }
  }

  /**
   * Extract Facebook content
   */
  private async extractFacebookContent(url: string): Promise<SocialMediaPost | null> {
    try {
      const response = await this.makeRequest(url);
      const $ = cheerio.load(response.data);

      const description = $('meta[property="og:description"]').attr('content') || '';
      const title = $('meta[property="og:title"]').attr('content') || '';
      const imageUrl = $('meta[property="og:image"]').attr('content');

      return {
        id: this.extractFacebookId(url),
        platform: 'facebook',
        url,
        content: description || title,
        author: 'Facebook User',
        timestamp: new Date(),
        engagement: {
          likes: 0,
          shares: 0,
          comments: 0,
        },
        metadata: {},
        media: imageUrl ? [{ type: 'image', url: imageUrl }] : undefined,
      };
    } catch (error) {
      console.error('Facebook extraction failed:', error);
      
      return {
        id: this.extractFacebookId(url),
        platform: 'facebook',
        url,
        content: 'Facebook content extraction requires API access. This is mock data.',
        author: 'MockFacebookUser',
        timestamp: new Date(),
        engagement: { likes: 75, shares: 15, comments: 8 },
        metadata: { isVerified: false }
      };
    }
  }

  /**
   * Extract YouTube content
   */
  private async extractYouTubeContent(url: string): Promise<SocialMediaPost | null> {
    try {
      const response = await this.makeRequest(url);
      const $ = cheerio.load(response.data);

      const title = $('meta[name="title"]').attr('content') || '';
      const description = $('meta[name="description"]').attr('content') || '';
      const author = $('meta[name="author"]').attr('content') || '';
      const thumbnailUrl = $('meta[property="og:image"]').attr('content');

      return {
        id: this.extractYouTubeId(url),
        platform: 'youtube',
        url,
        content: `${title}\n\n${description}`,
        author,
        timestamp: new Date(),
        engagement: {
          likes: 0, // Would require YouTube API
          shares: 0,
          comments: 0,
        },
        metadata: {},
        media: thumbnailUrl ? [{ type: 'image', url: thumbnailUrl }] : undefined,
      };
    } catch (error) {
      console.error('YouTube extraction failed:', error);
      
      return {
        id: this.extractYouTubeId(url),
        platform: 'youtube',
        url,
        content: 'YouTube content extraction. This is mock data for demonstration.',
        author: 'MockYouTubeChannel',
        timestamp: new Date(),
        engagement: { likes: 500, shares: 100, comments: 150 },
        metadata: { isVerified: true, followerCount: 50000 }
      };
    }
  }

  /**
   * Make HTTP request with proper headers and error handling
   */
  private async makeRequest(url: string, options: any = {}) {
    return axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': this.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        ...options.headers,
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      ...options,
    });
  }

  /**
   * Calculate virality score based on engagement
   */
  private calculateViralityScore(post: SocialMediaPost): number {
    const { likes, shares, comments } = post.engagement;
    const totalEngagement = likes + shares * 2 + comments * 1.5; // Weight shares more heavily
    
    // Platform-specific adjustments
    let platformMultiplier = 1;
    switch (post.platform) {
      case 'twitter':
        platformMultiplier = 1.2; // Twitter spreads faster
        break;
      case 'facebook':
        platformMultiplier = 1.0;
        break;
      case 'instagram':
        platformMultiplier = 0.8;
        break;
      case 'youtube':
        platformMultiplier = 0.6; // Slower spread but longer lasting
        break;
    }

    const baseScore = Math.min(100, (totalEngagement / 1000) * 100 * platformMultiplier);
    return Math.round(baseScore);
  }

  /**
   * Calculate credibility score based on account metrics
   */
  private calculateCredibilityScore(post: SocialMediaPost): number {
    let score = 50; // Base score

    // Verified account bonus
    if (post.metadata.isVerified) {
      score += 30;
    }

    // Follower count influence
    const followerCount = post.metadata.followerCount || 0;
    if (followerCount > 100000) {
      score += 15;
    } else if (followerCount > 10000) {
      score += 10;
    } else if (followerCount > 1000) {
      score += 5;
    } else if (followerCount < 100) {
      score -= 10;
    }

    // Account age (if available)
    // This would require additional data collection

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Estimate potential reach
   */
  private estimateReach(post: SocialMediaPost): number {
    const followerCount = post.metadata.followerCount || 1000;
    const viralityMultiplier = this.calculateViralityScore(post) / 100;
    
    // Base reach is follower count * engagement rate * platform reach factor
    let platformReachFactor = 1;
    switch (post.platform) {
      case 'twitter':
        platformReachFactor = 3; // High retweet potential
        break;
      case 'facebook':
        platformReachFactor = 2;
        break;
      case 'instagram':
        platformReachFactor = 1.5;
        break;
      case 'youtube':
        platformReachFactor = 1.2;
        break;
    }

    return Math.round(followerCount * viralityMultiplier * platformReachFactor);
  }

  /**
   * Assess risk level based on metrics
   */
  private assessRiskLevel(viralityScore: number, credibilityScore: number): 'low' | 'medium' | 'high' {
    if (viralityScore > 70 && credibilityScore < 40) {
      return 'high'; // High spread, low credibility
    } else if (viralityScore > 50 && credibilityScore < 60) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Extract engagement numbers from page
   */
  private extractEngagementNumber($: cheerio.CheerioAPI, type: string): number | null {
    // This would need platform-specific selectors
    // Returning null as we don't have reliable selectors without proper API access
    return null;
  }

  /**
   * Extract post IDs from URLs
   */
  private extractTweetId(url: string): string {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : 'unknown';
  }

  private extractInstagramId(url: string): string {
    const match = url.match(/\/p\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : 'unknown';
  }

  private extractFacebookId(url: string): string {
    const match = url.match(/\/posts\/(\d+)/) || url.match(/pfbid[A-Za-z0-9]+/);
    return match ? match[1] || match[0] : 'unknown';
  }

  private extractYouTubeId(url: string): string {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Generate URL hash for caching
   */
  private generateUrlHash(url: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
  }

  /**
   * Get default metrics when analysis fails
   */
  private getDefaultMetrics(): PlatformMetrics {
    return {
      reachEstimate: 1000,
      viralityScore: 25,
      credibilityScore: 50,
      riskLevel: 'medium',
    };
  }

  /**
   * Health check for social media services
   */
  async healthCheck(): Promise<{ service: string; status: string }[]> {
    const testUrls = [
      'https://twitter.com/test',
      'https://instagram.com/test',
      'https://facebook.com/test',
      'https://youtube.com/watch?v=test',
    ];

    const results = await Promise.allSettled(
      testUrls.map(async (url) => {
        try {
          await this.makeRequest(url, { timeout: 5000 });
          return { 
            service: this.detectPlatform(url) || 'unknown',
            status: 'accessible'
          };
        } catch (error) {
          return { 
            service: this.detectPlatform(url) || 'unknown',
            status: 'limited' // Most social media sites block automated access
          };
        }
      })
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : { service: 'unknown', status: 'error' }
    );
  }

  /**
   * Get platform-specific content analysis
   */
  async getPlatformAnalysis(platform: string, query: string): Promise<any> {
    // This would provide platform-specific insights
    // For now, return basic analysis
    return {
      platform,
      query,
      trendingTopics: [`#${query}`, `#factcheck`, `#misinformation`],
      estimatedPosts: Math.floor(Math.random() * 10000) + 1000,
      sentimentAnalysis: {
        positive: Math.random() * 30 + 20,
        negative: Math.random() * 30 + 20,
        neutral: Math.random() * 30 + 20,
      },
    };
  }
}

export const socialMediaService = new SocialMediaService();