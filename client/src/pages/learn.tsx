import { useLanguage } from "@/hooks/use-language";
import MiniGame from "@/components/MiniGame";

export default function Learn() {
  const { t } = useLanguage();

  return (
    <main className="py-16 px-4 bg-muted/30 min-h-screen">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold mb-4">{t("learn_media_literacy")}</h2>
          <p className="text-xl text-muted-foreground">{t("practice_identifying")}</p>
        </div>

        <MiniGame />

        {/* Educational Resources */}
        <section className="mt-16">
          <h3 className="text-2xl font-serif font-bold mb-8 text-center">Educational Resources</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Identifying Fake News",
                description: "Learn the telltale signs of misinformation and how to spot fake news articles.",
                icon: "🔍",
                difficulty: "Beginner"
              },
              {
                title: "Source Verification",
                description: "Master the art of checking sources and verifying information credibility.",
                icon: "🔗",
                difficulty: "Intermediate"
              },
              {
                title: "Deepfake Detection",
                description: "Understand how to identify AI-generated images and videos.",
                icon: "🤖",
                difficulty: "Advanced"
              },
              {
                title: "Social Media Verification",
                description: "Techniques for verifying content from social media platforms.",
                icon: "📱",
                difficulty: "Intermediate"
              },
              {
                title: "Bias Recognition",
                description: "Learn to identify different types of bias in news reporting.",
                icon: "⚖️",
                difficulty: "Intermediate"
              },
              {
                title: "Fact-Checking Tools",
                description: "Discover the best tools and websites for fact-checking claims.",
                icon: "🛠️",
                difficulty: "Beginner"
              }
            ].map((resource, index) => (
              <div key={index} className="bg-card border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-4">{resource.icon}</div>
                <h4 className="text-lg font-semibold mb-2">{resource.title}</h4>
                <p className="text-sm text-muted-foreground mb-4">{resource.description}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    resource.difficulty === "Beginner" ? "bg-chart-2/10 text-chart-2" :
                    resource.difficulty === "Intermediate" ? "bg-chart-3/10 text-chart-3" :
                    "bg-destructive/10 text-destructive"
                  }`}>
                    {resource.difficulty}
                  </span>
                  <button className="text-primary hover:underline text-sm font-medium">
                    Start Learning →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Progress Tracking */}
        <section className="mt-16">
          <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
            <h3 className="text-xl font-semibold mb-6 text-center">Your Learning Progress</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">85</div>
                <div className="text-sm text-muted-foreground">Quizzes Completed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-chart-2 mb-2">92%</div>
                <div className="text-sm text-muted-foreground">Accuracy Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-chart-3 mb-2">2,850</div>
                <div className="text-sm text-muted-foreground">XP Earned</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-muted-foreground">Level 8</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: "68%" }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">680 / 1000 XP to next level</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
