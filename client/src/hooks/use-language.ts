import { useState, useEffect, useCallback } from "react";
import { 
  INDIAN_LOCALES, 
  LocaleInfo, 
  detectLanguage, 
  getFallbackChain, 
  isRTL,
  getFontFamily 
} from "@/locales/registry";

type Language = keyof typeof INDIAN_LOCALES;

interface Translations {
  [key: string]: string;
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("language") as Language;
      if (saved && INDIAN_LOCALES[saved]) {
        return saved;
      }
      // Auto-detect language from browser
      return detectBrowserLanguage();
    }
    return "en";
  });
  
  const [translations, setTranslations] = useState<Translations>({});
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Detect browser language and return supported Indian language
   */
  function detectBrowserLanguage(): Language {
    if (typeof navigator === "undefined") return "en";
    
    const browserLanguages = navigator.languages || [navigator.language];
    
    for (const browserLang of browserLanguages) {
      const langCode = browserLang.split('-')[0].toLowerCase();
      if (INDIAN_LOCALES[langCode as Language]) {
        return langCode as Language;
      }
    }
    
    return "en"; // fallback
  }

  /**
   * Auto-detect language from text content
   */
  const detectFromText = useCallback((text: string): Language => {
    return detectLanguage(text) as Language;
  }, []);

  /**
   * Load translations for a specific language
   */
  const loadTranslations = useCallback(async (lang: Language) => {
    setIsLoading(true);
    try {
      // Try to load from individual locale files first
      const response = await fetch(`/src/locales/${lang}.json`);
      if (response.ok) {
        const data = await response.json();
        setTranslations(data);
        return;
      }
    } catch (error) {
      console.warn(`Failed to load ${lang}.json, trying fallback...`);
    }

    // Fallback to main translations.json
    try {
      const response = await fetch("/translations.json");
      if (response.ok) {
        const data = await response.json();
        setTranslations(data[lang] || data.en || {});
      }
    } catch (error) {
      console.error("Failed to load translations:", error);
      setTranslations({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Set language with locale updates
   */
  const setLanguage = useCallback((newLang: Language) => {
    if (!INDIAN_LOCALES[newLang]) {
      console.warn(`Unsupported language: ${newLang}`);
      return;
    }

    setLanguageState(newLang);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("language", newLang);
      
      // Update document direction for RTL languages
      const dir = isRTL(newLang) ? 'rtl' : 'ltr';
      document.documentElement.dir = dir;
      document.documentElement.lang = newLang;
      
      // Update font family
      const fontFamily = getFontFamily(newLang);
      document.documentElement.style.setProperty('--locale-font', fontFamily);
    }
  }, []);

  /**
   * Cycle through available languages (for UI toggle)
   */
  const toggleLanguage = useCallback(() => {
    const allLangs = Object.keys(INDIAN_LOCALES) as Language[];
    const currentIndex = allLangs.indexOf(language);
    const nextIndex = (currentIndex + 1) % allLangs.length;
    setLanguage(allLangs[nextIndex]);
  }, [language, setLanguage]);

  /**
   * Get next language in cycle (for preview)
   */
  const getNextLanguage = useCallback(() => {
    const allLangs = Object.keys(INDIAN_LOCALES) as Language[];
    const currentIndex = allLangs.indexOf(language);
    const nextIndex = (currentIndex + 1) % allLangs.length;
    return allLangs[nextIndex];
  }, [language]);

  /**
   * Translation function with fallback chain
   */
  const t = useCallback((key: string): string => {
    // Check current language first
    if (translations[key]) {
      return translations[key];
    }

    // Use fallback chain
    const fallbackChain = getFallbackChain(language);
    for (const fallbackLang of fallbackChain.slice(1)) {
      const fallbackTranslation = translations[key];
      if (fallbackTranslation) {
        return fallbackTranslation;
      }
    }

    // Return key if no translation found
    return key;
  }, [translations, language]);

  /**
   * Get current locale info
   */
  const getLocaleInfo = useCallback((): LocaleInfo => {
    return INDIAN_LOCALES[language];
  }, [language]);

  /**
   * Get all available locales
   */
  const getAvailableLocales = useCallback((): LocaleInfo[] => {
    return Object.values(INDIAN_LOCALES);
  }, []);

  // Load translations when language changes
  useEffect(() => {
    loadTranslations(language);
  }, [language, loadTranslations]);

  // Initialize locale settings on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dir = isRTL(language) ? 'rtl' : 'ltr';
      document.documentElement.dir = dir;
      document.documentElement.lang = language;
      
      const fontFamily = getFontFamily(language);
      document.documentElement.style.setProperty('--locale-font', fontFamily);
    }
  }, [language]);

  return {
    language,
    setLanguage,
    toggleLanguage,
    getNextLanguage,
    t,
    detectFromText,
    getLocaleInfo,
    getAvailableLocales,
    isLoading,
    isRTL: isRTL(language),
  };
}
