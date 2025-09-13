/**
 * Comprehensive locale registry for all 22 official Indian languages
 * plus major regional variants according to the Constitution of India
 */

export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  direction: 'ltr' | 'rtl';
  fallback?: string;
  region?: string;
  fontFamily: string;
  unicodeRange?: string;
}

export const INDIAN_LOCALES: Record<string, LocaleInfo> = {
  // Constitutional Languages
  'en': {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    script: 'Latin',
    direction: 'ltr',
    fontFamily: '"Inter", sans-serif',
    unicodeRange: 'U+0020-007F'
  },
  'hi': {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F'
  },
  'bn': {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    script: 'Bengali',
    direction: 'ltr',
    fontFamily: '"Noto Sans Bengali", sans-serif',
    unicodeRange: 'U+0980-09FF'
  },
  'te': {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    script: 'Telugu',
    direction: 'ltr',
    fontFamily: '"Noto Sans Telugu", sans-serif',
    unicodeRange: 'U+0C00-0C7F'
  },
  'mr': {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F'
  },
  'ta': {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    script: 'Tamil',
    direction: 'ltr',
    fontFamily: '"Noto Sans Tamil", sans-serif',
    unicodeRange: 'U+0B80-0BFF'
  },
  'gu': {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    script: 'Gujarati',
    direction: 'ltr',
    fontFamily: '"Noto Sans Gujarati", sans-serif',
    unicodeRange: 'U+0A80-0AFF'
  },
  'ur': {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    script: 'Arabic',
    direction: 'rtl',
    fontFamily: '"Noto Sans Arabic", sans-serif',
    unicodeRange: 'U+0600-06FF,U+0750-077F'
  },
  'kn': {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    script: 'Kannada',
    direction: 'ltr',
    fontFamily: '"Noto Sans Kannada", sans-serif',
    unicodeRange: 'U+0C80-0CFF'
  },
  'or': {
    code: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    script: 'Odia',
    direction: 'ltr',
    fontFamily: '"Noto Sans Odia", sans-serif',
    unicodeRange: 'U+0B00-0B7F'
  },
  'ml': {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    script: 'Malayalam',
    direction: 'ltr',
    fontFamily: '"Noto Sans Malayalam", sans-serif',
    unicodeRange: 'U+0D00-0D7F'
  },
  'pa': {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    script: 'Gurmukhi',
    direction: 'ltr',
    fontFamily: '"Noto Sans Gurmukhi", sans-serif',
    unicodeRange: 'U+0A00-0A7F'
  },
  'as': {
    code: 'as',
    name: 'Assamese',
    nativeName: 'অসমীয়া',
    script: 'Bengali',
    direction: 'ltr',
    fontFamily: '"Noto Sans Bengali", sans-serif',
    unicodeRange: 'U+0980-09FF',
    fallback: 'bn'
  },
  'mai': {
    code: 'mai',
    name: 'Maithili',
    nativeName: 'मैथिली',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F',
    fallback: 'hi'
  },
  'sat': {
    code: 'sat',
    name: 'Santali',
    nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',
    script: 'Ol Chiki',
    direction: 'ltr',
    fontFamily: '"Noto Sans Ol Chiki", sans-serif',
    unicodeRange: 'U+1C50-1C7F'
  },
  'ks': {
    code: 'ks',
    name: 'Kashmiri',
    nativeName: 'کٲشُر',
    script: 'Arabic',
    direction: 'rtl',
    fontFamily: '"Noto Sans Arabic", sans-serif',
    unicodeRange: 'U+0600-06FF',
    fallback: 'ur'
  },
  'ne': {
    code: 'ne',
    name: 'Nepali',
    nativeName: 'नेपाली',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F',
    fallback: 'hi'
  },
  'kok': {
    code: 'kok',
    name: 'Konkani',
    nativeName: 'कोंकणी',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F',
    fallback: 'hi'
  },
  'sd': {
    code: 'sd',
    name: 'Sindhi',
    nativeName: 'سندھی',
    script: 'Arabic',
    direction: 'rtl',
    fontFamily: '"Noto Sans Arabic", sans-serif',
    unicodeRange: 'U+0600-06FF',
    fallback: 'ur'
  },
  'brx': {
    code: 'brx',
    name: 'Bodo',
    nativeName: 'बड़ो',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F',
    fallback: 'hi'
  },
  'doi': {
    code: 'doi',
    name: 'Dogri',
    nativeName: 'डोगरी',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F',
    fallback: 'hi'
  },
  'mni': {
    code: 'mni',
    name: 'Manipuri',
    nativeName: 'ꯃꯩꯇꯩꯂꯣꯟ',
    script: 'Meetei Mayek',
    direction: 'ltr',
    fontFamily: '"Noto Sans Meetei Mayek", sans-serif',
    unicodeRange: 'U+AAE0-AAFF,U+ABC0-ABFF'
  },
  'sa': {
    code: 'sa',
    name: 'Sanskrit',
    nativeName: 'संस्कृतम्',
    script: 'Devanagari',
    direction: 'ltr',
    fontFamily: '"Noto Sans Devanagari", sans-serif',
    unicodeRange: 'U+0900-097F',
    fallback: 'hi'
  }
};

