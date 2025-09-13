/**
 * Enhanced Fact-Checking Services Integration
 * Supports Google Fact Check API, Indian fact-checkers, ClaimBuster, and more
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cacheService } from './redis-enhanced';

export interface FactCheckClaim {
  claim: string;
  claimant?: string;
  claimDate?: string;
  confidence: number;
  extractionMethod: 'automatic' | 'manual' | 'ai';
}

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'mixture' | 'unproven' | 'disputed' | 'unknown';
  credibilityScore: number;
  sources: {
    name: string;
    url: string;
    verdict: string;
    date: string;
    credibility: number;
  }[];
  explanation: string;
  relatedClaims: string[];
  flags: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }[];
}

export interface FactCheckAnalysis {
  overallVerdict: 'reliable' | 'questionable' | 'false';
  confidence: number;
  checkedClaims: FactCheckResult[];
  uncheckableClaims: string[];
  summary: string;
  recommendations: string[];
}

export interface IndianFactChecker {
  name: string;
  baseUrl: string;
  searchPath: string;
  credibilityScore: number;
  language: string[];
}

class EnhancedFactCheckingService {
  private googleFactCheckApiKey = process.env.GOOGLE_FACT_CHECK_API_KEY || process.env.GOOGLE_AI_API_KEY;
  
  private indianFactCheckers: IndianFactChecker[] = [
    {
      name: 'BOOM Live',
      baseUrl: 'https://www.boomlive.in',
      searchPath: '/search',
      credibilityScore: 0.85,
      language: ['en', 'hi']
    },
    {
      name: 'Alt News',
      baseUrl: 'https://www.altnews.in',
      searchPath: '/search',
      credibilityScore: 0.90,
      language: ['en', 'hi']
    },
    {
      name: 'FactChecker.in',
      baseUrl: 'https://www.factchecker.in',
      searchPath: '/search',
      credibilityScore: 0.88,
      language: ['en']
    },
    {
      name: 'Fact Crescendo',
      baseUrl: 'https://www.factcrescendo.com',
      searchPath: '/search',
      credibilityScore: 0.82,
      language: ['en', 'hi', 'te', 'ta']
    },
    {
      name: 'Vishvas News',
      baseUrl: 'https://www.vishvasnews.com',
      searchPath: '/search',
      credibilityScore: 0.83,
      language: ['en', 'hi']
    },
    {
      name: 'Newschecker',
      baseUrl: 'https://www.newschecker.in',
      searchPath: '/search',
      credibilityScore: 0.85,
      language: ['en', 'hi']
    },
    {
      name: 'D-Intent',
      baseUrl: 'https://www.d-intent.com',
      searchPath: '/search',
      credibilityScore: 0.80,
      language: ['en']
    },
    {
      name: 'Quint WebQoof',
      baseUrl: 'https://www.thequint.com/news/webqoof',
      searchPath: '/search',
      credibilityScore: 0.87,
      language: ['en', 'hi']
    }
  ];

  private claimBusterEndpoint = 'https://idir.uta.edu/claimbuster/api/v2/score/text';
  private politiFactEndpoint = 'https://www.politifact.com/api/statements/truth-o-meter/';

  /**
   * Main fact-checking method - orchestrates multiple sources
   */
  async checkFacts(content: string, language: string = 'en'): Promise<FactCheckAnalysis> {
    try {
      // Check cache first
      const cacheKey = `factcheck:${Buffer.from(content).toString('base64')}:${language}`;
      const cached = await cacheService.get<FactCheckAnalysis>(cacheKey);
      if (cached) {
        return cached;
      }

      // Step 1: Extract verifiable claims from content
      const claims = await this.extractClaims(content);
      
      // Step 2: Check each claim across multiple sources
      const checkedClaims: FactCheckResult[] = [];
      const uncheckableClaims: string[] = [];

      for (const claim of claims) {
        try {
          const result = await this.checkSingleClaim(claim, language);
          if (result.credibilityScore > 0.1) {
            checkedClaims.push(result);
          } else {
            uncheckableClaims.push(claim.claim);
          }
        } catch (error) {
          console.warn(`Failed to check claim: ${claim.claim}`, error.message);
          uncheckableClaims.push(claim.claim);
        }
      }

      // Step 3: Aggregate results
      const analysis = this.aggregateResults(checkedClaims, uncheckableClaims);
      
      // Cache for 6 hours
      await cacheService.set(cacheKey, analysis, { ttl: 21600 });
      
      return analysis;
    } catch (error) {
      console.error('Fact-checking analysis failed:', error);
      throw error;
    }
  }

  /**
   * Extract verifiable claims using AI and heuristics
   */
  private async extractClaims(content: string): Promise<FactCheckClaim[]> {
    const claims: FactCheckClaim[] = [];

    // Heuristic-based claim extraction
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      
      // Look for factual claim indicators
      const claimIndicators = [
        /\d+%/, // Percentages
        /\d{4}/, // Years
        /according to/i,
        /studies show/i,
        /research indicates/i,
        /statistics reveal/i,
        /data shows/i,
        /reported that/i,
        /\d+\s+(million|billion|thousand)/i,
        /increased by/i,
        /decreased by/i,
        /announced that/i,
        /confirmed that/i
      ];

      const hasClaimIndicator = claimIndicators.some(pattern => pattern.test(trimmed));
      
      if (hasClaimIndicator && trimmed.length > 20 && trimmed.length < 200) {
        claims.push({
          claim: trimmed,
          confidence: hasClaimIndicator ? 0.7 : 0.4,
          extractionMethod: 'automatic'
        });
      }
    }

    // Named entity-based extraction
    const namedEntityClaims = this.extractNamedEntityClaims(content);
    claims.push(...namedEntityClaims);

    return claims.slice(0, 10); // Limit to top 10 claims
  }

  private extractNamedEntityClaims(content: string): FactCheckClaim[] {
    const claims: FactCheckClaim[] = [];
    
    // Look for person + action patterns
    const personActionPattern = /([A-Z][a-z]+ [A-Z][a-z]+)\s+(said|claimed|announced|declared|stated)\s+that\s+([^.!?]+)/g;
    let match;
    
    while ((match = personActionPattern.exec(content)) !== null) {
      claims.push({
        claim: match[3].trim(),
        claimant: match[1],
        confidence: 0.8,
        extractionMethod: 'automatic'
      });
    }

    return claims;
  }

  /**
   * Check a single claim across multiple fact-checking sources
   */
  private async checkSingleClaim(claim: FactCheckClaim, language: string): Promise<FactCheckResult> {
    const sources = [];
    let overallVerdict: FactCheckResult['verdict'] = 'unknown';
    let credibilityScore = 0;

    // Check Google Fact Check API
    try {
      const googleResults = await this.checkGoogleFactCheck(claim.claim, language);
      sources.push(...googleResults);
    } catch (error) {
      console.warn('Google Fact Check API failed:', error.message);
    }

    // Check Indian fact-checkers
    try {
      const indianResults = await this.checkIndianFactCheckers(claim.claim, language);
      sources.push(...indianResults);
    } catch (error) {
      console.warn('Indian fact-checkers check failed:', error.message);
    }

    // Check ClaimBuster
    try {
      const claimBusterResults = await this.checkClaimBuster(claim.claim);
      sources.push(...claimBusterResults);
    } catch (error) {
      console.warn('ClaimBuster check failed:', error.message);
    }

    // Check PolitiFact
    try {
      const politiFactResults = await this.checkPolitiFact(claim.claim);
      sources.push(...politiFactResults);
    } catch (error) {
      console.warn('PolitiFact check failed:', error.message);
    }

    // Aggregate verdicts
    if (sources.length > 0) {
      const { verdict, score } = this.aggregateVerdicts(sources);
      overallVerdict = verdict;
      credibilityScore = score;
    }

    return {
      claim: claim.claim,
      verdict: overallVerdict,
      credibilityScore,
      sources,
      explanation: this.generateExplanation(claim.claim, sources, overallVerdict),
      relatedClaims: this.findRelatedClaims(claim.claim, sources),
      flags: this.generateFlags(claim.claim, sources, credibilityScore)
    };
  }

  /**
   * Google Fact Check API integration
   */
  private async checkGoogleFactCheck(query: string, language: string): Promise<FactCheckResult['sources']> {
    if (!this.googleFactCheckApiKey) {
      return [];
    }

    try {
      const response = await axios.get('https://factchecktools.googleapis.com/v1alpha1/claims:search', {
        params: {
          key: this.googleFactCheckApiKey,
          query,
          languageCode: language,
          maxAgeDays: 365,
          pageSize: 10
        }
      });

      const claims = response.data.claims || [];
      
      return claims.map((claim: any) => ({
        name: 'Google Fact Check',
        url: claim.claimReview?.[0]?.url || '',
        verdict: this.normalizeVerdict(claim.claimReview?.[0]?.textualRating || 'unknown'),
        date: claim.claimReview?.[0]?.reviewDate || new Date().toISOString().split('T')[0],
        credibility: 0.9
      }));
    } catch (error) {
      console.error('Google Fact Check API error:', error);
      return [];
    }
  }

  /**
   * Check Indian fact-checking websites
   */
  private async checkIndianFactCheckers(query: string, language: string): Promise<FactCheckResult['sources']> {
    const results: FactCheckResult['sources'] = [];
    
    const relevantCheckers = this.indianFactCheckers.filter(
      checker => checker.language.includes(language) || checker.language.includes('en')
    );

    for (const checker of relevantCheckers.slice(0, 4)) { // Check top 4 to avoid rate limits
      try {
        const searchResults = await this.scrapeFactChecker(checker, query);
        results.push(...searchResults);
      } catch (error) {
        console.warn(`Failed to check ${checker.name}:`, error.message);
      }
    }

    return results;
  }

  private async scrapeFactChecker(checker: IndianFactChecker, query: string): Promise<FactCheckResult['sources']> {
    try {
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      const searchUrl = `${checker.baseUrl}${checker.searchPath}?q=${encodeURIComponent(query)}`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results: FactCheckResult['sources'] = [];

      // Generic selectors for fact-check results
      const selectors = [
        'article', '.post', '.entry', '.search-result', 
        '.fact-check', '.verdict', '.story'
      ];

      for (const selector of selectors) {
        const elements = $(selector).slice(0, 3); // Top 3 results
        
        elements.each((i, element) => {
          const $element = $(element);
          const title = $element.find('h1, h2, h3, .title, .headline').first().text().trim();
          const link = $element.find('a').first().attr('href');
          const snippet = $element.find('p, .excerpt, .summary').first().text().trim();

          if (title && link && this.isRelevant(title + ' ' + snippet, query)) {
            const fullUrl = link.startsWith('http') ? link : `${checker.baseUrl}${link}`;
            
            results.push({
              name: checker.name,
              url: fullUrl,
              verdict: this.extractVerdictFromText(title + ' ' + snippet),
              date: new Date().toISOString().split('T')[0],
              credibility: checker.credibilityScore
            });
          }
        });

        if (results.length > 0) break; // Found results with this selector
      }

      return results;
    } catch (error) {
      console.error(`Scraping error for ${checker.name}:`, error.message);
      return [];
    }
  }

  /**
   * ClaimBuster API integration
   */
  private async checkClaimBuster(claim: string): Promise<FactCheckResult['sources']> {
    try {
      const response = await axios.post(this.claimBusterEndpoint, {
        input_text: claim
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      const score = response.data.results?.[0]?.score || 0;
      
      if (score > 0.5) {
        return [{
          name: 'ClaimBuster',
          url: 'https://idir.uta.edu/claimbuster/',
          verdict: score > 0.7 ? 'disputed' : 'mixture',
          date: new Date().toISOString().split('T')[0],
          credibility: 0.75
        }];
      }

      return [];
    } catch (error) {
      console.error('ClaimBuster API error:', error);
      return [];
    }
  }

  /**
   * PolitiFact integration (web scraping)
   */
  private async checkPolitiFact(claim: string): Promise<FactCheckResult['sources']> {
    try {
      const searchUrl = `https://www.politifact.com/search/?q=${encodeURIComponent(claim)}`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results: FactCheckResult['sources'] = [];

      $('.m-statement__quote').slice(0, 3).each((i, element) => {
        const $element = $(element);
        const $parent = $element.closest('.m-statement');
        const quote = $element.text().trim();
        const verdict = $parent.find('.c-image__original').attr('alt') || '';
        const link = $parent.find('a').attr('href');
        const date = $parent.find('.m-statement__footer time').text().trim();

        if (quote && link && this.isRelevant(quote, claim)) {
          results.push({
            name: 'PolitiFact',
            url: link.startsWith('http') ? link : `https://www.politifact.com${link}`,
            verdict: this.normalizePolitiFactVerdict(verdict),
            date: date || new Date().toISOString().split('T')[0],
            credibility: 0.85
          });
        }
      });

      return results;
    } catch (error) {
      console.error('PolitiFact scraping error:', error);
      return [];
    }
  }

  /**
   * Utility methods for result processing
   */
  private aggregateVerdicts(sources: FactCheckResult['sources']): { verdict: FactCheckResult['verdict']; score: number } {
    if (sources.length === 0) {
      return { verdict: 'unknown', score: 0 };
    }

    const verdictWeights = {
      'true': 1,
      'false': -1,
      'mixture': 0,
      'disputed': -0.5,
      'unproven': 0.2,
      'unknown': 0
    };

    let weightedSum = 0;
    let totalWeight = 0;

    sources.forEach(source => {
      const weight = source.credibility;
      const verdictWeight = verdictWeights[source.verdict as keyof typeof verdictWeights] || 0;
      weightedSum += verdictWeight * weight;
      totalWeight += weight;
    });

    const averageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const credibilityScore = Math.abs(averageScore);

    let verdict: FactCheckResult['verdict'];
    if (averageScore > 0.6) verdict = 'true';
    else if (averageScore < -0.6) verdict = 'false';
    else if (averageScore < -0.2) verdict = 'disputed';
    else if (averageScore > 0.2) verdict = 'mixture';
    else verdict = 'unproven';

    return { verdict, score: credibilityScore };
  }

  private normalizeVerdict(verdict: string): string {
    const v = verdict.toLowerCase();
    
    if (v.includes('true') || v.includes('correct') || v.includes('accurate')) return 'true';
    if (v.includes('false') || v.includes('incorrect') || v.includes('fake')) return 'false';
    if (v.includes('mixture') || v.includes('mixed') || v.includes('partial')) return 'mixture';
    if (v.includes('disputed') || v.includes('misleading') || v.includes('cherry')) return 'disputed';
    if (v.includes('unproven') || v.includes('unclear') || v.includes('needs context')) return 'unproven';
    
    return 'unknown';
  }

  private normalizePolitiFactVerdict(verdict: string): string {
    const v = verdict.toLowerCase();
    
    if (v.includes('true')) return 'true';
    if (v.includes('false') || v.includes('pants on fire')) return 'false';
    if (v.includes('half') || v.includes('mostly')) return 'mixture';
    if (v.includes('barely')) return 'disputed';
    
    return 'unknown';
  }

  private extractVerdictFromText(text: string): string {
    const lowerText = text.toLowerCase();
    
    // Look for explicit verdict keywords
    if (lowerText.includes('fake') || lowerText.includes('false') || lowerText.includes('hoax')) {
      return 'false';
    }
    if (lowerText.includes('true') || lowerText.includes('verified') || lowerText.includes('confirmed')) {
      return 'true';
    }
    if (lowerText.includes('misleading') || lowerText.includes('disputed')) {
      return 'disputed';
    }
    if (lowerText.includes('mixed') || lowerText.includes('partial')) {
      return 'mixture';
    }
    
    return 'unknown';
  }

  private isRelevant(text: string, query: string): boolean {
    const textWords = text.toLowerCase().split(/\W+/);
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    
    const matchCount = queryWords.filter(word => 
      textWords.some(textWord => textWord.includes(word) || word.includes(textWord))
    ).length;
    
    return matchCount >= Math.min(2, queryWords.length * 0.3);
  }

  private generateExplanation(claim: string, sources: FactCheckResult['sources'], verdict: string): string {
    if (sources.length === 0) {
      return `No reliable fact-checking sources found for this claim: "${claim}"`;
    }

    const sourceNames = sources.map(s => s.name).join(', ');
    return `Based on ${sources.length} fact-checking source(s) including ${sourceNames}, this claim appears to be ${verdict}.`;
  }

  private findRelatedClaims(claim: string, sources: FactCheckResult['sources']): string[] {
    // In a real implementation, this would use semantic similarity
    return [];
  }

  private generateFlags(claim: string, sources: FactCheckResult['sources'], credibilityScore: number): FactCheckResult['flags'] {
    const flags = [];

    if (sources.length === 0) {
      flags.push({
        type: 'no_sources',
        severity: 'medium' as const,
        description: 'No fact-checking sources found for verification'
      });
    }

    if (credibilityScore < 0.3) {
      flags.push({
        type: 'disputed_claim',
        severity: 'high' as const,
        description: 'Multiple sources dispute this claim'
      });
    }

    if (sources.some(s => s.verdict === 'false')) {
      flags.push({
        type: 'false_information',
        severity: 'high' as const,
        description: 'Claim contradicted by reliable fact-checkers'
      });
    }

    return flags;
  }

  private aggregateResults(checkedClaims: FactCheckResult[], uncheckableClaims: string[]): FactCheckAnalysis {
    let overallVerdict: FactCheckAnalysis['overallVerdict'] = 'reliable';
    let totalConfidence = 0;

    if (checkedClaims.length === 0) {
      return {
        overallVerdict: 'questionable',
        confidence: 0.1,
        checkedClaims: [],
        uncheckableClaims,
        summary: 'No verifiable claims found in the content.',
        recommendations: ['Seek additional sources for verification', 'Be cautious about sharing unverified information']
      };
    }

    // Calculate overall verdict
    const falseCount = checkedClaims.filter(c => c.verdict === 'false').length;
    const disputedCount = checkedClaims.filter(c => c.verdict === 'disputed').length;
    const trueCount = checkedClaims.filter(c => c.verdict === 'true').length;

    if (falseCount > 0) {
      overallVerdict = 'false';
      totalConfidence = 0.8;
    } else if (disputedCount > trueCount) {
      overallVerdict = 'questionable';
      totalConfidence = 0.5;
    } else {
      totalConfidence = checkedClaims.reduce((sum, claim) => sum + claim.credibilityScore, 0) / checkedClaims.length;
    }

    return {
      overallVerdict,
      confidence: totalConfidence,
      checkedClaims,
      uncheckableClaims,
      summary: this.generateSummary(checkedClaims, overallVerdict),
      recommendations: this.generateRecommendations(overallVerdict, checkedClaims)
    };
  }

  private generateSummary(claims: FactCheckResult[], verdict: string): string {
    const sourceCount = new Set(claims.flatMap(c => c.sources.map(s => s.name))).size;
    return `Analysis of ${claims.length} claims using ${sourceCount} fact-checking sources indicates the content is ${verdict}.`;
  }

  private generateRecommendations(verdict: string, claims: FactCheckResult[]): string[] {
    const recommendations = [];

    switch (verdict) {
      case 'false':
        recommendations.push('Do not share this content as it contains false information');
        recommendations.push('Report misinformation to platform moderators');
        break;
      case 'questionable':
        recommendations.push('Verify information with additional reliable sources');
        recommendations.push('Be cautious about sharing without verification');
        break;
      default:
        recommendations.push('Content appears reliable but always verify important information');
    }

    return recommendations;
  }

  /**
   * Quick fact-check for real-time analysis
   */
  async quickCheck(claim: string): Promise<{ verdict: string; confidence: number; source: string }> {
    try {
      // Check cache first
      const cacheKey = `quickcheck:${Buffer.from(claim).toString('base64')}`;
      const cached = await cacheService.get<any>(cacheKey);
      if (cached) {
        return cached;
      }

      // Try Google Fact Check API first (fastest)
      if (this.googleFactCheckApiKey) {
        const results = await this.checkGoogleFactCheck(claim, 'en');
        if (results.length > 0) {
          const result = {
            verdict: results[0].verdict,
            confidence: results[0].credibility,
            source: results[0].name
          };
          
          await cacheService.set(cacheKey, result, { ttl: 3600 });
          return result;
        }
      }

      // Fallback to single Indian fact-checker
      const checker = this.indianFactCheckers[0];
      const results = await this.scrapeFactChecker(checker, claim);
      if (results.length > 0) {
        const result = {
          verdict: results[0].verdict,
          confidence: results[0].credibility,
          source: results[0].name
        };
        
        await cacheService.set(cacheKey, result, { ttl: 1800 });
        return result;
      }

      return {
        verdict: 'unknown',
        confidence: 0,
        source: 'none'
      };
    } catch (error) {
      console.error('Quick fact-check failed:', error);
      return {
        verdict: 'unknown',
        confidence: 0,
        source: 'error'
      };
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{ service: string; status: 'available' | 'degraded' | 'unavailable' }[]> {
    const services = [
      { name: 'Google Fact Check API', check: () => !!this.googleFactCheckApiKey },
      { name: 'Indian Fact-checkers', check: () => this.indianFactCheckers.length > 0 },
      { name: 'ClaimBuster', check: async () => {
        try {
          const response = await axios.get(this.claimBusterEndpoint, { timeout: 5000 });
          return response.status === 200;
        } catch {
          return false;
        }
      }}
    ];

    const results = [];
    
    for (const service of services) {
      try {
        const isAvailable = typeof service.check === 'function' ? 
          await service.check() : service.check;
        
        results.push({
          service: service.name,
          status: isAvailable ? 'available' as const : 'degraded' as const
        });
      } catch (error) {
        results.push({
          service: service.name,
          status: 'unavailable' as const
        });
      }
    }

    return results;
  }
}

export const enhancedFactCheckingService = new EnhancedFactCheckingService();