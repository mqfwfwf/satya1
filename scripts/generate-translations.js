#!/usr/bin/env node

/**
 * Auto-generate translations for all Indian languages
 * Usage: node scripts/generate-translations.js [language-code]
 */

import { autoTranslationGenerator } from '../server/services/translation.js';

async function main() {
  const args = process.argv.slice(2);
  const specificLanguage = args[0];

  try {
    if (specificLanguage) {
      console.log(`Generating translation for language: ${specificLanguage}`);
      await autoTranslationGenerator.translateSpecificLanguage(specificLanguage);
    } else {
      console.log("Generating translations for all missing languages...");
      const missing = await autoTranslationGenerator.getMissingLanguages();
      
      if (missing.length === 0) {
        console.log("✓ All translations are already present!");
        return;
      }

      console.log(`Found ${missing.length} missing languages: ${missing.join(', ')}`);
      console.log("Starting automatic translation...");
      
      // Check if Google Translate API key is available
      if (!process.env.GOOGLE_TRANSLATE_API_KEY && !process.env.GOOGLE_FACT_CHECK_API_KEY) {
        console.warn("⚠️  No Google Translate API key found.");
        console.log("Set GOOGLE_TRANSLATE_API_KEY environment variable for automatic translation.");
        console.log("Proceeding with dictionary-based fallback translations...");
      }

      await autoTranslationGenerator.generateAllTranslations();
      
      console.log("🎉 Translation generation completed!");
      console.log(`Generated ${missing.length} language files.`);
    }
  } catch (error) {
    console.error("❌ Translation generation failed:", error.message);
    process.exit(1);
  }
}

main();