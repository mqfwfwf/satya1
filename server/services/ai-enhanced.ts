/**
 * Enhanced AI Services Integration
 * Supports Gemini, OpenAI, and Hugging Face models
 */

import { GoogleGenerativeAI } from '@google/genai';
import { OpenAI } from 'openai';
import axios from 'axios';
import { cacheService } from './redis-cache';

export interface AIAnalysisRequest {
  content: string;
  type: 'text' | 'image' | 'video' | 'audio';
  fileData?: string; // Base64 encoded for non-text content
  analysisType: 'misinformation' | 'sentiment' | 'classification' | 'embedding' | 'factcheck';
  language?: string;
}

export interface AIAnalysisResult {
  confidence: number;
  classification: {
    category: string;
    subcategory?: string;
    probability: number;
  };
  sentiment?: {
    label: 'positive' | 'negative' | 'neutral';
    score: number;
  };
  entities: {
    type: string;
    value: string;
    confidence: number;
  }[];
  claims: {
    claim: string;
    confidence: number;
    verifiable: boolean;
  }[];
  embedding?: number[];
  reasoning: string;
  flags: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }[];
  sources?: string[];
}

export interface ModelConfig {
  provider: 'gemini' | 'openai' | 'huggingface';
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

class EnhancedAIService {
  private gemini: GoogleGenerativeAI | null = null;
  private openai: OpenAI | null = null;
  private huggingFaceEndpoint = 'https://api-inference.huggingface.co/models/';
  
  private models = {
    misinformation: {
      gemini: 'gemini-1.5-pro',
      openai: 'gpt-4-turbo',
      huggingface: 'martin-ha/toxic-comment-model'
    },
    sentiment: {
      huggingface: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
      openai: 'gpt-3.5-turbo'
    },
    embedding: {
      openai: 'text-embedding-3-large',
      huggingface: 'sentence-transformers/all-MiniLM-L6-v2'
    },
    classification: {
      huggingface: 'facebook/bart-large-mnli',
      gemini: 'gemini-1.5-flash'
    }
  };

  constructor() {
    this.initializeServices();
  }

  private initializeServices(): void {
    try {
      // Initialize Google Gemini
      if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) {
        const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        this.gemini = new GoogleGenerativeAI(apiKey!);
        console.log('✅ Gemini AI initialized successfully');
      } else {
        console.warn('⚠️ GOOGLE_AI_API_KEY not found - Gemini disabled');
      }

      // Initialize OpenAI
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        console.log('✅ OpenAI initialized successfully');
      } else {
        console.warn('⚠️ OPENAI_API_KEY not found - OpenAI disabled');
      }

