import { get, set, keys } from "idb-keyval";

interface OfflineQueueItem {
  id: string;
  type: "analysis" | "quiz" | "report";
  data: any;
  timestamp: number;
}

class OfflineManager {
  private readonly QUEUE_KEY = "satya-offline-queue";

  async addToQueue(type: OfflineQueueItem["type"], data: any): Promise<void> {
    try {
      const queue = await this.getQueue();
      const item: OfflineQueueItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        data,
        timestamp: Date.now(),
      };

      queue.push(item);
      await set(this.QUEUE_KEY, queue);
    } catch (error) {
      console.error("Failed to add item to offline queue:", error);
    }
  }

  async getQueue(): Promise<OfflineQueueItem[]> {
    try {
      return (await get(this.QUEUE_KEY)) || [];
    } catch (error) {
      console.error("Failed to get offline queue:", error);
      return [];
    }
  }

  async processQueue(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      const queue = await this.getQueue();
      const processed: string[] = [];

      for (const item of queue) {
        try {
          await this.processItem(item);
          processed.push(item.id);
        } catch (error) {
          console.error(`Failed to process queue item ${item.id}:`, error);
        }
      }

      // Remove processed items
      const remaining = queue.filter(item => !processed.includes(item.id));
      await set(this.QUEUE_KEY, remaining);

      if (processed.length > 0) {
        console.log(`Processed ${processed.length} offline items`);
      }
    } catch (error) {
      console.error("Failed to process offline queue:", error);
    }
  }

  private async processItem(item: OfflineQueueItem): Promise<void> {
    switch (item.type) {
      case "analysis":
        await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data),
        });
        break;

      case "quiz":
        await fetch(`/api/quizzes/${item.data.quizId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedAnswer: item.data.selectedAnswer }),
        });
        break;

      case "report":
        await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data),
        });
        break;

      default:
        throw new Error(`Unknown queue item type: ${item.type}`);
    }
  }

  async clearQueue(): Promise<void> {
    await set(this.QUEUE_KEY, []);
  }
}

export const offlineManager = new OfflineManager();

// Process queue when coming back online
window.addEventListener("online", () => {
  offlineManager.processQueue();
});
