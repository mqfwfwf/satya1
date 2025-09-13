import OpenAI from "openai";
import type { AnalysisResult, Claim } from "@shared/schema";

// the newest OpenAI model for general use is "gpt-4o-mini" with good cost/performance balance
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class OpenAIService {
  async analyzeContent(content: string, contentUrl?: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      // Extract claims first
      const claims = await this.extractClaims(content);
      
      // Verify each claim
      const verifiedClaims = await Promise.all(
        claims.map(claim => this.verifyClaim(claim))
      );

      // Generate overall analysis
      const analysis = await this.generateOverallAnalysis(content, verifiedClaims, contentUrl);
      
      const processingTime = Date.now() - startTime;

      return {
        ...analysis,
        claims: verifiedClaims,
        processingTime,
        aiModel: "GPT-4o-mini",
      };
    } catch (error) {
      console.error("OpenAI analysis failed:", error);
      throw new Error(`OpenAI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractClaims(content: string): Promise<string[]> {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract 3-5 key factual claims from the given content that can be verified. Return a JSON object with a 'claims' array property containing the claim strings."
        },
        {
          role: "user",
          content: `Content: ${content}`
        }
      ],
      response_format: { type: "json_object" },
    });

    try {
      const content = response.choices[0].message.content || "{}";
      // Remove code fences if present
      const cleanContent = content.replace(/^```json\n?|```$/g, '').trim();
      const result = JSON.parse(cleanContent);
      return result.claims || [];
    } catch (error) {
      console.error("Failed to parse claims JSON:", error);
      return [];
    }
  }

  private async verifyClaim(claimText: string): Promise<Claim> {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Verify the given claim and provide structured analysis. Respond with JSON containing: text, verdict (True/False/Mixed/Unverifiable), confidence (0-1), evidence (string), and sources (array of objects with url, title, source).`
        },
        {
          role: "user",
          content: `Verify this claim: "${claimText}"`
        }
      ],
      response_format: { type: "json_object" },
    });

    try {
      const content = response.choices[0].message.content || "{}";
      // Remove code fences if present
      const cleanContent = content.replace(/^```json\n?|```$/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      return {
        text: claimText,
        verdict: result.verdict || "Unverifiable",
        confidence: result.confidence || 0,
        evidence: result.evidence || "No evidence available",
        sources: result.sources || [],
      };
    } catch (error) {
      console.error("Failed to parse claim verification JSON:", error);
      return {
        text: claimText,
        verdict: "Unverifiable",
        confidence: 0,
        evidence: "Failed to parse verification result",
        sources: [],
      };
    }
  }

  private async generateOverallAnalysis(
    content: string, 
    claims: Claim[], 
    contentUrl?: string
  ): Promise<Omit<AnalysisResult, 'claims' | 'processingTime' | 'aiModel'>> {
    const claimsContext = claims.map(claim => 
      `Claim: "${claim.text}" - Verdict: ${claim.verdict} (${Math.round(claim.confidence * 100)}% confidence)`
    ).join('\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze content for misinformation based on claim verification results. Provide JSON with: score (0-100), status (Credible/Questionable/Misleading/Extremely Misleading), summary, and details array with section, status, finding, and proof fields.`
        },
        {
          role: "user",
          content: `Content: ${content}
${contentUrl ? `Source URL: ${contentUrl}` : ''}

Claim Analysis Results:
${claimsContext}

Analyze for source reliability, emotional manipulation, logical fallacies, and evidence quality.`
        }
      ],
      response_format: { type: "json_object" },
    });

    try {
      const content = response.choices[0].message.content || "{}";
      // Remove code fences if present
      const cleanContent = content.replace(/^```json\n?|```$/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      return {
        score: result.score || 50,
        status: result.status || "Questionable",
        summary: result.summary || "Analysis could not be completed",
        details: result.details || [],
      };
    } catch (error) {
      console.error("Failed to parse analysis JSON:", error);
      return {
        score: 50,
        status: "Questionable",
        summary: "Analysis could not be completed due to parsing error",
        details: [],
      };
    }
  }

  async analyzeImage(imageData: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Analyze this image for misinformation indicators including manipulation, deepfakes, misleading context. Respond with JSON containing score, status, summary, and details."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image for potential misinformation, manipulation, or misleading context."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`
                }
              }
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const processingTime = Date.now() - startTime;

      return {
        score: result.score || 50,
        status: result.status || "Questionable",
        summary: result.summary || "Image analysis completed",
        details: result.details || [],
        claims: [],
        processingTime,
        aiModel: "GPT-4o Vision",
      };
    } catch (error) {
      console.error("OpenAI image analysis failed:", error);
      throw new Error(`OpenAI image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const openaiService = new OpenAIService();
