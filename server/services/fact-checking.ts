import axios from "axios";
import * as cheerio from "cheerio";
import { cacheService } from "./redis-cache";

interface FactCheckResult {
  claim: string;
  rating: string;
  url: string;
  publisher: string;
  title: string;
  summary?: string;
  date?: string;
  credibilityScore: number;
}

interface GoogleFactCheckResult {
  text: string;
  claimant?: string;
  claimDate?: string;
  claimReview: Array<{
    publisher: {
      name: string;
      site: string;
    };
    url: string;
    title: string;
    reviewDate: string;
    textualRating: string;
    languageCode: string;
  }>;
}

class FactCheckingService {
  private readonly USER_AGENT = "Mozilla/5.0 (compatible; SatyaBot/1.0; +https://satya.app/bot)";
  
  /**
   * Main fact-checking orchestrator
   */
  async checkClaims(claims: string[], contentUrl?: string): Promise<FactCheckResult[]> {
    const results: FactCheckResult[] = [];
    
    // Process claims in parallel but with rate limiting
    const promises = claims.map(async (claim, index) => {
      // Add delay to avoid rate limiting
      await this.delay(index * 500);
      
      try {
        // Check multiple sources for each claim
        const [googleResults, indianResults] = await Promise.allSettled([
          this.checkGoogleFactCheck(claim),
          this.checkIndianFactCheckers(claim),
        ]);

        const allResults: FactCheckResult[] = [];

        if (googleResults.status === 'fulfilled') {
          allResults.push(...googleResults.value);
        }

        if (indianResults.status === 'fulfilled') {
          allResults.push(...indianResults.value);
        }

        // Return the best result for this claim
        return allResults.length > 0 ? allResults[0] : null;
      } catch (error) {
        console.error(`Fact-checking failed for claim: ${claim}`, error);
        return null;
      }
    });

    const resolvedResults = await Promise.all(promises);
    
    return resolvedResults.filter((result): result is FactCheckResult => result !== null);
  }

