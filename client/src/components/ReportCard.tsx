import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, Save, ExternalLink, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AnalysisResult } from "@shared/schema";

interface ReportCardProps {
  result: AnalysisResult;
  onSave?: () => void;
}

export default function ReportCard({ result, onSave }: ReportCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "credible":
        return "bg-chart-2/10 text-chart-2";
      case "questionable":
        return "bg-chart-3/10 text-chart-3";
      case "misleading":
      case "extremely misleading":
        return "bg-destructive/10 text-destructive";
      default:
        return "bg-muted/10 text-muted-foreground";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "from-chart-2 to-chart-2/80";
    if (score >= 40) return "from-chart-3 to-chart-3/80";
    return "from-destructive to-destructive/80";
  };

  const getDetailStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "true":
        return <CheckCircle className="w-4 h-4 text-chart-2" />;
      case "false":
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-chart-3" />;
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${t("credibility_report")} - ${result.status}`,
          text: result.summary,
          url: window.location.href,
        });
      } catch (error) {
        console.log("Share cancelled");
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(
          `${t("credibility_report")}\nScore: ${result.score}/100\nStatus: ${result.status}\n\n${result.summary}\n\nView full report: ${window.location.href}`
        );
        toast({
          title: "Copied to clipboard",
          description: "Report summary has been copied to your clipboard.",
        });
      } catch (error) {
        toast({
          title: "Share failed",
          description: "Could not share the report. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    
    setIsSaving(true);
    try {
      await onSave();
      toast({
        title: "Report saved",
        description: "The report has been saved to your dashboard.",
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Could not save the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-lg overflow-hidden fade-in" data-testid="report-card">
      {/* Header with Score */}
      <div className={`bg-gradient-to-r ${getScoreColor(result.score)} p-6 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-serif font-bold">{t("credibility_report")}</h3>
            <p className="text-white/80">{t("analysis_completed")}</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold" data-testid="text-credibility-score">
              {result.score}
            </div>
            <div className="text-sm font-medium">{t("credibility_score")}</div>
            <div className="text-xs opacity-80">{t("out_of_100")}</div>
          </div>
        </div>
      </div>

      {/* Overall Status */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3 mb-4">
          <Badge className={getStatusColor(result.status)} data-testid="badge-status">
            {result.status}
          </Badge>
        </div>
        <p className="text-foreground" data-testid="text-summary">
          {result.summary}
        </p>
      </div>

      {/* Detailed Analysis */}
      <div className="p-6 space-y-6">
        {result.details.map((detail, index) => (
          <div key={index} className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-foreground">{detail.section}</h4>
              <div className="flex items-center space-x-2">
                {getDetailStatusIcon(detail.status)}
                <Badge variant="outline" className={getStatusColor(detail.status)}>
                  {detail.status}
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground text-sm mb-3">{detail.finding}</p>
            
            {detail.proof.length > 0 && (
              <div className="space-y-2">
                {detail.proof.map((source, sourceIndex) => (
                  <a
                    key={sourceIndex}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-sm text-primary hover:underline"
                    data-testid={`link-source-${index}-${sourceIndex}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{source.source}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Claims Analysis */}
        {result.claims && result.claims.length > 0 && (
          <div className="border border-border rounded-lg p-4">
            <h4 className="font-semibold text-foreground mb-3">Claims Analysis</h4>
            <div className="space-y-3">
              {result.claims.map((claim, index) => (
                <div key={index} className="p-3 bg-muted/30 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={getStatusColor(claim.verdict)}>
                      {claim.verdict}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(claim.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-1">{claim.text}</p>
                  <p className="text-xs text-muted-foreground">{claim.evidence}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-t border-border bg-muted/30">
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={handleShare}
            className="flex items-center justify-center space-x-2"
            data-testid="button-share"
          >
            <Share2 className="w-4 h-4" />
            <span>{t("share_report")}</span>
          </Button>

          {onSave && (
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center space-x-2"
              data-testid="button-save"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? "Saving..." : t("save_to_dashboard")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Processing Info */}
      <div className="px-6 pb-4">
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>Processed in {result.processingTime}ms</span>
          <span>AI Model: {result.aiModel}</span>
        </div>
      </div>
    </Card>
  );
}
