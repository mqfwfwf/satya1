import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import { Trophy, Target, Brain, Search, Image, Gamepad2, Timer, Star } from "lucide-react";

interface MiniGame {
  id: string;
  title: string;
  gameType: string;
  difficulty: string;
  content: any;
  correctAnswer: any;
  explanation: string;
  xpReward: number;
  language: string;
  category: string;
}

interface GameAttemptResult {
  isCorrect: boolean;
  score: number;
  xpEarned: number;
  explanation: string;
  correctAnswer: any;
}

interface UserProgress {
  gameType: string;
  level: number;
  totalXp: number;
  gamesPlayed: number;
  gamesWon: number;
  averageScore: number;
  streak: number;
}

function GameCard({ game, onPlay }: { game: MiniGame; onPlay: (game: MiniGame) => void }) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "hard": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getGameIcon = (gameType: string) => {
    switch (gameType) {
      case "spot-the-fake": return <Target className="w-6 h-6" />;
      case "source-detective": return <Search className="w-6 h-6" />;
      case "image-truth": return <Image className="w-6 h-6" />;
      case "quiz-challenge": return <Brain className="w-6 h-6" />;
      default: return <Gamepad2 className="w-6 h-6" />;
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" data-testid={`game-card-${game.id}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getGameIcon(game.gameType)}
            <CardTitle className="text-lg" data-testid={`game-title-${game.id}`}>{game.title}</CardTitle>
          </div>
          <Badge className={getDifficultyColor(game.difficulty)} data-testid={`game-difficulty-${game.id}`}>
            {game.difficulty}
          </Badge>
        </div>
        <CardDescription data-testid={`game-category-${game.id}`}>
          Category: {game.category} • Reward: {game.xpReward} XP
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={() => onPlay(game)} 
          className="w-full"
          data-testid={`button-play-${game.id}`}
        >
          Play Game
        </Button>
      </CardContent>
    </Card>
  );
}

