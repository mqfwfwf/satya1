import { useState, useRef } from "react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Search, Mic, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InputFormProps {
  onAnalyze: (data: { content?: string; url?: string; fileData?: string; fileType?: string }) => void;
  isLoading: boolean;
}

export default function InputForm({ onAnalyze, isLoading }: InputFormProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!content.trim() && files.length === 0) {
      toast({
        title: "No content provided",
        description: "Please enter text, URL, or upload a file to analyze.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (files.length > 0) {
        const file = files[0];
        const fileData = await fileToBase64(file);
        onAnalyze({
          fileData,
          fileType: file.type,
        });
      } else {
        const isUrl = isValidUrl(content);
        onAnalyze({
          [isUrl ? "url" : "content"]: content,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process the input. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleVoiceInput = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast({
        title: "Speech recognition not supported",
        description: "Your browser doesn't support voice input.",
        variant: "destructive",
      });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setContent(prev => prev + " " + transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: "Voice input failed",
        description: "Could not capture voice input. Please try again.",
        variant: "destructive",
      });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    handleFiles(selectedFiles);
  };

  const handleFiles = (selectedFiles: File[]) => {
    const validFiles = selectedFiles.filter(file => {
      const isValid = file.size <= 50 * 1024 * 1024 && // 50MB limit
        (file.type.startsWith("image/") || file.type.startsWith("video/"));
      
      if (!isValid) {
        toast({
          title: "Invalid file",
          description: `${file.name} is too large or not a supported format.`,
          variant: "destructive",
        });
      }
      
      return isValid;
    });

    setFiles(validFiles.slice(0, 1)); // Only allow one file
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(event.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="p-6 shadow-lg" data-testid="input-form">
      <div className="space-y-6">
        {/* Text/URL Input */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {t("paste_url_label")}
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("paste_url_placeholder")}
            className="w-full h-32 resize-none"
            data-testid="input-content"
          />
        </div>

        <div className="text-center text-muted-foreground">
          <span className="text-sm font-medium">OR</span>
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 transition cursor-pointer ${
            isDragOver
              ? "border-primary bg-accent/50"
              : "border-border hover:border-primary hover:bg-accent/50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          data-testid="upload-area"
        >
          <div className="text-center">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">
              {t("upload_label")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("upload_description")}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t("upload_formats")}
            </p>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            data-testid="input-file"
          />
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                    <Upload className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={handleSubmit}
            disabled={isLoading || (!content.trim() && files.length === 0)}
            className="px-8 py-3 flex items-center justify-center space-x-2"
            data-testid="button-verify"
          >
            <Search className="w-5 h-5" />
            <span>{t("verify_content")}</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleVoiceInput}
            disabled={isLoading || isListening}
            className="px-6 py-3 flex items-center justify-center space-x-2"
            data-testid="button-voice"
          >
            <Mic className={`w-5 h-5 ${isListening ? "text-destructive animate-pulse" : ""}`} />
            <span>{isListening ? "Listening..." : t("voice_input")}</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // Remove data:image/jpeg;base64, prefix
    };
    reader.onerror = reject;
  });
}
