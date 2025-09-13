#!/usr/bin/env node

/**
 * Auto-generate translations using Google Translate API
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

// Load environment variables
const GOOGLE_API_KEY = process.env.GOOGLE_FACT_CHECK_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ Google Translate API key not found in environment variables');
  console.error('Set GOOGLE_TRANSLATE_API_KEY or GOOGLE_FACT_CHECK_API_KEY');
  process.exit(1);
}

// Indian languages to generate
const languages = {
  "doi": "Dogri", 
  "ks": "Kashmiri",
  "kok": "Konkani", 
  "mai": "Maithili",
  "mni": "Manipuri",
  "ne": "Nepali",
  "sa": "Sanskrit", 
  "sat": "Santali",
  "sd": "Sindhi",
  "or": "Odia",
  "ur": "Urdu"
};

async function translateText(text, targetLanguage) {
  try {
    const response = await axios.post(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`, {
      q: text,
      source: 'en',
      target: targetLanguage,
      format: 'text'
    });

    return response.data.data.translations[0].translatedText;
  } catch (error) {
    console.warn(`Translation failed for ${targetLanguage}:`, error.message);
    return text; // Return original text if translation fails
  }
}

async function translateObject(obj, targetLanguage) {
  const translated = {};
  const keys = Object.keys(obj);
  
  console.log(`  Translating ${keys.length} strings...`);
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = obj[key];
    
    if (typeof value === 'string') {
      try {
        translated[key] = await translateText(value, targetLanguage);
        
        // Progress indicator
        if ((i + 1) % 10 === 0) {
          console.log(`    Progress: ${i + 1}/${keys.length}`);
        }
        
        // Rate limiting - wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.warn(`  Failed to translate '${key}': ${error.message}`);
        translated[key] = value; // Keep original
      }
    } else {
      translated[key] = value;
    }
  }
  
  return translated;
}

async function generateTranslations() {
  try {
    console.log('🌍 Starting automatic translation generation...');
    
    // Read English base file
    const englishPath = path.join(process.cwd(), 'client/src/locales/en.json');
    const englishContent = await fs.readFile(englishPath, 'utf-8');
    const englishTranslations = JSON.parse(englishContent);
    
    console.log(`📖 Loaded ${Object.keys(englishTranslations).length} strings from English base`);
    
    let successCount = 0;
    let skipCount = 0;
    
    // Generate translations for each missing language
    for (const [langCode, langName] of Object.entries(languages)) {
      console.log(`\n🔤 Translating to ${langName} (${langCode})...`);
      
      const outputPath = path.join(process.cwd(), `client/src/locales/${langCode}.json`);
      
      // Check if file already exists
      try {
        await fs.access(outputPath);
        console.log(`  ⚠️  ${langCode}.json already exists, skipping...`);
        skipCount++;
        continue;
      } catch {
        // File doesn't exist, proceed with translation
      }
      
      try {
        const translatedContent = await translateObject(englishTranslations, langCode);
        
        // Save to file
        await fs.writeFile(
          outputPath,
          JSON.stringify(translatedContent, null, 2),
          'utf-8'
        );
        
        console.log(`  ✅ Generated ${langCode}.json`);
        successCount++;
        
        // Delay between languages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`  ❌ Failed to generate ${langName}:`, error.message);
      }
    }
    
    // Update registry
    await updateRegistry();
    
    console.log(`\n🎉 Translation generation completed!`);
    console.log(`   ✅ Generated: ${successCount} languages`);
    console.log(`   ⚠️  Skipped: ${skipCount} languages`);
    
    if (successCount > 0) {
      console.log(`\n📁 New language files saved to client/src/locales/`);
    }
    
  } catch (error) {
    console.error('❌ Translation generation failed:', error.message);
    process.exit(1);
  }
}

async function updateRegistry() {
  try {
    // Read current locales directory
    const localesDir = path.join(process.cwd(), 'client/src/locales');
    const files = await fs.readdir(localesDir);
    
    // Find all JSON files
    const languageCodes = files
      .filter(file => file.endsWith('.json'))
      .map(file => path.basename(file, '.json'))
      .sort();
    
    // Language name mapping (extended)
    const allLanguages = {
      "en": "English",
      "hi": "Hindi",
      "bn": "Bengali", 
      "te": "Telugu",
      "mr": "Marathi",
      "ta": "Tamil",
      "gu": "Gujarati",
      "ur": "Urdu",
      "kn": "Kannada",
      "ml": "Malayalam",
      "or": "Odia",
      "pa": "Punjabi",
      "as": "Assamese",
      "mai": "Maithili",
      "sa": "Sanskrit",
      "ne": "Nepali",
      "sat": "Santali",
      "ks": "Kashmiri",
      "doi": "Dogri",
      "kok": "Konkani",
      "brx": "Bodo",
      "mni": "Manipuri",
      "sd": "Sindhi"
    };
    
    // Generate registry content
    const availableLanguages = {};
    languageCodes.forEach(code => {
      if (allLanguages[code]) {
        availableLanguages[code] = allLanguages[code];
      }
    });
    
    const registryContent = `// Auto-generated translation registry
// This file is automatically updated when new translations are added

export const availableLanguages = {
${Object.entries(availableLanguages).map(([code, name]) => 
  `  "${code}": "${name}"`
).join(',\n')}
};

export const loadTranslation = async (languageCode: string) => {
  try {
    const translation = await import(\`./\${languageCode}.json\`);
    return translation.default;
  } catch (error) {
    console.warn(\`Failed to load translation for \${languageCode}, falling back to English\`);
    const fallback = await import('./en.json');
    return fallback.default;
  }
};

export const getSupportedLanguages = () => Object.keys(availableLanguages);

export const getLanguageName = (code: string) => availableLanguages[code as keyof typeof availableLanguages] || code;

// RTL (Right-to-Left) languages
export const rtlLanguages = ['ur', 'ks', 'sd'];

export const isRTL = (languageCode: string) => rtlLanguages.includes(languageCode);

// Total languages supported: ${languageCodes.length}
// Generated on: ${new Date().toISOString()}
`;

    const registryPath = path.join(process.cwd(), 'client/src/locales/registry.ts');
    await fs.writeFile(registryPath, registryContent, 'utf-8');
    
    console.log(`📝 Updated registry.ts with ${languageCodes.length} languages`);
    
  } catch (error) {
    console.error('Failed to update registry:', error.message);
  }
}

// Run the translation generation
generateTranslations();