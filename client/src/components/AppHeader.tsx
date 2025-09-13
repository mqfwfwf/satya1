import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { useLanguage } from "@/hooks/use-language";
import { useOffline } from "@/hooks/use-offline";
import { Button } from "@/components/ui/button";
import { CheckCircle, Moon, Sun, Globe, Wifi, WifiOff } from "lucide-react";

export default function AppHeader() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const isOffline = useOffline();

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <div className="flex items-center space-x-2 cursor-pointer">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-serif font-bold">
                  {t("app_name")}{" "}
                  <span className="text-sm font-mono text-muted-foreground">
                    {language === "en" ? "सत्य" : "Truth"}
                  </span>
                </h1>
              </div>
            </Link>
            
            <nav className="hidden md:flex space-x-6">
              <Link href="/">
                <span
                  className={`font-medium transition cursor-pointer ${
                    location === "/" 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="nav-verify"
                >
                  {t("verify")}
                </span>
              </Link>
              <Link href="/learn">
                <span
                  className={`font-medium transition cursor-pointer ${
                    location === "/learn" 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="nav-learn"
                >
                  {t("learn")}
                </span>
              </Link>
              <Link href="/dashboard">
                <span
                  className={`font-medium transition cursor-pointer ${
                    location === "/dashboard" 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="nav-dashboard"
                >
                  {t("dashboard")}
                </span>
              </Link>
              <Link href="/games">
                <span
                  className={`font-medium transition cursor-pointer ${
                    location === "/games" 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="nav-games"
                >
                  {t("games") || "Games"}
                </span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {/* Language Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              className="flex items-center space-x-2"
              data-testid="button-language-toggle"
            >
              <Globe className="w-4 h-4" />
              <span className="text-sm font-medium">
                {language.toUpperCase()}
              </span>
            </Button>

            {/* Dark Mode Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "light" ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </Button>

            {/* Online/Offline Indicator */}
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
                isOffline
                  ? "bg-destructive/10 text-destructive"
                  : "bg-chart-2/10 text-chart-2"
              }`}
              data-testid="status-connection"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isOffline ? "bg-destructive" : "bg-chart-2"
                }`}
              />
              <span>{isOffline ? t("offline") : t("online")}</span>
              {isOffline ? (
                <WifiOff className="w-4 h-4" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
