interface FactCheckResult {
  url: string;
  title: string;
  publisher: string;
  rating: string;
  claim: string;
  language?: string;
  publishedDate?: string;
  credibilityScore?: number;
}

interface VerificationResult {
  factCheckResults: FactCheckResult[];
  deepfakeScore?: number;
  sourceCredibility?: {
    domainAge: number;
    hasAuthor: boolean;
    hasContactInfo: boolean;
    httpsEnabled: boolean;
    isKnownReliableSource: boolean;
    socialMediaPresence: boolean;
  };
  indianFactCheckerResults?: FactCheckResult[];
  aggregatedRating?: "TRUE" | "FALSE" | "MIXED" | "UNVERIFIABLE";
  confidenceScore?: number;
}

export class VerificationService {
  async runVerificationChecks(
    result: any,
    request: any,
  ): Promise<VerificationResult> {
    const verificationResult: VerificationResult = {
      factCheckResults: [],
      indianFactCheckerResults: [],
    };

    try {
      // Extract claims for verification
      const claimsToCheck = [];

      if (result.claims && result.claims.length > 0) {
        claimsToCheck.push(...result.claims.map((claim: any) => claim.text));
      }

      // If no explicit claims, use the content or summary
      if (claimsToCheck.length === 0) {
        if (request.content) {
          claimsToCheck.push(request.content.substring(0, 200));
        } else if (result.summary) {
          claimsToCheck.push(result.summary.substring(0, 200));
        }
      }

      // Run parallel fact-checking from multiple sources
      const verificationPromises = [];

      for (const claim of claimsToCheck) {
        // Google Fact Check API
        verificationPromises.push(this.checkFactCheckExplorer(claim));

        // Indian fact-checkers
        verificationPromises.push(this.checkIndianFactCheckers(claim));
      }

      const allResults = await Promise.allSettled(verificationPromises);

      // Process Google fact-check results
      for (let i = 0; i < allResults.length; i += 2) {
        if (allResults[i].status === "fulfilled") {
          verificationResult.factCheckResults.push(
            ...(allResults[i] as PromiseFulfilledResult<FactCheckResult[]>)
              .value,
          );
        }
        if (allResults[i + 1] && allResults[i + 1].status === "fulfilled") {
          verificationResult.indianFactCheckerResults?.push(
            ...(allResults[i + 1] as PromiseFulfilledResult<FactCheckResult[]>)
              .value,
          );
        }
      }

      // Check for deepfakes if it's media content
      if (request.fileData && request.fileType?.startsWith("image/")) {
        verificationResult.deepfakeScore = await this.checkDeepfake(
          request.fileData,
        );
      }

      // Analyze source credibility if URL provided
      if (request.url) {
        verificationResult.sourceCredibility =
          await this.analyzeSourceCredibility(request.url);
      }

      // Calculate aggregated rating and confidence
      const aggregation = this.aggregateVerificationResults(verificationResult);
      verificationResult.aggregatedRating = aggregation.rating;
      verificationResult.confidenceScore = aggregation.confidence;

      return verificationResult;
    } catch (error) {
      console.error("Verification checks failed:", error);
      return verificationResult;
    }
  }

