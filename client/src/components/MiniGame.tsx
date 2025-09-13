import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, CheckCircle, XCircle } from "lucide-react";
import { apiClient } from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

export default function MiniGame() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ["quizzes", language],
    queryFn: () => apiClient.getQuizzes(language),
  });

  const submitAnswerMutation = useMutation({
    mutationFn: ({ quizId, answer }: { quizId: string; answer: number }) =>
      apiClient.submitQuizAnswer(quizId, answer),
    onSuccess: (result) => {
      setShowResult(true);
      if (result.isCorrect) {
        // Show confetti effect
        createConfetti();
        toast({
          title: t("correct_answer"),
          description: `+${result.xpEarned} XP earned!`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit answer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const currentQuiz = quizzes?.[currentQuizIndex];

  const handleSubmit = () => {
    if (selectedAnswer === null || !currentQuiz) {
      toast({
        title: "No answer selected",
        description: "Please select an answer before submitting.",
        variant: "destructive",
      });
      return;
    }

    submitAnswerMutation.mutate({
      quizId: currentQuiz.id,
      answer: selectedAnswer,
    });
  };

  const nextQuiz = () => {
    setSelectedAnswer(null);
    setShowResult(false);
    setCurrentQuizIndex((prev) => (prev + 1) % (quizzes?.length || 1));
  };

  const createConfetti = () => {
    const colors = ["#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];
    const confettiContainer = document.createElement("div");
    confettiContainer.style.position = "fixed";
    confettiContainer.style.top = "0";
    confettiContainer.style.left = "0";
    confettiContainer.style.width = "100%";
    confettiContainer.style.height = "100%";
    confettiContainer.style.pointerEvents = "none";
    confettiContainer.style.zIndex = "9999";
    
    document.body.appendChild(confettiContainer);

    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = Math.random() * 100 + "%";
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = Math.random() * 3 + "s";
      confetti.style.animationDuration = (Math.random() * 3 + 2) + "s";
      confettiContainer.appendChild(confetti);
    }

    setTimeout(() => {
      document.body.removeChild(confettiContainer);
    }, 5000);
  };

  if (isLoading || !currentQuiz) {
    return (
      <Card className="p-8 text-center" data-testid="mini-game-loading">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading quiz...</p>
      </Card>
    );
  }

  return (
    <Card className="p-8 shadow-lg" data-testid="mini-game">
      <div className="text-center mb-8">
        <Badge className="inline-flex items-center space-x-2 px-4 py-2 bg-primary/10 text-primary mb-4">
          <Lightbulb className="w-5 h-5" />
          <span className="font-medium">{t("daily_challenge")}</span>
        </Badge>
        <h3 className="text-xl font-semibold mb-4">{t("spot_fake_headline")}</h3>
      </div>

      <div className="space-y-4 mb-8">
        <h4 className="text-lg font-medium text-center mb-6">{currentQuiz.question}</h4>
        
        {currentQuiz.options.map((option, index) => (
          <button
            key={index}
            onClick={() => setSelectedAnswer(index)}
            disabled={showResult}
            className={`w-full p-4 text-left border rounded-lg transition group ${
              selectedAnswer === index
                ? "border-primary bg-accent/50"
                : "border-border hover:border-primary hover:bg-accent/50"
            } ${showResult ? "cursor-default" : "cursor-pointer"}`}
            data-testid={`button-option-${index}`}
          >
            <div className="flex items-center justify-between">
              <span className={`font-medium ${
                selectedAnswer === index ? "text-primary" : "group-hover:text-primary"
              } transition`}>
                {option}
              </span>
              <div className={`w-6 h-6 border-2 rounded-full transition ${
                selectedAnswer === index
                  ? "border-primary bg-primary"
                  : "border-muted-foreground group-hover:border-primary"
              }`}>
                {selectedAnswer === index && (
                  <div className="w-2 h-2 bg-primary-foreground rounded-full m-auto mt-1" />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {!showResult ? (
        <div className="text-center">
          <Button
            onClick={handleSubmit}
            disabled={selectedAnswer === null || submitAnswerMutation.isPending}
            className="px-8 py-3"
            data-testid="button-submit-quiz"
          >
            {submitAnswerMutation.isPending ? "Submitting..." : t("submit_answer")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quiz Result */}
          <div className={`p-6 rounded-lg border ${
            selectedAnswer === currentQuiz.correctAnswer
              ? "bg-chart-2/10 border-chart-2/20"
              : "bg-destructive/10 border-destructive/20"
          }`} data-testid="quiz-result">
            <div className="flex items-center space-x-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedAnswer === currentQuiz.correctAnswer
                  ? "bg-chart-2"
                  : "bg-destructive"
              }`}>
                {selectedAnswer === currentQuiz.correctAnswer ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <XCircle className="w-5 h-5 text-white" />
                )}
              </div>
              <h4 className={`text-lg font-semibold ${
                selectedAnswer === currentQuiz.correctAnswer
                  ? "text-chart-2"
                  : "text-destructive"
              }`}>
                {selectedAnswer === currentQuiz.correctAnswer 
                  ? t("correct_answer")
                  : "Incorrect Answer"
                }
              </h4>
            </div>
            <p className="text-muted-foreground mb-4">{currentQuiz.explanation}</p>
            <div className="text-center">
              <Button onClick={nextQuiz} data-testid="button-next-quiz">
                Next Challenge
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Progress */}
      <div className="mt-6 text-center text-sm text-muted-foreground">
        Quiz {currentQuizIndex + 1} of {quizzes?.length || 1}
      </div>
    </Card>
  );
}