function SpotTheFakeGame({ game, onSubmit }: { game: MiniGame; onSubmit: (answer: any) => void }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [startTime] = useState(Date.now());

  const handleSubmit = () => {
    if (selectedIndex !== null) {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      onSubmit({ selectedIndex, timeSpent });
    }
  };

  return (
    <div className="space-y-4" data-testid="spot-the-fake-game">
      <h3 className="text-xl font-semibold">Which article is fake news?</h3>
      <p className="text-sm text-muted-foreground">
        Carefully examine both articles and identify which one contains misinformation.
      </p>
      
      <div className="grid gap-4 md:grid-cols-2">
        {game.content.articles.map((article: any, index: number) => (
          <Card 
            key={index}
            className={`cursor-pointer border-2 transition-colors ${
              selectedIndex === index 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedIndex(index)}
            data-testid={`article-option-${index}`}
          >
            <CardHeader>
              <CardTitle className="text-base">{article.headline}</CardTitle>
              <CardDescription>
                Source: {article.source} • {article.publishedDate}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={selectedIndex === null}
        className="w-full"
        data-testid="button-submit-answer"
      >
        Submit Answer
      </Button>
    </div>
  );
}

function SourceDetectiveGame({ game, onSubmit }: { game: MiniGame; onSubmit: (answer: any) => void }) {
  const [credibilityScore, setCredibilityScore] = useState<string>("");
  const [startTime] = useState(Date.now());

  const handleSubmit = () => {
    if (credibilityScore) {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      onSubmit({ credibilityScore, timeSpent });
    }
  };

  return (
    <div className="space-y-4" data-testid="source-detective-game">
      <h3 className="text-xl font-semibold">Evaluate Source Credibility</h3>
      <p className="text-sm text-muted-foreground">
        Analyze the following clues about a news source and rate its credibility.
      </p>
      
      <Card>
        <CardHeader>
          <CardTitle>Source: {game.content.url}</CardTitle>
        </CardHeader>
        <CardContent>
          <h4 className="font-medium mb-2">Clues found:</h4>
          <ul className="space-y-1">
            {game.content.clues.map((clue: string, index: number) => (
              <li key={index} className="text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full"></span>
                {clue}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <label className="text-sm font-medium">Credibility Rating:</label>
        <div className="grid grid-cols-3 gap-2">
          {["high", "medium", "low"].map((rating) => (
            <Button
              key={rating}
              variant={credibilityScore === rating ? "default" : "outline"}
              onClick={() => setCredibilityScore(rating)}
              className="capitalize"
              data-testid={`credibility-${rating}`}
            >
              {rating}
            </Button>
          ))}
        </div>
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={!credibilityScore}
        className="w-full"
        data-testid="button-submit-answer"
      >
        Submit Rating
      </Button>
    </div>
  );
}

function GameResults({ result, onPlayAgain }: { result: GameAttemptResult; onPlayAgain: () => void }) {
  return (
    <div className="space-y-4 text-center" data-testid="game-results">
      <div className={`text-6xl mb-4 ${result.isCorrect ? "text-green-500" : "text-red-500"}`}>
        {result.isCorrect ? "🎉" : "😔"}
      </div>
      
      <h3 className="text-2xl font-bold" data-testid="result-status">
        {result.isCorrect ? "Correct!" : "Incorrect"}
      </h3>
      
      <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary" data-testid="score-earned">{result.score}</div>
            <div className="text-sm text-muted-foreground">Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-500" data-testid="xp-earned">{result.xpEarned} XP</div>
            <div className="text-sm text-muted-foreground">Experience</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Explanation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" data-testid="game-explanation">{result.explanation}</p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onPlayAgain} className="flex-1" data-testid="button-play-again">
          Play Another Game
        </Button>
      </div>
    </div>
  );
}

function ProgressTab() {
  const { data: progress } = useQuery({
    queryKey: ["/api/mini-games/progress/demo-user"],
  });

  const { data: leaderboard } = useQuery({
    queryKey: ["/api/mini-games/leaderboard"],
  });

  const progressArray = Array.isArray(progress) ? progress : [];
  const leaderboardArray = Array.isArray(leaderboard) ? leaderboard : [];

  if (progressArray.length === 0) {
    return (
      <div className="text-center py-8" data-testid="no-progress">
        <p className="text-muted-foreground">Start playing games to track your progress!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {progressArray.map((prog: UserProgress) => (
          <Card key={prog.gameType} data-testid={`progress-${prog.gameType}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">{prog.gameType.replace('-', ' ')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Level {prog.level}</span>
                <span>{prog.totalXp} XP</span>
              </div>
              <Progress value={(prog.totalXp % 100)} className="h-2" />
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>Games: {prog.gamesPlayed}</div>
                <div>Won: {prog.gamesWon}</div>
                <div>Avg: {prog.averageScore}</div>
                <div>Streak: {prog.streak}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {leaderboardArray.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboardArray.slice(0, 5).map((user: any, index: number) => (
                <div key={user.userId} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? "bg-yellow-500 text-white" :
                      index === 1 ? "bg-gray-400 text-white" :
                      index === 2 ? "bg-amber-600 text-white" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}
                    </div>
                    <span className="font-medium">{user.username}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{user.totalXp} XP</div>
                    <div className="text-xs text-muted-foreground">Level {user.level}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Games() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedGame, setSelectedGame] = useState<MiniGame | null>(null);
  const [gameResult, setGameResult] = useState<GameAttemptResult | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const { data: miniGames, isLoading } = useQuery({
    queryKey: ["/api/mini-games", { lang: language }],
  });

  const miniGamesArray = Array.isArray(miniGames) ? miniGames : [];

  const submitGameMutation = useMutation({
    mutationFn: async ({ gameId, answer }: { gameId: string; answer: any }): Promise<GameAttemptResult> => {
      const response = await apiRequest("POST", `/api/mini-games/${gameId}/submit`, answer);
      return response.json();
    },
    onSuccess: (result) => {
      setGameResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/mini-games/progress/demo-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mini-games/leaderboard"] });
      
      toast({
        title: result.isCorrect ? "Correct!" : "Incorrect",
        description: `You earned ${result.xpEarned} XP`,
        variant: result.isCorrect ? "default" : "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit answer",
        variant: "destructive",
      });
    },
  });

  const handlePlayGame = (game: MiniGame) => {
    setSelectedGame(game);
    setGameResult(null);
  };

  const handleSubmitAnswer = (answer: any) => {
    if (selectedGame) {
      submitGameMutation.mutate({
        gameId: selectedGame.id,
        answer,
      });
    }
  };

  const handlePlayAgain = () => {
    setSelectedGame(null);
    setGameResult(null);
  };

  const filteredGames = miniGamesArray.filter((game: MiniGame) => 
    activeTab === "all" || game.gameType === activeTab
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading mini-games...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" data-testid="games-page">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Media Literacy Games</h1>
        <p className="text-muted-foreground">
          Sharpen your fact-checking skills through interactive mini-games
        </p>
      </div>

      {selectedGame && !gameResult && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="w-5 h-5" />
              {selectedGame.title}
            </CardTitle>
            <CardDescription>
              Difficulty: {selectedGame.difficulty} • Reward: {selectedGame.xpReward} XP
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedGame.gameType === "spot-the-fake" && (
              <SpotTheFakeGame game={selectedGame} onSubmit={handleSubmitAnswer} />
            )}
            {selectedGame.gameType === "source-detective" && (
              <SourceDetectiveGame game={selectedGame} onSubmit={handleSubmitAnswer} />
            )}
          </CardContent>
        </Card>
      )}

      {gameResult && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <GameResults result={gameResult} onPlayAgain={handlePlayAgain} />
          </CardContent>
        </Card>
      )}

      {!selectedGame && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all" data-testid="tab-all">All Games</TabsTrigger>
            <TabsTrigger value="spot-the-fake" data-testid="tab-spot-fake">Spot Fake</TabsTrigger>
            <TabsTrigger value="source-detective" data-testid="tab-source-detective">Source Detective</TabsTrigger>
            <TabsTrigger value="image-truth" data-testid="tab-image-truth">Image Truth</TabsTrigger>
            <TabsTrigger value="progress" data-testid="tab-progress">Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredGames.map((game: MiniGame) => (
                <GameCard key={game.id} game={game} onPlay={handlePlayGame} />
              ))}
            </div>
            {filteredGames.length === 0 && (
              <div className="text-center py-8" data-testid="no-games">
                <p className="text-muted-foreground">No games available yet.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="spot-the-fake" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredGames.map((game: MiniGame) => (
                <GameCard key={game.id} game={game} onPlay={handlePlayGame} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="source-detective" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredGames.map((game: MiniGame) => (
                <GameCard key={game.id} game={game} onPlay={handlePlayGame} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="image-truth" className="mt-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">Image Truth games coming soon!</p>
            </div>
          </TabsContent>

          <TabsContent value="progress" className="mt-6">
            <ProgressTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}