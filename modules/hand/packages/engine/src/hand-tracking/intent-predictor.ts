import { GestureEngine } from './gesture-engine';
import type { GestureResult, GestureType } from './types';

/**
 * Predicts user intent from short gesture history.
 * Uses the dynamic gesture model on the recent frame buffer.
 */
export class IntentPredictor {
  private lastResults: GestureResult[] = [];
  private predicting = false;

  constructor(
    private engine: GestureEngine,
    private historySize: number = 15,
  ) {}

  push(result: GestureResult): void {
    this.lastResults.push(result);
    if (this.lastResults.length > this.historySize) {
      this.lastResults.shift();
    }
  }

  async predict(): Promise<GestureResult | null> {
    if (this.predicting) return null; // drop frame if busy
    if (this.engine.getFrameHistory().length < 5) return null;

    this.predicting = true;
    try {
      const dynamicResult = await this.engine.classifySequence(this.engine.getFrameHistory());

      // Only return dynamic result if confident enough & the class is a dynamic gesture
      if (dynamicResult.confidence > 0.5 && this.isDynamic(dynamicResult.gesture)) {
        return dynamicResult;
      }

      return null;
    } catch (err) {
      console.warn('[IntentPredictor] classifySequence failed:', err);
      return null;
    } finally {
      this.predicting = false;
    }
  }

  getRecentHistory(): GestureResult[] {
    return [...this.lastResults];
  }

  clear(): void {
    this.lastResults = [];
  }

  private isDynamic(g: GestureType): boolean {
    // Dynamic model outputs ['IDLE', 'SWORD_BLOCK', 'SWORD_SWING', 'SWORD_THRUST']
    return g === 'SWORD_BLOCK' || g === 'SWORD_SWING' || g === 'SWORD_THRUST';
  }
}
