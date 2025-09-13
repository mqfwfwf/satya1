import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/utils/api";

export default function Heatmap() {
  const { t } = useLanguage();

  const { data: stats } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => apiClient.getDashboardStats(),
  });

  const hotspots = stats?.hotspots?.map((spot, index) => ({
    ...spot,
    x: [200, 180, 170, 280, 190][index] || 200,
    y: [300, 150, 350, 220, 420][index] || 300,
  })) || [
    { state: "Maharashtra", riskLevel: "high" as const, count: 45, x: 200, y: 300 },
    { state: "Delhi", riskLevel: "medium" as const, count: 23, x: 180, y: 150 },
    { state: "Karnataka", riskLevel: "low" as const, count: 12, x: 170, y: 350 },
    { state: "West Bengal", riskLevel: "high" as const, count: 38, x: 280, y: 220 },
    { state: "Tamil Nadu", riskLevel: "medium" as const, count: 19, x: 190, y: 420 },
  ];

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "var(--destructive)";
      case "medium":
        return "var(--chart-3)";
      case "low":
        return "var(--chart-2)";
      default:
        return "var(--muted-foreground)";
    }
  };

  const getRiskRadius = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return 8;
      case "medium":
        return 6;
      case "low":
        return 4;
      default:
        return 3;
    }
  };

  return (
    <Card className="p-8 shadow-lg" data-testid="heatmap">
      <h3 className="text-xl font-semibold mb-6 text-center">
        {t("misinformation_hotspots")}
      </h3>
      
      <div className="relative bg-muted/30 rounded-lg p-8 min-h-[400px] flex items-center justify-center">
        <div className="relative w-full max-w-md mx-auto">
          <svg viewBox="0 0 400 500" className="w-full h-auto" data-testid="india-map">
            {/* Simplified India outline */}
            <path
              d="M100 100 L300 100 L350 200 L320 400 L250 450 L150 450 L80 350 L100 100 Z"
              fill="var(--muted)"
              stroke="var(--border)"
              strokeWidth="2"
            />

            {/* Regional hotspots */}
            {hotspots.map((hotspot, index) => (
              <g key={index}>
                <circle
                  cx={hotspot.x}
                  cy={hotspot.y}
                  r={getRiskRadius(hotspot.riskLevel)}
                  fill={getRiskColor(hotspot.riskLevel)}
                  className="pulse-dot"
                  opacity="0.8"
                  data-testid={`hotspot-${hotspot.state.toLowerCase().replace(/\s+/g, '-')}`}
                />
                <text
                  x={hotspot.x + 15}
                  y={hotspot.y + 5}
                  className="text-xs fill-current text-foreground"
                  data-testid={`text-${hotspot.state.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {hotspot.state}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center space-x-6 mt-6">
        <div className="flex items-center space-x-2" data-testid="legend-high">
          <div className="w-3 h-3 bg-destructive rounded-full" />
          <span className="text-sm text-muted-foreground">{t("high_risk")}</span>
        </div>
        <div className="flex items-center space-x-2" data-testid="legend-medium">
          <div className="w-3 h-3 bg-chart-3 rounded-full" />
          <span className="text-sm text-muted-foreground">{t("medium_risk")}</span>
        </div>
        <div className="flex items-center space-x-2" data-testid="legend-low">
          <div className="w-3 h-3 bg-chart-2 rounded-full" />
          <span className="text-sm text-muted-foreground">{t("low_risk")}</span>
        </div>
      </div>
    </Card>
  );
}