      // Hugging Face uses API key in headers
      if (process.env.HUGGINGFACE_API_KEY) {
        console.log('✅ Hugging Face API key found');
      } else {
        console.warn('⚠️ HUGGINGFACE_API_KEY not found - Using free tier with rate limits');
      }
    } catch (error) {
      console.error('AI service initialization failed:', error);
    }
  }

  /**
   * Main analysis method - routes to appropriate AI service
   */
  async analyzeContent(request: AIAnalysisRequest, preferredProvider?: 'gemini' | 'openai' | 'huggingface'): Promise<AIAnalysisResult> {
    try {
      // Check cache first
      const cacheKey = `ai_analysis:${request.analysisType}:${Buffer.from(request.content).toString('base64')}`;
      const cached = await cacheService.get<AIAnalysisResult>(cacheKey);
      if (cached) {
        return cached;
      }

      let result: AIAnalysisResult;

      // Route to appropriate service based on analysis type and availability
      switch (request.analysisType) {
        case 'misinformation':
          result = await this.analyzeMisinformation(request, preferredProvider);
          break;
        case 'sentiment':
          result = await this.analyzeSentiment(request, preferredProvider);
          break;
        case 'classification':
          result = await this.classifyContent(request, preferredProvider);
          break;
        case 'embedding':
          result = await this.generateEmbedding(request, preferredProvider);
          break;
        case 'factcheck':
          result = await this.factCheckContent(request, preferredProvider);
          break;
        default:
          throw new Error(`Unsupported analysis type: ${request.analysisType}`);
      }

      // Cache for 1 hour
      await cacheService.set(cacheKey, result, 3600);
      
      return result;
    } catch (error) {
      console.error('AI analysis failed:', error);
      throw error;
    }
  }

  /**
   * Misinformation detection using multiple AI models
   */
  private async analyzeMisinformation(request: AIAnalysisRequest, preferredProvider?: string): Promise<AIAnalysisResult> {
    const providers = this.getAvailableProviders(preferredProvider);
    
    for (const provider of providers) {
      try {
        switch (provider) {
          case 'gemini':
            return await this.analyzeWithGemini(request);
          case 'openai':
            return await this.analyzeWithOpenAI(request);
          case 'huggingface':
            return await this.analyzeWithHuggingFace(request, 'misinformation');
        }
      } catch (error) {
        console.warn(`${provider} analysis failed, trying next provider:`, error.message);
        continue;
      }
    }

    throw new Error('All AI providers failed');
  }

  /**
   * Gemini analysis implementation
   */
  private async analyzeWithGemini(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    if (!this.gemini) {
      throw new Error('Gemini not initialized');
    }

    const model = this.gemini.getGenerativeModel({ model: this.models.misinformation.gemini });
    
    const prompt = `Analyze the following content for misinformation, fake news, or misleading claims:

Content: "${request.content}"

Please provide a detailed analysis in JSON format with:
1. Overall confidence score (0-1)
2. Classification category and probability
3. Identified entities with confidence scores
4. Specific claims that can be fact-checked
5. Reasoning for the assessment
6. Any red flags or warning signs
7. Potential sources for verification

Response format:
{
  "confidence": 0.8,
  "classification": {"category": "potentially_misleading", "probability": 0.75},
  "entities": [{"type": "person", "value": "John Doe", "confidence": 0.9}],
  "claims": [{"claim": "Specific factual claim", "confidence": 0.8, "verifiable": true}],
  "reasoning": "Detailed explanation of analysis",
  "flags": [{"type": "unverified_claim", "severity": "medium", "description": "Contains unverified statistics"}],
  "sources": ["suggested verification sources"]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return this.normalizeAnalysisResult(analysis);
      }
    } catch (parseError) {
      console.warn('Failed to parse Gemini JSON response, using fallback');
    }

    // Fallback parsing
    return this.parseTextualResponse(text, 'gemini');
  }

  /**
   * OpenAI analysis implementation
   */
  private async analyzeWithOpenAI(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    const completion = await this.openai.chat.completions.create({
      model: this.models.misinformation.openai,
      messages: [
        {
          role: "system",
          content: "You are an expert fact-checker and misinformation analyst. Analyze content for potential misinformation, fake news, or misleading claims. Always respond with valid JSON."
        },
        {
          role: "user",
          content: `Analyze this content: "${request.content}"

Provide analysis in this JSON format:
{
  "confidence": 0.8,
  "classification": {"category": "category_name", "probability": 0.75},
  "entities": [{"type": "type", "value": "value", "confidence": 0.9}],
  "claims": [{"claim": "claim_text", "confidence": 0.8, "verifiable": true}],
  "reasoning": "detailed_explanation",
  "flags": [{"type": "flag_type", "severity": "medium", "description": "description"}]
}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content!);
    return this.normalizeAnalysisResult(analysis);
  }

  /**
   * Hugging Face analysis implementation
   */
  private async analyzeWithHuggingFace(request: AIAnalysisRequest, taskType: string): Promise<AIAnalysisResult> {
    const headers = {
      'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY || ''}`,
      'Content-Type': 'application/json'
    };

    let modelName: string;
    let apiUrl: string;
    
    switch (taskType) {
      case 'misinformation':
        modelName = 'martin-ha/toxic-comment-model';
        break;
      case 'sentiment':
        modelName = this.models.sentiment.huggingface;
        break;
      case 'embedding':
        modelName = this.models.embedding.huggingface;
        break;
      default:
        modelName = 'facebook/bart-large-mnli';
    }

    apiUrl = this.huggingFaceEndpoint + modelName;

    const response = await axios.post(apiUrl, {
      inputs: request.content,
      options: { wait_for_model: true }
    }, { headers });

    return this.parseHuggingFaceResponse(response.data, taskType);
  }

  /**
   * Sentiment analysis
   */
  private async analyzeSentiment(request: AIAnalysisRequest, preferredProvider?: string): Promise<AIAnalysisResult> {
    const providers = this.getAvailableProviders(preferredProvider);
    
    for (const provider of providers) {
      try {
        if (provider === 'huggingface') {
          return await this.analyzeWithHuggingFace(request, 'sentiment');
        } else if (provider === 'openai' && this.openai) {
          const completion = await this.openai.chat.completions.create({
            model: this.models.sentiment.openai,
            messages: [
              {
                role: "system",
                content: "Analyze the sentiment of the given text. Respond with JSON containing label (positive/negative/neutral) and score (0-1)."
              },
              {
                role: "user",
                content: request.content
              }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
          });

          const result = JSON.parse(completion.choices[0].message.content!);
          return {
            confidence: result.score || 0.8,
            classification: { category: 'sentiment_analysis', probability: result.score || 0.8 },
            sentiment: { label: result.label, score: result.score },
            entities: [],
            claims: [],
            reasoning: `Sentiment analysis indicates ${result.label} sentiment with ${result.score} confidence`,
            flags: []
          };
        }
      } catch (error) {
        console.warn(`${provider} sentiment analysis failed:`, error.message);
        continue;
      }
    }

    throw new Error('All sentiment analysis providers failed');
  }

  /**
   * Generate embeddings for semantic search
   */
  private async generateEmbedding(request: AIAnalysisRequest, preferredProvider?: string): Promise<AIAnalysisResult> {
    if (this.openai && (preferredProvider === 'openai' || !preferredProvider)) {
      const embedding = await this.openai.embeddings.create({
        model: this.models.embedding.openai,
        input: request.content,
      });

      return {
        confidence: 1.0,
        classification: { category: 'embedding', probability: 1.0 },
        entities: [],
        claims: [],
        embedding: embedding.data[0].embedding,
        reasoning: 'Generated semantic embedding vector',
        flags: []
      };
    }

    // Fallback to Hugging Face
    return await this.analyzeWithHuggingFace(request, 'embedding');
  }

  /**
   * Content classification
   */
  private async classifyContent(request: AIAnalysisRequest, preferredProvider?: string): Promise<AIAnalysisResult> {
    const labels = [
      'news', 'opinion', 'advertisement', 'satire', 'misinformation', 
      'educational', 'entertainment', 'propaganda', 'factual', 'misleading'
    ];

    if (preferredProvider === 'huggingface' || !preferredProvider) {
      const headers = {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY || ''}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.post(
        this.huggingFaceEndpoint + this.models.classification.huggingface,
        {
          inputs: request.content,
          parameters: { candidate_labels: labels }
        },
        { headers }
      );

      const result = response.data;
      return {
        confidence: result.scores[0] || 0.5,
        classification: {
          category: result.labels[0] || 'unknown',
          probability: result.scores[0] || 0.5
        },
        entities: [],
        claims: [],
        reasoning: `Content classified as ${result.labels[0]} with ${(result.scores[0] * 100).toFixed(1)}% confidence`,
        flags: []
      };
    }

    throw new Error('Classification provider not available');
  }

  /**
   * Fact-checking specific analysis
   */
  private async factCheckContent(request: AIAnalysisRequest, preferredProvider?: string): Promise<AIAnalysisResult> {
    // Use Gemini or OpenAI for detailed fact-checking
    const providers = this.getAvailableProviders(preferredProvider);
    
    for (const provider of providers) {
      try {
        if (provider === 'gemini' && this.gemini) {
          return await this.factCheckWithGemini(request);
        } else if (provider === 'openai' && this.openai) {
          return await this.factCheckWithOpenAI(request);
        }
      } catch (error) {
        console.warn(`${provider} fact-check failed:`, error.message);
        continue;
      }
    }

    throw new Error('All fact-checking providers failed');
  }

  private async factCheckWithGemini(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const model = this.gemini!.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    const prompt = `Perform detailed fact-checking on this content:

"${request.content}"

Identify specific claims that can be fact-checked and provide:
1. Each verifiable claim
2. Likelihood of accuracy (0-1)
3. Potential sources for verification
4. Red flags or warning signs
5. Overall assessment

Format as JSON with verifiable claims array.`;

    const result = await model.generateContent(prompt);
    const text = (await result.response).text();
    
    return this.parseTextualResponse(text, 'gemini_factcheck');
  }

  private async factCheckWithOpenAI(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const completion = await this.openai!.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: "system",
          content: "You are a professional fact-checker. Analyze content for verifiable claims and assess their likelihood of being accurate. Respond in JSON format."
        },
        {
          role: "user",
          content: `Fact-check this content: "${request.content}"`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content!);
    return this.normalizeAnalysisResult(analysis);
  }

  /**
   * Utility methods
   */
  private getAvailableProviders(preferred?: string): string[] {
    const available = [];
    
    if (preferred) {
      if (preferred === 'gemini' && this.gemini) available.push('gemini');
      if (preferred === 'openai' && this.openai) available.push('openai');
      if (preferred === 'huggingface') available.push('huggingface');
    }
    
    // Add remaining providers
    if (this.gemini && !available.includes('gemini')) available.push('gemini');
    if (this.openai && !available.includes('openai')) available.push('openai');
    if (!available.includes('huggingface')) available.push('huggingface');
    
    return available;
  }

  private normalizeAnalysisResult(rawResult: any): AIAnalysisResult {
    return {
      confidence: rawResult.confidence || 0.5,
      classification: rawResult.classification || { category: 'unknown', probability: 0.5 },
      sentiment: rawResult.sentiment,
      entities: rawResult.entities || [],
      claims: rawResult.claims || [],
      embedding: rawResult.embedding,
      reasoning: rawResult.reasoning || 'Analysis completed',
      flags: rawResult.flags || [],
      sources: rawResult.sources
    };
  }

  private parseTextualResponse(text: string, provider: string): AIAnalysisResult {
    // Fallback parser for non-JSON responses
    const confidence = this.extractConfidenceFromText(text);
    const category = this.extractCategoryFromText(text);
    
    return {
      confidence,
      classification: { category, probability: confidence },
      entities: [],
      claims: [],
      reasoning: text.substring(0, 500) + '...',
      flags: []
    };
  }

  private parseHuggingFaceResponse(data: any, taskType: string): AIAnalysisResult {
    if (Array.isArray(data)) {
      const result = data[0];
      
      if (taskType === 'sentiment') {
        return {
          confidence: result.score || 0.5,
          classification: { category: 'sentiment', probability: result.score || 0.5 },
          sentiment: { label: result.label.toLowerCase(), score: result.score },
          entities: [],
          claims: [],
          reasoning: `Sentiment: ${result.label} (${(result.score * 100).toFixed(1)}%)`,
          flags: []
        };
      }
    }

    // Default parsing
    return {
      confidence: 0.5,
      classification: { category: 'unknown', probability: 0.5 },
      entities: [],
      claims: [],
      reasoning: 'Hugging Face analysis completed',
      flags: []
    };
  }

  private extractConfidenceFromText(text: string): number {
    const matches = text.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
    return matches ? parseFloat(matches[1]) : 0.5;
  }

  private extractCategoryFromText(text: string): string {
    const categories = ['misinformation', 'legitimate', 'suspicious', 'misleading', 'factual'];
    const textLower = text.toLowerCase();
    
    for (const category of categories) {
      if (textLower.includes(category)) {
        return category;
      }
    }
    
    return 'unknown';
  }

  /**
   * Batch analysis for multiple content pieces
   */
  async batchAnalyze(requests: AIAnalysisRequest[]): Promise<AIAnalysisResult[]> {
    const results = await Promise.allSettled(
      requests.map(request => this.analyzeContent(request))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Batch analysis failed for item ${index}:`, result.reason);
        return {
          confidence: 0,
          classification: { category: 'error', probability: 0 },
          entities: [],
          claims: [],
          reasoning: `Analysis failed: ${result.reason.message}`,
          flags: [{ type: 'analysis_error', severity: 'high', description: 'AI analysis failed' }]
        };
      }
    });
  }

  /**
   * Get service health status
   */
  getServiceHealth(): { provider: string; status: 'available' | 'unavailable' | 'degraded'; lastChecked: string }[] {
    return [
      {
        provider: 'gemini',
        status: this.gemini ? 'available' : 'unavailable',
        lastChecked: new Date().toISOString()
      },
      {
        provider: 'openai',
        status: this.openai ? 'available' : 'unavailable',
        lastChecked: new Date().toISOString()
      },
      {
        provider: 'huggingface',
        status: process.env.HUGGINGFACE_API_KEY ? 'available' : 'degraded',
        lastChecked: new Date().toISOString()
      }
    ];
  }
}

export const enhancedAIService = new EnhancedAIService();