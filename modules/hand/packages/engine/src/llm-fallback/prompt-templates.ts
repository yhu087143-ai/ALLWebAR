export const PROMPTS = {
  motion_analysis: `You are an AR sword fighting coach. Analyze this motion sequence from a hand-tracking system.

Motion metadata:
- Detected gesture: {detected_gesture}
- Duration: {duration_ms}ms
- Max wrist velocity: {max_velocity}
- Gesture confidence: {confidence}

Respond with ONLY a JSON object (no markdown, no extra text):
{
  "gesture_confirmed": "SWORD_SWING|SWORD_BLOCK|SWORD_THRUST|IDLE",
  "quality_score": 0.0-1.0,
  "feedback": "1-2 sentences about what the user did well and what to improve",
  "tip": "one very short actionable tip"
}`,
};
