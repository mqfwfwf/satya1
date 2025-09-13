-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Report cards table
CREATE TABLE IF NOT EXISTS report_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content_url TEXT,
    content_text TEXT,
    score INTEGER NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '[]',
    claims JSONB DEFAULT '[]',
    verification_results JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    difficulty TEXT DEFAULT 'medium',
    category TEXT DEFAULT 'general',
    active BOOLEAN DEFAULT true
);

-- User quiz attempts table
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
    selected_answer INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    xp_earned INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mini games table
CREATE TABLE IF NOT EXISTS mini_games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    game_type TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    content JSONB NOT NULL,
    correct_answer JSONB NOT NULL,
    explanation TEXT NOT NULL,
    xp_reward INTEGER DEFAULT 10,
    language TEXT DEFAULT 'en',
    category TEXT DEFAULT 'general',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game attempts table
CREATE TABLE IF NOT EXISTS game_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    game_id UUID REFERENCES mini_games(id) ON DELETE CASCADE,
    user_answer JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL,
    score INTEGER DEFAULT 0,
    time_spent INTEGER,
    xp_earned INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User progress table
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    total_xp INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    average_score INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, game_type)
);

-- Misinformation cache table
CREATE TABLE IF NOT EXISTS misinformation_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_hash TEXT NOT NULL UNIQUE,
    embedding TEXT,
    metadata JSONB NOT NULL,
    score INTEGER NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    details JSONB DEFAULT '[]',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media files table
CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    report_card_id UUID REFERENCES report_cards(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    metadata JSONB,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OCR results table
CREATE TABLE IF NOT EXISTS ocr_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_file_id UUID REFERENCES media_files(id) ON DELETE CASCADE,
    extracted_text TEXT NOT NULL,
    confidence INTEGER,
    language TEXT DEFAULT 'auto',
    text_regions JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deepfake analysis table
CREATE TABLE IF NOT EXISTS deepfake_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_file_id UUID REFERENCES media_files(id) ON DELETE CASCADE,
    is_deepfake BOOLEAN NOT NULL,
    confidence INTEGER NOT NULL,
    analysis_type TEXT NOT NULL,
    detection_method TEXT NOT NULL,
    evidence JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reverse image results table
CREATE TABLE IF NOT EXISTS reverse_image_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_file_id UUID REFERENCES media_files(id) ON DELETE CASCADE,
    similar_images JSONB NOT NULL,
    first_seen TIMESTAMP WITH TIME ZONE,
    sources_found JSONB,
    original_source TEXT,
    context_analysis JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_report_cards_user_id ON report_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_created_at ON report_cards(created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON user_quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON user_quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_game_attempts_user_id ON game_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_game_attempts_game_id ON game_attempts(game_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_misinformation_cache_content_hash ON misinformation_cache(content_hash);
CREATE INDEX IF NOT EXISTS idx_misinformation_cache_expires_at ON misinformation_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_media_files_user_id ON media_files(user_id);
CREATE INDEX IF NOT EXISTS idx_media_files_report_card_id ON media_files(report_card_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_media_file_id ON ocr_results(media_file_id);
CREATE INDEX IF NOT EXISTS idx_deepfake_analysis_media_file_id ON deepfake_analysis(media_file_id);
CREATE INDEX IF NOT EXISTS idx_reverse_image_results_media_file_id ON reverse_image_results(media_file_id);