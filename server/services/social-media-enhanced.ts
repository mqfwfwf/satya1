/**
 * Enhanced Social Media Integration Service
 * Supports Twitter/X, Instagram, Facebook, YouTube content analysis
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cacheService } from './redis-cache';

export interface SocialMediaPost {
  id: string;
  platform: 'twitter' | 'instagram' | 'facebook' | 'youtube' | 'tiktok';
  url: string;
  author: {
    username: string;
    displayName: string;
    verified: boolean;
    followerCount?: number;
  };
  content: {
    text: string;
    media: MediaItem[];
    hashtags: string[];
    mentions: string[];
  };
  engagement: {
    likes: number;
    shares: number;
    comments: number;
    views?: number;
  };
  metadata: {
    timestamp: string;
    location?: string;
    language?: string;
    type: 'text' | 'image' | 'video' | 'carousel';
  };
  verification: {
    isVerified: boolean;
    credibilityScore: number;
    flags: string[];
  };
}

export interface MediaItem {
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnail?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
}

export interface SocialMediaAnalysis {
  post: SocialMediaPost;
  riskScore: number;
  flags: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }[];
  relatedPosts: SocialMediaPost[];
  recommendations: string[];
}

class EnhancedSocialMediaService {
  private apiEndpoints = {
    twitter: 'https://api.twitter.com/2',
    instagram: 'https://graph.instagram.com',
    facebook: 'https://graph.facebook.com/v18.0',
    youtube: 'https://www.googleapis.com/youtube/v3'
  };

  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  };

  /**
   * Extract and analyze content from social media URL
   */
  async analyzeFromUrl(url: string): Promise<SocialMediaAnalysis> {
    try {
      const platform = this.detectPlatform(url);
      if (!platform) {
        throw new Error('Unsupported social media platform');
      }

      // Check cache first
      const cacheKey = `social_analysis:${Buffer.from(url).toString('base64')}`;
      const cached = await cacheService.get<SocialMediaAnalysis>(cacheKey);
      if (cached) {
        return cached;
      }

      let post: SocialMediaPost;
      
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
        default:
          throw new Error(`Platform ${platform} not supported`);
      }

      const analysis = await this.performAnalysis(post);
      
      // Cache for 1 hour
      await cacheService.set(cacheKey, analysis, 3600);
      
      return analysis;
    } catch (error) {
      console.error('Social media analysis failed:', error);
      throw error;
    }
  }

  /**
   * Extract Twitter/X content
   */
  private async extractTwitterContent(url: string): Promise<SocialMediaPost> {
    try {
      // Extract tweet ID from URL
      const tweetId = this.extractTwitterId(url);
      
      if (process.env.TWITTER_BEARER_TOKEN) {
        return await this.getTwitterContentAPI(tweetId);
      } else {
        return await this.scrapeTwitterContent(url);
      }
    } catch (error) {
      console.error('Twitter extraction failed:', error);
      throw error;
    }
  }

  /**
   * Get Twitter content via API
   */
  private async getTwitterContentAPI(tweetId: string): Promise<SocialMediaPost> {
    const response = await axios.get(`${this.apiEndpoints.twitter}/tweets/${tweetId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      },
      params: {
        'tweet.fields': 'author_id,created_at,public_metrics,context_annotations,entities,lang',
        'user.fields': 'name,username,verified,public_metrics,profile_image_url',
        'media.fields': 'type,url,duration_ms,height,width,preview_image_url',
        'expansions': 'author_id,attachments.media_keys'
      }
    });

    const tweet = response.data.data;
    const author = response.data.includes?.users?.[0];
    const media = response.data.includes?.media || [];

    return {
      id: tweet.id,
      platform: 'twitter',
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      author: {
        username: author?.username || 'unknown',
        displayName: author?.name || 'Unknown',
        verified: author?.verified || false,
        followerCount: author?.public_metrics?.followers_count
      },
      content: {
        text: tweet.text,
        media: media.map((m: any) => ({
          type: m.type,
          url: m.url || m.preview_image_url,
          thumbnail: m.preview_image_url,
          duration: m.duration_ms,
          dimensions: m.height && m.width ? { width: m.width, height: m.height } : undefined
        })),
        hashtags: tweet.entities?.hashtags?.map((h: any) => h.tag) || [],
        mentions: tweet.entities?.mentions?.map((m: any) => m.username) || []
      },
      engagement: {
        likes: tweet.public_metrics?.like_count || 0,
        shares: tweet.public_metrics?.retweet_count || 0,
        comments: tweet.public_metrics?.reply_count || 0,
        views: tweet.public_metrics?.impression_count
      },
      metadata: {
        timestamp: tweet.created_at,
        language: tweet.lang,
        type: media.length > 0 ? (media[0].type === 'video' ? 'video' : 'image') : 'text'
      },
      verification: {
        isVerified: author?.verified || false,
        credibilityScore: this.calculateCredibilityScore(author?.public_metrics, tweet.public_metrics),
        flags: this.detectContentFlags(tweet.text, tweet.context_annotations)
      }
    };
  }

  /**
   * Scrape Twitter content (fallback)
   */
  private async scrapeTwitterContent(url: string): Promise<SocialMediaPost> {
    try {
      const response = await axios.get(url, { headers: this.headers });
      const $ = cheerio.load(response.data);

      // Extract basic tweet information from meta tags
      const tweetText = $('meta[property="og:description"]').attr('content') || '';
      const authorName = $('meta[property="og:site_name"]').attr('content') || 'Twitter';
      const imageUrl = $('meta[property="og:image"]').attr('content');

      return {
        id: this.extractTwitterId(url),
        platform: 'twitter',
        url,
        author: {
          username: 'scraped_user',
          displayName: authorName,
          verified: false
        },
        content: {
          text: tweetText,
          media: imageUrl ? [{ type: 'image', url: imageUrl }] : [],
          hashtags: this.extractHashtags(tweetText),
          mentions: this.extractMentions(tweetText)
        },
        engagement: {
          likes: 0,
          shares: 0,
          comments: 0
        },
        metadata: {
          timestamp: new Date().toISOString(),
          type: imageUrl ? 'image' : 'text'
        },
        verification: {
          isVerified: false,
          credibilityScore: 0.5,
          flags: ['scraped_content']
        }
      };
    } catch (error) {
      console.error('Twitter scraping failed:', error);
      throw error;
    }
  }

  /**
   * Extract Instagram content
   */
  private async extractInstagramContent(url: string): Promise<SocialMediaPost> {
    try {
      if (process.env.INSTAGRAM_ACCESS_TOKEN) {
        return await this.getInstagramContentAPI(url);
      } else {
        return await this.scrapeInstagramContent(url);
      }
    } catch (error) {
      console.error('Instagram extraction failed:', error);
      throw error;
    }
  }

  private async scrapeInstagramContent(url: string): Promise<SocialMediaPost> {
    try {
      const response = await axios.get(url, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const description = $('meta[property="og:description"]').attr('content') || '';
      const imageUrl = $('meta[property="og:image"]').attr('content') || '';
      const title = $('meta[property="og:title"]').attr('content') || '';

      return {
        id: this.extractInstagramId(url),
        platform: 'instagram',
        url,
        author: {
          username: this.extractUsernameFromTitle(title),
          displayName: this.extractUsernameFromTitle(title),
          verified: false
        },
        content: {
          text: description,
          media: imageUrl ? [{ type: 'image', url: imageUrl }] : [],
          hashtags: this.extractHashtags(description),
          mentions: this.extractMentions(description)
        },
        engagement: {
          likes: 0,
          shares: 0,
          comments: 0
        },
        metadata: {
          timestamp: new Date().toISOString(),
          type: imageUrl ? 'image' : 'text'
        },
        verification: {
          isVerified: false,
          credibilityScore: 0.5,
          flags: ['scraped_content']
        }
      };
    } catch (error) {
      console.error('Instagram scraping failed:', error);
      throw error;
    }
  }

  /**
   * Extract Facebook content
   */
  private async extractFacebookContent(url: string): Promise<SocialMediaPost> {
    try {
      const response = await axios.get(url, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const description = $('meta[property="og:description"]').attr('content') || '';
      const imageUrl = $('meta[property="og:image"]').attr('content') || '';
      const title = $('meta[property="og:title"]').attr('content') || '';

      return {
        id: this.extractFacebookId(url),
        platform: 'facebook',
        url,
        author: {
          username: 'facebook_user',
          displayName: this.extractUsernameFromTitle(title),
          verified: false
        },
        content: {
          text: description,
          media: imageUrl ? [{ type: 'image', url: imageUrl }] : [],
          hashtags: this.extractHashtags(description),
          mentions: []
        },
        engagement: {
          likes: 0,
          shares: 0,
          comments: 0
        },
        metadata: {
          timestamp: new Date().toISOString(),
          type: imageUrl ? 'image' : 'text'
        },
        verification: {
          isVerified: false,
          credibilityScore: 0.5,
          flags: ['scraped_content']
        }
      };
    } catch (error) {
      console.error('Facebook extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract YouTube content
   */
  private async extractYouTubeContent(url: string): Promise<SocialMediaPost> {
    try {
      const videoId = this.extractYouTubeId(url);
      
      if (process.env.YOUTUBE_API_KEY) {
        return await this.getYouTubeContentAPI(videoId);
      } else {
        return await this.scrapeYouTubeContent(url);
      }
    } catch (error) {
      console.error('YouTube extraction failed:', error);
      throw error;
    }
  }

  private async getYouTubeContentAPI(videoId: string): Promise<SocialMediaPost> {
    const response = await axios.get(`${this.apiEndpoints.youtube}/videos`, {
      params: {
        id: videoId,
        part: 'snippet,statistics',
        key: process.env.YOUTUBE_API_KEY
      }
    });

    const video = response.data.items[0];
    if (!video) {
      throw new Error('Video not found');
    }

    return {
      id: videoId,
      platform: 'youtube',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      author: {
        username: video.snippet.channelTitle,
        displayName: video.snippet.channelTitle,
        verified: false
      },
      content: {
        text: video.snippet.description,
        media: [{
          type: 'video',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: video.snippet.thumbnails.high?.url
        }],
        hashtags: this.extractHashtags(video.snippet.description),
        mentions: []
      },
      engagement: {
        likes: parseInt(video.statistics.likeCount) || 0,
        shares: 0,
        comments: parseInt(video.statistics.commentCount) || 0,
        views: parseInt(video.statistics.viewCount) || 0
      },
      metadata: {
        timestamp: video.snippet.publishedAt,
        type: 'video'
      },
      verification: {
        isVerified: false,
        credibilityScore: this.calculateYouTubeCredibility(video.statistics),
        flags: this.detectContentFlags(video.snippet.description)
      }
    };
  }

  private async scrapeYouTubeContent(url: string): Promise<SocialMediaPost> {
    try {
      const response = await axios.get(url, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const title = $('meta[property="og:title"]').attr('content') || '';
      const description = $('meta[property="og:description"]').attr('content') || '';
      const thumbnail = $('meta[property="og:image"]').attr('content') || '';
      const channelName = $('meta[property="og:site_name"]').attr('content') || 'YouTube';

      return {
        id: this.extractYouTubeId(url),
        platform: 'youtube',
        url,
        author: {
          username: channelName,
          displayName: channelName,
          verified: false
        },
        content: {
          text: `${title}\n\n${description}`,
          media: [{
            type: 'video',
            url: url,
            thumbnail: thumbnail
          }],
          hashtags: this.extractHashtags(description),
          mentions: []
        },
        engagement: {
          likes: 0,
          shares: 0,
          comments: 0
        },
        metadata: {
          timestamp: new Date().toISOString(),
          type: 'video'
        },
        verification: {
          isVerified: false,
          credibilityScore: 0.5,
          flags: ['scraped_content']
        }
      };
    } catch (error) {
      console.error('YouTube scraping failed:', error);
      throw error;
    }
  }

  /**
   * Perform comprehensive analysis on extracted post
   */
  private async performAnalysis(post: SocialMediaPost): Promise<SocialMediaAnalysis> {
    const flags = [];
    let riskScore = 0;

    // Content analysis
    const suspiciousKeywords = [
      'fake news', 'hoax', 'conspiracy', 'scam', 'clickbait',
      'urgent', 'breaking', 'exclusive', 'leaked', 'secret'
    ];
    
    const contentLower = post.content.text.toLowerCase();
    suspiciousKeywords.forEach(keyword => {
      if (contentLower.includes(keyword)) {
        flags.push({
          type: 'suspicious_keyword',
          severity: 'medium' as const,
          description: `Contains suspicious keyword: ${keyword}`
        });
        riskScore += 0.2;
      }
    });

    // Account credibility analysis
    if (!post.verification.isVerified && post.author.followerCount && post.author.followerCount < 100) {
      flags.push({
        type: 'low_credibility_account',
        severity: 'medium' as const,
        description: 'Account has very low follower count'
      });
      riskScore += 0.3;
    }

    // Engagement anomaly detection
    if (post.engagement.shares > post.engagement.likes * 2) {
      flags.push({
        type: 'engagement_anomaly',
        severity: 'high' as const,
        description: 'Unusual share-to-like ratio detected'
      });
      riskScore += 0.4;
    }

    // Find related posts (mock implementation)
    const relatedPosts = await this.findRelatedPosts(post);

    return {
      post,
      riskScore: Math.min(riskScore, 1.0),
      flags,
      relatedPosts,
      recommendations: this.generateRecommendations(riskScore, flags)
    };
  }

  /**
   * Utility methods
   */
  private detectPlatform(url: string): string | null {
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return null;
  }

  private extractTwitterId(url: string): string {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : '';
  }

  private extractInstagramId(url: string): string {
    const match = url.match(/p\/([^\/]+)/);
    return match ? match[1] : '';
  }

  private extractFacebookId(url: string): string {
    const match = url.match(/posts\/(\d+)/) || url.match(/(\d+)$/);
    return match ? match[1] : '';
  }

  private extractYouTubeId(url: string): string {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : '';
  }

  private extractHashtags(text: string): string[] {
    const matches = text.match(/#\w+/g);
    return matches ? matches.map(tag => tag.substring(1)) : [];
  }

  private extractMentions(text: string): string[] {
    const matches = text.match(/@\w+/g);
    return matches ? matches.map(mention => mention.substring(1)) : [];
  }

  private extractUsernameFromTitle(title: string): string {
    const match = title.match(/^([^:]+)/);
    return match ? match[1].trim() : 'unknown';
  }

  private calculateCredibilityScore(userMetrics: any, tweetMetrics: any): number {
    if (!userMetrics) return 0.5;
    
    const followerRatio = Math.min(userMetrics.followers_count / 10000, 1);
    const engagementRatio = tweetMetrics ? 
      (tweetMetrics.like_count + tweetMetrics.retweet_count) / Math.max(userMetrics.followers_count, 1) : 0;
    
    return (followerRatio * 0.6 + Math.min(engagementRatio * 100, 1) * 0.4);
  }

  private calculateYouTubeCredibility(statistics: any): number {
    const viewCount = parseInt(statistics.viewCount) || 0;
    const likeCount = parseInt(statistics.likeCount) || 0;
    const subscriberEstimate = viewCount / 100; // Rough estimate
    
    const viewRatio = Math.min(viewCount / 100000, 1);
    const engagementRatio = Math.min(likeCount / Math.max(viewCount, 1) * 100, 1);
    
    return viewRatio * 0.7 + engagementRatio * 0.3;
  }

  private detectContentFlags(text: string, contextAnnotations?: any[]): string[] {
    const flags = [];
    
    if (text.includes('URGENT') || text.includes('BREAKING')) {
      flags.push('urgency_manipulation');
    }
    
    if (text.match(/\d{4}/g)?.some(year => parseInt(year) > new Date().getFullYear())) {
      flags.push('future_date_claim');
    }
    
    return flags;
  }

  private async findRelatedPosts(post: SocialMediaPost): Promise<SocialMediaPost[]> {
    // Mock implementation - in real system would use vector similarity
    return [];
  }

  private generateRecommendations(riskScore: number, flags: any[]): string[] {
    const recommendations = [];
    
    if (riskScore > 0.7) {
      recommendations.push('High risk content - verify with multiple sources before sharing');
    }
    
    if (flags.some(f => f.type === 'suspicious_keyword')) {
      recommendations.push('Content contains suspicious language patterns');
    }
    
    if (flags.some(f => f.type === 'low_credibility_account')) {
      recommendations.push('Check the account\'s posting history and credibility');
    }
    
    return recommendations;
  }

  private async getInstagramContentAPI(url: string): Promise<SocialMediaPost> {
    // Instagram Basic Display API implementation
    throw new Error('Instagram API not implemented - using scraping fallback');
  }
}

export const socialMediaService = new EnhancedSocialMediaService();