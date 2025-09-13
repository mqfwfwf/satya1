import axios from "axios";
import fs from "fs/promises";
import path from "path";

interface TranslationService {
  translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string>;
  translateObject(obj: Record<string, any>, targetLanguage: string, sourceLanguage?: string): Promise<Record<string, any>>;
}

class GoogleTranslationService implements TranslationService {
  private apiKey: string;
  private baseUrl = "https://translation.googleapis.com/language/translate/v2";

  constructor() {
    this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_FACT_CHECK_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Google Translate API key not found - translations will be limited");
    }
  }

  async translateText(text: string, targetLanguage: string, sourceLanguage: string = "en"): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error("Google Translate API key not configured");
      }

      const response = await axios.post(`${this.baseUrl}?key=${this.apiKey}`, {
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: "text"
      });

      return response.data.data.translations[0].translatedText;
    } catch (error) {
      console.error(`Translation failed for ${targetLanguage}:`, error);
      throw error;
    }
  }

  async translateObject(
    obj: Record<string, any>, 
    targetLanguage: string, 
    sourceLanguage: string = "en"
  ): Promise<Record<string, any>> {
    const translated: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        try {
          translated[key] = await this.translateText(value, targetLanguage, sourceLanguage);
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.warn(`Failed to translate key '${key}' for language ${targetLanguage}`);
          translated[key] = value; // Fallback to original text
        }
      } else {
        translated[key] = value; // Keep non-string values as is
      }
    }

    return translated;
  }
}

// Fallback service using a simple dictionary approach
class DictionaryTranslationService implements TranslationService {
  private translations: Record<string, Record<string, string>> = {
    // Basic translations for key terms
    "hi": {
      "Verify": "सत्यापित करें",
      "Learn": "सीखें",
      "Dashboard": "डैशबोर्ड",
      "Online": "ऑनलाइन",
      "Offline": "ऑफ़लाइन",
      "Truth": "सत्य",
      "Satya": "सत्य"
    },
    "bn": {
      "Verify": "যাচাই করুন",
      "Learn": "শিখুন", 
      "Dashboard": "ড্যাশবোর্ড",
      "Online": "অনলাইন",
      "Offline": "অফলাইন",
      "Truth": "সত্য",
      "Satya": "সত্য"
    }
    // Add more as needed
  };

  async translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    const langDict = this.translations[targetLanguage];
    if (langDict && langDict[text]) {
      return langDict[text];
    }
    return text; // Return original if no translation found
  }

  async translateObject(obj: Record<string, any>, targetLanguage: string, sourceLanguage?: string): Promise<Record<string, any>> {
    const translated: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        translated[key] = await this.translateText(value, targetLanguage, sourceLanguage);
      } else {
        translated[key] = value;
      }
    }

    return translated;
  }
}

class AutoTranslationGenerator {
  private translationService: TranslationService;
  
  // Official Indian languages with their codes
  private languages = {
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

  constructor() {
    // Try Google Translate first, fallback to dictionary
    try {
      this.translationService = new GoogleTranslationService();
    } catch (error) {
      console.warn("Google Translate not available, using dictionary fallback");
      this.translationService = new DictionaryTranslationService();
    }
  }

  async generateAllTranslations(): Promise<Record<string, any>> {
    try {
      console.log("Starting automatic translation generation...");
      
      // Read the English base file
      const englishPath = path.join(process.cwd(), "client/src/locales/en.json");
      const englishContent = await fs.readFile(englishPath, "utf-8");
      const englishTranslations = JSON.parse(englishContent);

      const results: Record<string, any> = {};

      // Generate translations for each language
      for (const [langCode, langName] of Object.entries(this.languages)) {
        console.log(`Translating to ${langName} (${langCode})...`);
        
        try {
          const localeFilePath = path.join(process.cwd(), `client/src/locales/${langCode}.json`);
          
          // Check if file already exists
          const fileExists = await fs.access(localeFilePath).then(() => true).catch(() => false);
          
          if (fileExists) {
            console.log(`${langCode}.json already exists, skipping...`);
            continue;
          }

          const translatedContent = await this.translationService.translateObject(
            englishTranslations, 
            langCode
          );

          // Save the translated file
          await fs.writeFile(
            localeFilePath, 
            JSON.stringify(translatedContent, null, 2),
            "utf-8"
          );

          results[langCode] = translatedContent;
          console.log(`✓ Generated ${langCode}.json`);
          
          // Add delay between languages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to generate translations for ${langName}:`, error);
        }
      }

      // Update the registry
      await this.updateTranslationRegistry();
      
      console.log("Translation generation completed!");
      return results;
    } catch (error) {
      console.error("Translation generation failed:", error);
      throw error;
    }
  }

  async updateTranslationRegistry(): Promise<void> {
    const registryPath = path.join(process.cwd(), "client/src/locales/registry.ts");
    
    const registryContent = `// Auto-generated translation registry
// This file is automatically updated when new translations are added

export const availableLanguages = {
${Object.entries(this.languages).map(([code, name]) => 
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
`;

    await fs.writeFile(registryPath, registryContent, "utf-8");
    console.log("✓ Updated translation registry");
  }

  async translateSpecificLanguage(languageCode: string): Promise<void> {
    const langName = this.languages[languageCode as keyof typeof this.languages];
    if (!langName) {
      throw new Error(`Unsupported language code: ${languageCode}`);
    }

    console.log(`Translating to ${langName} (${languageCode})...`);

    // Read the English base file
    const englishPath = path.join(process.cwd(), "client/src/locales/en.json");
    const englishContent = await fs.readFile(englishPath, "utf-8");
    const englishTranslations = JSON.parse(englishContent);

    const translatedContent = await this.translationService.translateObject(
      englishTranslations, 
      languageCode
    );

    // Save the translated file
    const localeFilePath = path.join(process.cwd(), `client/src/locales/${languageCode}.json`);
    await fs.writeFile(
      localeFilePath, 
      JSON.stringify(translatedContent, null, 2),
      "utf-8"
    );

    console.log(`✓ Generated ${languageCode}.json`);
  }

  async getMissingLanguages(): Promise<string[]> {
    const missing: string[] = [];
    
    for (const langCode of Object.keys(this.languages)) {
      const filePath = path.join(process.cwd(), `client/src/locales/${langCode}.json`);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      
      if (!exists) {
        missing.push(langCode);
      }
    }
    
    return missing;
  }
}

export const autoTranslationGenerator = new AutoTranslationGenerator();

// CLI usage function
export async function generateTranslations() {
  try {
    await autoTranslationGenerator.generateAllTranslations();
  } catch (error) {
    console.error("Auto-translation failed:", error);
    process.exit(1);
  }
}