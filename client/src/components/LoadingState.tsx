import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { Card } from "@/components/ui/card";

interface LoadingStateProps {
  isVisible: boolean;
}

export default function LoadingState({ isVisible }: LoadingStateProps) {
  const { t } = useLanguage();
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = [
    t("scraping_content"),
    t("verifying_claims"),
    t("synthesizing"),
  ];

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 33;
        if (newProgress >= 100) {
          clearInterval(interval);
          return 100;
        }
        return newProgress;
      });
    }, 1000);

    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(messageInterval);
    };
  }, [isVisible, messages.length]);

  if (!isVisible) return null;

  return (
    <Card className="p-6 mb-8 fade-in" data-testid="loading-state">
      <div className="flex items-center justify-center space-x-4">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        <div className="text-center">
          <p className="font-medium text-foreground mb-2" data-testid="text-loading-message">
            {messages[messageIndex]}
          </p>
          <div className="w-64 bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
              data-testid="progress-bar"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
