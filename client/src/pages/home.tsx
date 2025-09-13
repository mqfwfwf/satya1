import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import InputForm from "@/components/InputForm";
import LoadingState from "@/components/LoadingState";
import ReportCard from "@/components/ReportCard";
import { useLanguage } from "@/hooks/use-language";
import { useOffline } from "@/hooks/use-offline";
import { tier0Analyzer } from "@/utils/tier0";
import { apiClient } from "@/utils/api";
import { offlineManager } from "@/utils/offline";
import { useToast } from "@/hooks/use-toast";
import type { AnalysisResult } from "@shared/schema";

export default function Home() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOffline = useOffline();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const analysisMutation = useMutation({
    mutationFn: async (request: any) => {
      // Determine content to analyze
      let contentToAnalyze = "";
      if (request.content) {
        contentToAnalyze = request.content;
      } else if (request.url) {
        // For URLs when offline, use the URL text itself for basic analysis
        contentToAnalyze = isOffline ? request.url : "";
      }

      // Try Tier 0 (offline) analysis first if we have content
      if (contentToAnalyze) {
        console.log("Attempting Tier 0 offline analysis...");
        const tier0Result = await tier0Analyzer.analyze(contentToAnalyze);
        if (tier0Result) {
          console.log("Tier 0 analysis successful");
          return {
            score: tier0Result.metadata.score,
            status: tier0Result.metadata.status,
            summary: tier0Result.metadata.summary,
            details: tier0Result.metadata.details,
            claims: [],
            processingTime: 100,
            aiModel: "Tier 0 (Offline Analysis)",
          } as AnalysisResult;
        }
      }

      // If offline, always try to provide some analysis rather than just queuing
      if (isOffline) {
        if (contentToAnalyze) {
          // Force offline analysis for any text content
          console.log("Forcing offline analysis for new content...");
          try {
            const embedding = await tier0Analyzer.generateEmbedding(contentToAnalyze);
            const analysis = tier0Analyzer.performOfflineAnalysis(contentToAnalyze, embedding);
            
            // Cache this new analysis
            await tier0Analyzer.cacheResult(contentToAnalyze, analysis);
            
            return {
              score: analysis.score,
              status: analysis.status,
              summary: analysis.summary,
              details: analysis.details,
              claims: [],
              processingTime: 200,
              aiModel: "Tier 0 (Offline Analysis)",
            } as AnalysisResult;
          } catch (offlineError) {
            console.error("Offline analysis failed:", offlineError);
          }
        }

        // Queue for later and provide fallback message
        await offlineManager.addToQueue("analysis", request);
        
        return {
          score: 50,
          status: "Questionable",
          summary: "Content queued for analysis when online. Limited offline analysis available for this type of content.",
          details: [{
            section: "Offline Mode",
            status: "Caution",
            finding: "Full analysis requires internet connection. Content has been queued for processing when you're back online.",
            proof: [{
              url: "https://satya.app/offline",
              source: "Offline Analysis"
            }]
          }],
          claims: [],
          processingTime: 50,
          aiModel: "Offline Queue",
        } as AnalysisResult;
      }

      // Online analysis via API
      return apiClient.analyzeContent(request);
    },
    onSuccess: (result) => {
      setAnalysisResult(result);
      
      // Cache result for offline use (Tier 0)
      if (result.aiModel !== "Tier 0 (Offline Cache)") {
        // Cache the result for future offline use
        // This would typically be done automatically by the tier0Analyzer
      }
    },
    onError: (error: any) => {
      if (error.message === "offline_queued") {
        toast({
          title: "Queued for analysis",
          description: "Your request has been queued and will be processed when you're back online.",
        });
      } else {
        toast({
          title: "Analysis failed",
          description: "Could not analyze the content. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const saveReportMutation = useMutation({
    mutationFn: () => apiClient.saveReport(analysisResult),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const handleAnalyze = (request: any) => {
    setAnalysisResult(null);
    analysisMutation.mutate(request);
  };

  const handleSaveReport = async () => {
    if (isOffline) {
      await offlineManager.addToQueue("report", analysisResult);
      toast({
        title: "Report queued",
        description: "Report will be saved when you're back online.",
      });
    } else {
      await saveReportMutation.mutateAsync();
    }
  };

  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="mb-8">
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-foreground">
              {t("tagline")}
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("description")}
            </p>
          </div>

          <InputForm
            onAnalyze={handleAnalyze}
            isLoading={analysisMutation.isPending}
          />

          <LoadingState isVisible={analysisMutation.isPending} />
        </div>
      </section>

      {/* Report Card Section */}
      {analysisResult && (
        <section className="py-8 px-4" data-testid="report-section">
          <div className="container mx-auto max-w-4xl">
            <ReportCard
              result={analysisResult}
              onSave={handleSaveReport}
            />
          </div>
        </section>
      )}

      {/* Trust Indicators Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-serif font-bold mb-4">{t("trusted_by_experts")}</h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
            {t("verification_partners")}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {[
              { name: "Fact Check Explorer", org: "Google" },
              { name: "InVID Verification", org: "EU Research" },
              { name: "Sensity AI", org: "Deepfake Detection" },
              { name: "ClaimBuster", org: "Fact Verification" },
            ].map((partner, index) => (
              <div key={index} className="bg-card border border-border rounded-lg p-6 shadow-sm">
                <div className="h-12 bg-muted rounded flex items-center justify-center mb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {partner.name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{partner.org}</p>
              </div>
            ))}
          </div>

          {/* Verification Process */}
          <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
            <h3 className="text-xl font-semibold mb-6">Our Verification Process</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                </div>
                <h4 className="font-semibold mb-2">{t("multi_source_search")}</h4>
                <p className="text-sm text-muted-foreground">{t("multi_source_desc")}</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <h4 className="font-semibold mb-2">{t("ai_powered_analysis")}</h4>
                <p className="text-sm text-muted-foreground">{t("ai_analysis_desc")}</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
                  </svg>
                </div>
                <h4 className="font-semibold mb-2">{t("transparency")}</h4>
                <p className="text-sm text-muted-foreground">{t("transparency_desc")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <span className="font-serif font-bold">{t("app_name")}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("description")}
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Features</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Content Verification</li>
                <li>Deepfake Detection</li>
                <li>Media Literacy</li>
                <li>Offline Support</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Help Center</li>
                <li>API Documentation</li>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Connect</h3>
              <div className="text-sm text-muted-foreground">
                <p>🇮🇳 Made in India</p>
                <p>Open Source</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-muted-foreground mb-4 md:mb-0">
              © 2024 Project Satya. Privacy-first misinformation detection.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
