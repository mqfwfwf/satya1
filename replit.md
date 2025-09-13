# Project Satya - AI-Powered Misinformation Detection PWA

## Overview

Project Satya (सत्य) is a comprehensive Progressive Web App designed to combat misinformation in India. The application provides real-time content verification through a sophisticated three-tier intelligence system that can analyze text, URLs, images, and videos from various sources including social media platforms and news sites. The system combines on-device offline analysis with cloud-based AI verification to deliver credibility assessments, educational content, and interactive learning experiences.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client is built as a modern React-based Progressive Web App using:
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server
- **Tailwind CSS** with shadcn/ui components for consistent styling
- **TanStack Query** for server state management and caching
- **Wouter** for client-side routing
- **TensorFlow.js** for on-device machine learning capabilities

The PWA implements offline-first functionality with:
- Service worker for caching static assets and API responses
- IndexedDB storage for offline data persistence
- Background sync for queued operations when connectivity returns

### Backend Architecture
The server follows a Node.js Express pattern with TypeScript:
- **Express.js** server with middleware for JSON parsing and request logging
- **Drizzle ORM** with PostgreSQL for database operations
- Modular service architecture separating concerns:
  - Analysis service for coordinating content verification
  - AI services (Gemini and OpenAI) for claim extraction and verification
  - Verification service for external fact-checking API integration
  - Storage layer abstracting database operations

### Three-Tier Intelligence System
The application implements a sophisticated content analysis pipeline:

**Tier 0 (On-Device Offline)**: 
- TensorFlow.js-based semantic analysis using quantized sentence embedding models
- IndexedDB cache of up to 10,000 known misinformation patterns
- Cosine similarity matching for instant offline verification

**Tier 1 (Cloud Semantic Sync)**:
- Vector database queries using Pinecone for semantic similarity matching
- Redis caching for frequently accessed results
- Fallback when Tier 0 produces no matches

**Tier 2 (Cloud Deep Analysis)**:
- Primary AI analysis using Google Gemini 2.5 Flash
- Fallback to OpenAI GPT-5 for comprehensive content verification
- Multi-step pipeline: content ingestion → claim extraction → verification → synthesis

### Data Storage Solutions
- **PostgreSQL** via Neon for structured data (users, reports, quizzes, cache)
- **Pinecone** vector database for semantic search capabilities
- **Redis** (Upstash) for API response caching and session management
- **IndexedDB** for client-side offline storage and sync queues

### Authentication and Authorization
The application currently implements a basic user system with:
- Username/password authentication
- XP-based gamification system
- User progress tracking for educational content
- Session management for personalized experiences

## External Dependencies

### AI and ML Services
- **Google Gemini API** (1.5 Flash and Pro Vision) for text analysis and multimodal content verification
- **OpenAI GPT-5** as fallback for content analysis with browsing capabilities
- **Hugging Face** for sentence transformer embeddings
- **TensorFlow.js** for client-side machine learning inference

### Fact-Checking and Verification APIs
- **Google Fact Check Explorer API** for ClaimReview markup verification
- **ClaimBuster API** for claim detection and scoring
- **Sensity AI API** for deepfake detection in images and videos
- **InVID Verification API** for social media post metadata analysis

### Database and Storage
- **Neon Database** (PostgreSQL) for primary data storage
- **Pinecone** for vector similarity search
- **Upstash Redis** for caching and session management

### Development and Deployment
- **Vercel** or **Replit** for application hosting
- **Vite** for frontend build optimization
- **Drizzle Kit** for database schema management and migrations
- Various Radix UI components for accessible interface elements

### Social Media Integration
- Platform-specific APIs and scraping capabilities for:
  - Twitter/X post verification
  - Instagram content analysis
  - Facebook post fact-checking
- oEmbed API support for social media content embedding