  /**
   * Google Fact Check Tools API integration
   */
  async checkGoogleFactCheck(query: string): Promise<FactCheckResult[]> {
    try {
      if (!process.env.GOOGLE_FACT_CHECK_API_KEY) {
        console.warn("GOOGLE_FACT_CHECK_API_KEY not configured");
        return [];
      }

      const cacheKey = `google-fact-check:${this.generateQueryHash(query)}`;
      const cached = await cacheService.get<FactCheckResult[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await axios.get('https://factchecktools.googleapis.com/v1alpha1/claims:search', {
        params: {
          key: process.env.GOOGLE_FACT_CHECK_API_KEY,
          query: query.substring(0, 500),
          languageCode: 'en',
          maxAgeDays: 365,
        },
        timeout: 10000,
        headers: { 'User-Agent': this.USER_AGENT },
      });

      if (!response.data.claims) {
        await cacheService.set(cacheKey, [], 3600); // Cache empty result for 1 hour
        return [];
      }

      const results = response.data.claims.map((claim: GoogleFactCheckResult) => {
        const claimReview = claim.claimReview[0]; // Take first review
        
        return {
          claim: claim.text,
          rating: claimReview.textualRating,
          url: claimReview.url,
          publisher: claimReview.publisher.name,
          title: claimReview.title,
          date: claimReview.reviewDate,
          credibilityScore: this.calculateCredibilityScore(claimReview.textualRating, claimReview.publisher.name),
        };
      });

      await cacheService.set(cacheKey, results, 3600 * 6); // Cache for 6 hours
      return results;
    } catch (error) {
      console.error('Google Fact Check API error:', error);
      return [];
    }
  }

  /**
   * Check Indian fact-checkers: BOOM Live, FactChecker.in, Fact Crescendo
   */
  async checkIndianFactCheckers(query: string): Promise<FactCheckResult[]> {
    const results: FactCheckResult[] = [];
    
    const checkers = [
      {
        name: "BOOM Live",
        searchUrl: "https://www.boomlive.in/search",
        domain: "boomlive.in",
      },
      {
        name: "FactChecker.in",
        searchUrl: "https://www.factchecker.in/search",
        domain: "factchecker.in",
      },
      {
        name: "Fact Crescendo",
        searchUrl: "https://www.factcrescendo.com/search",
        domain: "factcrescendo.com",
      },
    ];

    const promises = checkers.map(checker => 
      this.searchFactChecker(query, checker).catch(error => {
        console.error(`Error checking ${checker.name}:`, error);
        return [];
      })
    );

    const allResults = await Promise.all(promises);
    return allResults.flat();
  }

  /**
   * Search individual fact-checker websites
   */
  private async searchFactChecker(
    query: string,
    checker: { name: string; searchUrl: string; domain: string }
  ): Promise<FactCheckResult[]> {
    try {
      const cacheKey = `fact-checker:${checker.name}:${this.generateQueryHash(query)}`;
      const cached = await cacheService.get<FactCheckResult[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Use search engine to find relevant articles on fact-checker sites
      const searchQuery = `site:${checker.domain} "${query.substring(0, 200)}"`;
      const searchResults = await this.performWebSearch(searchQuery, 5);
      
      const results: FactCheckResult[] = [];
      
      for (const result of searchResults.slice(0, 3)) { // Limit to top 3 results
        try {
          const articleData = await this.scrapeFactCheckArticle(result.url, checker.name);
          if (articleData) {
            results.push({
              claim: query,
              rating: articleData.rating,
              url: result.url,
              publisher: checker.name,
              title: result.title,
              summary: articleData.summary,
              credibilityScore: this.calculateCredibilityScore(articleData.rating, checker.name),
            });
          }
        } catch (error) {
          console.error(`Error scraping ${result.url}:`, error);
        }
      }

      await cacheService.set(cacheKey, results, 3600 * 12); // Cache for 12 hours
      return results;
    } catch (error) {
      console.error(`Error searching ${checker.name}:`, error);
      return [];
    }
  }

  /**
   * Perform web search (using a search API or scraping search engine)
   */
  private async performWebSearch(query: string, maxResults: number = 10): Promise<Array<{ url: string; title: string; snippet: string }>> {
    // Mock implementation - in production, you'd use Google Custom Search API or similar
    // For now, return mock data based on the query
    if (query.toLowerCase().includes('covid') || query.toLowerCase().includes('vaccine')) {
      return [
        {
          url: 'https://www.boomlive.in/fake-news/covid-vaccine-side-effects-debunked',
          title: 'COVID Vaccine Side Effects: Separating Fact from Fiction',
          snippet: 'BOOM investigates claims about COVID vaccine side effects...'
        },
        {
          url: 'https://www.factchecker.in/covid-misinformation-tracker',
          title: 'COVID-19 Misinformation Tracker',
          snippet: 'Tracking and debunking COVID-19 related misinformation...'
        }
      ];
    }

    if (query.toLowerCase().includes('election') || query.toLowerCase().includes('voting')) {
      return [
        {
          url: 'https://www.boomlive.in/election-fact-check',
          title: 'Election 2024: Fact-Checking Viral Claims',
          snippet: 'Fact-checking viral claims about Indian elections...'
        }
      ];
    }

    // Return empty for other queries to avoid mock data pollution
    return [];
  }

  /**
   * Scrape fact-check article to extract rating and summary
   */
  private async scrapeFactCheckArticle(url: string, publisherName: string): Promise<{ rating: string; summary?: string } | null> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': this.USER_AGENT },
        maxRedirects: 5,
      });

      const $ = cheerio.load(response.data);

      let rating = 'Unknown';
      let summary = '';

      // Extract rating based on publisher
      if (publisherName === 'BOOM Live') {
        // BOOM Live specific selectors
        const ratingElement = $('.fact-check-rating, .verdict, .rating').first();
        rating = ratingElement.text().trim() || 'Unknown';
        
        const summaryElement = $('.fact-check-summary, .article-content p').first();
        summary = summaryElement.text().trim().substring(0, 300);
      } else if (publisherName === 'FactChecker.in') {
        // FactChecker.in specific selectors
        const ratingElement = $('.claim-rating, .verdict-label, .fact-rating').first();
        rating = ratingElement.text().trim() || 'Unknown';
        
        const summaryElement = $('.claim-summary, .post-content p').first();
        summary = summaryElement.text().trim().substring(0, 300);
      } else if (publisherName === 'Fact Crescendo') {
        // Fact Crescendo specific selectors
        const ratingElement = $('.rating-badge, .fact-verdict, .claim-rating').first();
        rating = ratingElement.text().trim() || 'Unknown';
        
        const summaryElement = $('.fact-summary, .content-area p').first();
        summary = summaryElement.text().trim().substring(0, 300);
      }