// RTL Languages requiring special handling
export const RTL_LANGUAGES = ['ur', 'ks', 'sd'];

// Languages using the same script (for font optimization)
export const SCRIPT_GROUPS = {
  'Devanagari': ['hi', 'mr', 'mai', 'ne', 'kok', 'brx', 'doi', 'sa'],
  'Bengali': ['bn', 'as'],
  'Arabic': ['ur', 'ks', 'sd'],
  'Latin': ['en']
};

// Language detection patterns for automatic detection
export const LANGUAGE_PATTERNS = {
  'hi': /[\u0900-\u097F]/, // Devanagari
  'bn': /[\u0980-\u09FF]/, // Bengali
  'te': /[\u0C00-\u0C7F]/, // Telugu
  'ta': /[\u0B80-\u0BFF]/, // Tamil
  'gu': /[\u0A80-\u0AFF]/, // Gujarati
  'ur': /[\u0600-\u06FF]/, // Arabic
  'kn': /[\u0C80-\u0CFF]/, // Kannada
  'or': /[\u0B00-\u0B7F]/, // Odia
  'ml': /[\u0D00-\u0D7F]/, // Malayalam
  'pa': /[\u0A00-\u0A7F]/, // Gurmukhi
  'as': /[\u0980-\u09FF]/, // Bengali (Assamese variant)
  'sat': /[\u1C50-\u1C7F]/, // Ol Chiki
  'mni': /[\uAAE0-\uAAFF]|[\uABC0-\uABFF]/, // Meetei Mayek
  'en': /[a-zA-Z]/ // Latin
};

/**
 * Get locale info by code
 */
export function getLocaleInfo(code: string): LocaleInfo | undefined {
  return INDIAN_LOCALES[code];
}

/**
 * Get all available locales
 */
export function getAllLocales(): LocaleInfo[] {
  return Object.values(INDIAN_LOCALES);
}

/**
 * Check if language is RTL
 */
export function isRTL(languageCode: string): boolean {
  return RTL_LANGUAGES.includes(languageCode);
}

/**
 * Detect language from text content
 */
export function detectLanguage(text: string): string {
  const cleanText = text.trim();
  if (!cleanText) return 'en';

  // Check patterns in order of specificity
  for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    if (pattern.test(cleanText)) {
      return lang;
    }
  }

  return 'en'; // fallback to English
}

/**
 * Get font family for language
 */
export function getFontFamily(languageCode: string): string {
  const locale = getLocaleInfo(languageCode);
  return locale?.fontFamily || '"Inter", sans-serif';
}

/**
 * Get fallback language chain
 */
export function getFallbackChain(languageCode: string): string[] {
  const locale = getLocaleInfo(languageCode);
  const chain = [languageCode];
  
  if (locale?.fallback) {
    chain.push(...getFallbackChain(locale.fallback));
  }
  
  // Always fallback to English as last resort
  if (!chain.includes('en')) {
    chain.push('en');
  }
  
  return chain;
}