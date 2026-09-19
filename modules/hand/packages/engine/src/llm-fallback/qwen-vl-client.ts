import { PROMPTS } from './prompt-templates';

export interface MotionAnalysisResult {
  gestureConfirmed: string;
  qualityScore: number;
  feedback: string;
  tip: string;
}

export interface MotionSequenceData {
  frames: number[][];
  velocities: number[];
  gestureSequence: string[];
  durationMs: number;
  detectedGesture: string;
  maxVelocity: number;
  confidence: number;
}

interface QwenVLResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export class QwenVLFallback {
  private apiKey: string;
  private apiBase: string;
  private modelName: string;

  constructor(config: {
    apiKey: string;
    apiBase?: string;
    modelName?: string;
  }) {
    this.apiKey = config.apiKey;
    this.apiBase = config.apiBase || 'https://dashscope.aliyuncs.com/api/v1';
    this.modelName = config.modelName || 'qwen-vl-max';
  }

  async analyzeMotion(sequence: MotionSequenceData): Promise<MotionAnalysisResult | null> {
    const prompt = PROMPTS.motion_analysis
      .replace('{detected_gesture}', sequence.detectedGesture)
      .replace('{duration_ms}', sequence.durationMs.toString())
      .replace('{max_velocity}', sequence.maxVelocity.toFixed(3))
      .replace('{confidence}', sequence.confidence.toFixed(2));

    try {
      const response = await fetch(`${this.apiBase}/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          input: { messages: [{ role: 'user', content: prompt }] },
          parameters: {
            temperature: 0.1,
            max_tokens: 300,
            result_format: 'message',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Qwen-VL API error: ${response.status}`);
      }

      const data: QwenVLResponse = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response');

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      const parsed = JSON.parse(jsonStr);

      return {
        gestureConfirmed: parsed.gesture_confirmed || 'IDLE',
        qualityScore: parsed.quality_score || 0,
        feedback: parsed.feedback || '',
        tip: parsed.tip || '',
      };
    } catch (error) {
      console.error('[QwenVLFallback] analyzeMotion error:', error);
      return null;
    }
  }
}
