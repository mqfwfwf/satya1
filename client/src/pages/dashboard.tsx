import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Heatmap from "@/components/Heatmap";
import { CheckCircle, AlertTriangle, Zap, TrendingUp, Calendar, Clock } from "lucide-react";
import { apiClient } from "@/utils/api";

export default function Dashboard() {
  const { t } = useLanguage();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => apiClient.getDashboardStats(),
  });

  const { data: recentReports } = useQuery({
    queryKey: ["dashboard", "recent-reports"],
    queryFn: async () => {
      const response = await fetch("/api/reports/recent");
      if (!response.ok) throw new Error("Failed to fetch recent reports");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="py-16 px-4 min-h-screen" data-testid="dashboard-loading">
        <div className="container mx-auto max-w-6xl">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="py-16 px-4 min-h-screen" data-testid="dashboard-page">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold mb-4">{t("misinformation_dashboard")}</h2>
          <p className="text-xl text-muted-foreground">{t("realtime_insights")}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <Card className="p-6 shadow-lg" data-testid="card-articles-verified">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t("articles_verified")}</h3>
              <CheckCircle className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-bold text-primary mb-2" data-testid="text-verified-count">
              {stats?.articlesVerified?.toLocaleString() || "0"}
            </div>
            <p className="text-sm text-muted-foreground">{t("this_month")}</p>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-chart-2 mr-1" />
              <span className="text-chart-2">+12.3% from last month</span>
            </div>
          </Card>

          <Card className="p-6 shadow-lg" data-testid="card-misleading-detected">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t("misleading_detected")}</h3>
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div className="text-3xl font-bold text-destructive mb-2" data-testid="text-misleading-count">
              {stats?.misleadingDetected?.toLocaleString() || "0"}
            </div>
            <p className="text-sm text-muted-foreground">{t("this_month")}</p>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-destructive mr-1" />
              <span className="text-destructive">+8.7% from last month</span>
            </div>
          </Card>

          <Card className="p-6 shadow-lg" data-testid="card-learning-progress">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t("learning_progress")}</h3>
              <Zap className="w-5 h-5 text-chart-2" />
            </div>
            <div className="text-3xl font-bold text-chart-2 mb-2" data-testid="text-xp-count">
              {stats?.xpEarned?.toLocaleString() || "0"}
            </div>
            <p className="text-sm text-muted-foreground">{t("xp_earned")}</p>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Level Progress</span>
                <span>Level 8</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-chart-2 h-2 rounded-full" style={{ width: "68%" }} />
              </div>
            </div>
          </Card>
        </div>

        {/* Heatmap */}
        <div className="mb-12">
          <Heatmap />
        </div>

        {/* Recent Activity & Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Reports */}
          <Card className="p-6 shadow-lg" data-testid="card-recent-reports">
            <h3 className="text-xl font-semibold mb-6">Recent Verifications</h3>
            <div className="space-y-4">
              {recentReports?.slice(0, 5).map((report: any, index: number) => (
                <div key={index} className="flex items-start space-x-4 p-4 border border-border rounded-lg">
                  <div className={`w-3 h-3 rounded-full mt-2 ${
                    report.score >= 70 ? "bg-chart-2" :
                    report.score >= 40 ? "bg-chart-3" : "bg-destructive"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={
                        report.score >= 70 ? "bg-chart-2/10 text-chart-2" :
                        report.score >= 40 ? "bg-chart-3/10 text-chart-3" : 
                        "bg-destructive/10 text-destructive"
                      }>
                        {report.status}
                      </Badge>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(report.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {report.summary}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        Score: {report.score}/100
                      </span>
                      {report.contentUrl && (
                        <a 
                          href={report.contentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          View Source
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {(!recentReports || recentReports.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No recent verifications</p>
                  <p className="text-sm">Start analyzing content to see your activity here</p>
                </div>
              )}
            </div>
          </Card>

          {/* Analytics Summary */}
          <Card className="p-6 shadow-lg" data-testid="card-analytics">
            <h3 className="text-xl font-semibold mb-6">Analytics Overview</h3>
            
            {/* Weekly Trends */}
            <div className="space-y-6">
              <div>
                <h4 className="font-medium mb-4">Weekly Verification Trends</h4>
                <div className="space-y-3">
                  {[
                    { day: "Monday", count: 23, trend: "up" },
                    { day: "Tuesday", count: 31, trend: "up" },
                    { day: "Wednesday", count: 28, trend: "down" },
                    { day: "Thursday", count: 35, trend: "up" },
                    { day: "Friday", count: 42, trend: "up" },
                    { day: "Saturday", count: 19, trend: "down" },
                    { day: "Sunday", count: 15, trend: "down" },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.day}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${(item.count / 50) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Content Sources */}
              <div>
                <h4 className="font-medium mb-4">Top Content Sources</h4>
                <div className="space-y-3">
                  {[
                    { source: "WhatsApp", count: 89, percentage: 45 },
                    { source: "Twitter/X", count: 67, percentage: 34 },
                    { source: "Facebook", count: 32, percentage: 16 },
                    { source: "Instagram", count: 15, percentage: 8 },
                    { source: "News Sites", count: 23, percentage: 12 },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.source}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div 
                            className="bg-chart-1 h-1.5 rounded-full" 
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-6">{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Accuracy Metrics */}
              <div className="pt-4 border-t border-border">
                <h4 className="font-medium mb-4">Detection Accuracy</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-chart-2/10 rounded-lg">
                    <div className="text-lg font-bold text-chart-2">94.2%</div>
                    <div className="text-xs text-muted-foreground">True Positives</div>
                  </div>
                  <div className="text-center p-3 bg-chart-3/10 rounded-lg">
                    <div className="text-lg font-bold text-chart-3">2.1%</div>
                    <div className="text-xs text-muted-foreground">False Positives</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mt-12">
          <Card className="p-6 shadow-lg" data-testid="card-quick-actions">
            <h3 className="text-xl font-semibold mb-6">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button className="p-4 border border-border rounded-lg hover:bg-accent transition text-left">
                <Calendar className="w-6 h-6 text-primary mb-2" />
                <h4 className="font-medium mb-1">Schedule Report</h4>
                <p className="text-sm text-muted-foreground">Generate weekly analytics report</p>
              </button>
              
              <button className="p-4 border border-border rounded-lg hover:bg-accent transition text-left">
                <TrendingUp className="w-6 h-6 text-chart-2 mb-2" />
                <h4 className="font-medium mb-1">Export Data</h4>
                <p className="text-sm text-muted-foreground">Download verification history</p>
              </button>
              
              <button className="p-4 border border-border rounded-lg hover:bg-accent transition text-left">
                <Zap className="w-6 h-6 text-chart-3 mb-2" />
                <h4 className="font-medium mb-1">API Access</h4>
                <p className="text-sm text-muted-foreground">Integrate with your applications</p>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