  private async checkFactCheckExplorer(
    claim: string,
  ): Promise<FactCheckResult[]> {
    try {
      // Google Fact Check Explorer API (free)
      const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY;
      if (!apiKey) {
        console.warn("Google Fact Check API key not available");
        return [];
      }

      const response = await fetch(
        `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(claim)}&key=${apiKey}`,
      );

      if (!response.ok) {
        throw new Error(`Fact Check API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.claims) {
        return [];
      }

      return data.claims.map((item: any) => ({
        url: item.claimReview?.[0]?.url || "",
        title: item.text || "",
        publisher: item.claimReview?.[0]?.publisher?.name || "Unknown",
        rating: item.claimReview?.[0]?.textualRating || "Unknown",
        claim: item.text || claim,
      }));
    } catch (error) {
      console.error("Fact Check Explorer API failed:", error);
      return [];
    }
  }

  private async checkDeepfake(imageData: string): Promise<number> {
    try {
      // Mock Sensity AI API call (would require actual API key and endpoint)
      const apiKey = process.env.SENSITY_API_KEY;
      if (!apiKey) {
        console.warn("Sensity AI API key not available");
        return 0; // Default to no deepfake detected
      }

      // This would be the actual Sensity AI API call
      // const response = await fetch('https://api.sensity.ai/v1/detect', {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${apiKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     image: imageData,
      //     model: 'general',
      //   }),
      // });

      // For now, return a mock confidence score
      return Math.random() * 0.3; // Most images are not deepfakes
    } catch (error) {
      console.error("Deepfake detection failed:", error);
      return 0;
    }
  }

  private async analyzeSourceCredibility(url: string): Promise<{
    domainAge: number;
    hasAuthor: boolean;
    hasContactInfo: boolean;
    httpsEnabled: boolean;
    isKnownReliableSource: boolean;
    socialMediaPresence: boolean;
  }> {
    try {
      const parsedUrl = new URL(url);

      // Basic credibility checks
      const httpsEnabled = parsedUrl.protocol === "https:";

      // In a production system, these would involve:
      // - WHOIS API calls for domain age
      // - Content analysis for author information
      // - Contact page detection

      return {
        domainAge: 365, // Mock: days since domain registration
        hasAuthor: Math.random() > 0.5, // Mock: detected author information
        hasContactInfo: Math.random() > 0.3, // Mock: found contact information
        httpsEnabled,
        isKnownReliableSource: this.isKnownReliableSource(parsedUrl.hostname),
        socialMediaPresence: await this.checkSocialMediaPresence(
          parsedUrl.hostname,
        ),
      };
    } catch (error) {
      console.error("Source credibility analysis failed:", error);
      return {
        domainAge: 0,
        hasAuthor: false,
        hasContactInfo: false,
        httpsEnabled: false,
        isKnownReliableSource: false,
        socialMediaPresence: false,
      };
    }
  }

  async checkClaimBuster(claim: string): Promise<{
    checkWorthiness: number;
    confidence: number;
  }> {
    try {
      // ClaimBuster API for claim worthiness detection
      const apiKey = process.env.CLAIMBUSTER_API_KEY;
      if (!apiKey) {
        return { checkWorthiness: 0.5, confidence: 0.5 };
      }

      const response = await fetch(
        "https://idir.uta.edu/claimbuster/api/v2/score/text/",
        {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input_text: claim }),
        },
      );

      if (!response.ok) {
        throw new Error(`ClaimBuster API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        checkWorthiness: data.score || 0.5,
        confidence: data.confidence || 0.5,
      };
    } catch (error) {
      console.error("ClaimBuster API failed:", error);
      return { checkWorthiness: 0.5, confidence: 0.5 };
    }
  }

  async reverseImageSearch(imageData: string): Promise<{
    similarImages: Array<{
      url: string;
      source: string;
      similarity: number;
    }>;
  }> {
    try {
      // TinEye or Google Reverse Image Search would be used here
      // This is a mock implementation
      return {
        similarImages: [],
      };
    } catch (error) {
      console.error("Reverse image search failed:", error);
      return { similarImages: [] };
    }
  }

  /**
   * Check Indian fact-checking websites for claims
   */
  private async checkIndianFactCheckers(
    claim: string,
  ): Promise<FactCheckResult[]> {
    const results: FactCheckResult[] = [];

    try {
      // Search BOOM Live
      const boomResults = await this.searchBoomLive(claim);
      results.push(...boomResults);

      // Search Fact Crescendo
      const crescendoResults = await this.searchFactCrescendo(claim);
      results.push(...crescendoResults);

      // Search FactChecker.in
      const factCheckerResults = await this.searchFactCheckerIn(claim);
      results.push(...factCheckerResults);

      return results;
    } catch (error) {
      console.error("Indian fact-checker search failed:", error);
      return results;
    }
  }

  /**
   * Search BOOM Live for fact-checks
   */
  private async searchBoomLive(claim: string): Promise<FactCheckResult[]> {
    try {
      // Basic search on BOOM Live website
      // In production, this would use more sophisticated scraping
      const searchUrl = `https://www.boomlive.in/search?q=${encodeURIComponent(claim)}`;

      // Mock result for now - would implement actual scraping
      if (
        claim.toLowerCase().includes("covid") ||
        claim.toLowerCase().includes("vaccine")
      ) {
        return [
          {
            url: "https://www.boomlive.in/fact-check/sample",
            title: "Fact Check: Sample COVID-19 claim verification",
            publisher: "BOOM Live",
            rating: "FALSE",
            claim: claim.substring(0, 100),
            language: "en",
            publishedDate: new Date().toISOString(),
            credibilityScore: 85,
          },
        ];
      }

      return [];
    } catch (error) {
      console.error("BOOM Live search failed:", error);
      return [];
    }
  }

  /**
   * Search Fact Crescendo for fact-checks
   */
  private async searchFactCrescendo(claim: string): Promise<FactCheckResult[]> {
    try {
      // Mock search results - would implement actual API/scraping
      if (
        claim.toLowerCase().includes("politics") ||
        claim.toLowerCase().includes("election")
      ) {
        return [
          {
            url: "https://www.factcrescendo.com/sample-fact-check",
            title: "Political Claim Verification",
            publisher: "Fact Crescendo",
            rating: "MIXED",
            claim: claim.substring(0, 100),
            language: "hi",
            publishedDate: new Date().toISOString(),
            credibilityScore: 78,
          },
        ];
      }

      return [];
    } catch (error) {
      console.error("Fact Crescendo search failed:", error);
      return [];
    }
  }

  /**
   * Search FactChecker.in for fact-checks
   */
  private async searchFactCheckerIn(claim: string): Promise<FactCheckResult[]> {
    try {
      // Mock search results - would implement actual scraping
      return [];
    } catch (error) {
      console.error("FactChecker.in search failed:", error);
      return [];
    }
  }

  /**
   * Aggregate verification results from multiple sources
   */
  private aggregateVerificationResults(results: VerificationResult): {
    rating: "TRUE" | "FALSE" | "MIXED" | "UNVERIFIABLE";
    confidence: number;
  } {
    const allResults = [
      ...results.factCheckResults,
      ...(results.indianFactCheckerResults || []),
    ];

    if (allResults.length === 0) {
      return { rating: "UNVERIFIABLE", confidence: 0 };
    }

    // Count ratings
    const ratingCounts = {
      TRUE: 0,
      FALSE: 0,
      MIXED: 0,
      UNVERIFIABLE: 0,
    };

    let totalCredibility = 0;
    let credibilityCount = 0;

    for (const result of allResults) {
      const normalizedRating = this.normalizeRating(result.rating);
      ratingCounts[normalizedRating]++;

      if (result.credibilityScore) {
        totalCredibility += result.credibilityScore;
        credibilityCount++;
      }
    }

    // Determine overall rating
    let finalRating: "TRUE" | "FALSE" | "MIXED" | "UNVERIFIABLE";

    if (ratingCounts.FALSE > 0 && ratingCounts.TRUE > 0) {
      finalRating = "MIXED";
    } else if (ratingCounts.FALSE > ratingCounts.TRUE) {
      finalRating = "FALSE";
    } else if (ratingCounts.TRUE > 0) {
      finalRating = "TRUE";
    } else {
      finalRating = "UNVERIFIABLE";
    }

    // Calculate confidence score
    const avgCredibility =
      credibilityCount > 0 ? totalCredibility / credibilityCount : 50;
    const sourcesCount = allResults.length;
    const consensus =
      Math.max(...Object.values(ratingCounts)) / allResults.length;

    const confidence = Math.round(
      avgCredibility * 0.5 + sourcesCount * 10 + consensus * 40,
    );

    return { rating: finalRating, confidence: Math.min(100, confidence) };
  }

  /**
   * Normalize different rating formats to standard values
   */
  private normalizeRating(
    rating: string,
  ): "TRUE" | "FALSE" | "MIXED" | "UNVERIFIABLE" {
    const lowerRating = rating.toLowerCase();

    if (
      lowerRating.includes("true") ||
      lowerRating.includes("accurate") ||
      lowerRating.includes("correct")
    ) {
      return "TRUE";
    } else if (
      lowerRating.includes("false") ||
      lowerRating.includes("fake") ||
      lowerRating.includes("misleading")
    ) {
      return "FALSE";
    } else if (
      lowerRating.includes("mixed") ||
      lowerRating.includes("partial")
    ) {
      return "MIXED";
    } else {
      return "UNVERIFIABLE";
    }
  }

  /**
   * Check if domain is a known reliable source
   */
  private isKnownReliableSource(domain: string): boolean {
    const reliableSources = [
      "reuters.com",
      "bbc.com",
      "cnn.com",
      "apnews.com",
      "npr.org",
      "thehindu.com",
      "indianexpress.com",
      "livemint.com",
      "ndtv.com",
      "boomlive.in",
      "factcrescendo.com",
      "factchecker.in",
      "altnews.in",
      "snopes.com",
      "factcheck.org",
    ];

    return reliableSources.some((source) => domain.includes(source));
  }

  /**
   * Check social media presence of domain
   */
  private async checkSocialMediaPresence(domain: string): Promise<boolean> {
    try {
      // In production, this would check for verified social media accounts
      // For now, return true for known sources
      return this.isKnownReliableSource(domain);
    } catch (error) {
      console.error("Social media presence check failed:", error);
      return false;
    }
  }
}

export const verificationService = new VerificationService();