      // Normalize rating
      rating = this.normalizeRating(rating);

      return {
        rating,
        summary: summary || undefined,
      };
    } catch (error) {
      console.error(`Error scraping article ${url}:`, error);
      return null;
    }
  }

  /**
   * Normalize different rating systems to standard format
   */
  private normalizeRating(rating: string): string {
    const normalizedRating = rating.toLowerCase().trim();

    // True/Correct ratings
    if (normalizedRating.includes('true') || 
        normalizedRating.includes('correct') ||
        normalizedRating.includes('accurate') ||
        normalizedRating.includes('verified')) {
      return 'TRUE';
    }

    // False ratings
    if (normalizedRating.includes('false') || 
        normalizedRating.includes('fake') ||
        normalizedRating.includes('incorrect') ||
        normalizedRating.includes('debunked') ||
        normalizedRating.includes('misleading')) {
      return 'FALSE';
    }

    // Partly true/Mixed ratings
    if (normalizedRating.includes('partly') || 
        normalizedRating.includes('mixed') ||
        normalizedRating.includes('mostly') ||
        normalizedRating.includes('some truth')) {
      return 'MIXED';
    }

    // Unverifiable/Unclear ratings
    if (normalizedRating.includes('unverifiable') || 
        normalizedRating.includes('unclear') ||
        normalizedRating.includes('insufficient') ||
        normalizedRating.includes('unknown')) {
      return 'UNVERIFIABLE';
    }

    return 'UNKNOWN';
  }

  /**
   * Calculate credibility score based on rating and publisher reputation
   */
  private calculateCredibilityScore(rating: string, publisher: string): number {
    let baseScore = 50; // Default neutral score

    // Adjust based on rating
    const normalizedRating = this.normalizeRating(rating);
    switch (normalizedRating) {
      case 'FALSE':
        baseScore = 20;
        break;
      case 'TRUE':
        baseScore = 90;
        break;
      case 'MIXED':
        baseScore = 60;
        break;
      case 'UNVERIFIABLE':
        baseScore = 40;
        break;
    }

    // Publisher reputation adjustment
    const publisherScore = this.getPublisherReputationScore(publisher);
    
    // Weighted average: 70% rating, 30% publisher reputation
    return Math.round(baseScore * 0.7 + publisherScore * 0.3);
  }

  /**
   * Get publisher reputation score
   */
  private getPublisherReputationScore(publisher: string): number {
    const reputationScores: Record<string, number> = {
      'Snopes': 95,
      'FactCheck.org': 95,
      'PolitiFact': 90,
      'Reuters': 90,
      'Associated Press': 90,
      'BOOM Live': 85,
      'FactChecker.in': 80,
      'Fact Crescendo': 75,
      'Alt News': 80,
      'The Quint': 75,
      'India Today': 70,
      'Times of India': 65,
    };

    return reputationScores[publisher] || 50; // Default score for unknown publishers
  }

  /**
   * Generate hash for caching
   */
  private generateQueryHash(query: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex').substring(0, 12);
  }

  /**
   * Add delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for fact-checking services
   */
  async healthCheck(): Promise<{ service: string; status: string; error?: string }[]> {
    const checks = [
      {
        service: 'Google Fact Check API',
        test: () => this.checkGoogleFactCheck('test query'),
      },
      {
        service: 'BOOM Live',
        test: () => this.searchFactChecker('test', { 
          name: 'BOOM Live', 
          searchUrl: 'https://www.boomlive.in/search',
          domain: 'boomlive.in'
        }),
      },
    ];

    const results = await Promise.allSettled(
      checks.map(async ({ service, test }) => {
        try {
          await test();
          return { service, status: 'healthy' };
        } catch (error) {
          return { 
            service, 
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : { service: 'Unknown', status: 'error' }
    );
  }
}

export const factCheckingService = new FactCheckingService();