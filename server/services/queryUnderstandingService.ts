import { GoogleGenAI, Type } from '@google/genai';

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'afflatus-engine-v1' } },
      });
    } catch (err) {
      console.warn('[QueryUnderstanding] Failed to init Gemini:', err);
    }
  }
  return aiClient;
}

export class QueryUnderstandingService {
  static async understandChat(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<{ success: boolean; data?: any; error?: string }> {
    const ai = getGeminiClient();
    if (!ai) {
      return { success: false, error: 'GEMINI_API_KEY not configured' };
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        location: {
          type: Type.OBJECT,
          properties: {
            city: { type: Type.STRING },
          },
          nullable: true,
        },
        project_type: { type: Type.STRING },
        role: { type: Type.STRING },
        minExperienceYears: { type: Type.NUMBER, nullable: true },
        preferences: {
          type: Type.OBJECT,
          properties: {
            creativity: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            communication: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            reliability: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            flexibility: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            teamwork: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            feedback_openness: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            leadership: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
            technical_proficiency: {
              type: Type.OBJECT,
              properties: { level: { type: Type.STRING }, importance: { type: Type.STRING } },
            },
          },
        },
      },
    };

    const systemInstruction = `You are a query extractor for a film/media collaboration platform.
Extract the CURRENT, COMBINED requirements from the user's chat history.
- The history may contain previous requirements and recent refinements (e.g., "only show people in Goa").
- Combine all active constraints into the final output.
- For preferences (creativity, communication, reliability, flexibility, teamwork, feedback_openness, leadership, technical_proficiency), determine the 'level' (high, mid, low, not_specified) and 'importance' (required, preferred, optional).
- IMPORTANT: If a user does NOT mention a specific preference or trait, you MUST output "not_specified" for its level and "optional" for its importance. Do NOT assume "mid" or any other value.
- Map natural language intelligently (e.g. "technically excellent" -> technical_proficiency: high, "very reliable" -> reliability: high).
- If role, location, or project_type are not mentioned at all in the history, output "not_specified".

CRITICAL - ROLE MAPPING: The platform uses these EXACT role names. You MUST map the user's natural language to ONE of these exact strings for the "role" field:
Cinematography & Camera: "Director of Photography (DP)", "Cinematographer", "Camera Operator (A-Cam / B-Cam)", "1st Assistant Camera (1st AC / Focus Puller)", "2nd Assistant Camera (2nd AC / Clapper Loader)", "Steadicam / Gimbal Specialist", "Drone Pilot / Aerial Cinematographer", "DIT (Digital Imaging Technician)"
Writing, Directing & Producing: "Director", "Screenwriter / Scriptwriter", "Creative Producer", "Executive Producer", "Line Producer", "1st Assistant Director (1st AD)", "2nd Assistant Director (2nd AD)", "Script Supervisor / Continuity", "Story / Narrative Consultant"
Lighting & Grip: "Gaffer / Chief Lighting Technician", "Best Boy Electric", "Key Grip", "Best Boy Grip", "Dolly Grip", "Rigging Gaffer"
Sound & Audio: "Location Sound Recordist", "Boom Operator", "Sound Designer / Audio Recordist", "Re-recording Mixer / Audio Post Engineer", "Foley Artist", "Dialogue Editor", "Music Composer / Score Producer"
Post-Production: "Lead Video Editor", "Assistant Editor", "Colorist (DaVinci Resolve / Baselight)", "VFX Artist / Compositor", "Motion Graphics / 3D Artist", "CGI / Unreal Engine Virtual Production Artist"
Art & Design: "Production Designer", "Art Director", "Set Decorator / Prop Master", "Costume Designer / Stylist", "Key Makeup & Hair Artist (HMUA)", "SFX Makeup Artist", "UI/UX Designer", "Photographer / BTS Stills Photographer"

Examples:
- "screen writer" or "script writer" or "screenwriter" -> "Screenwriter / Scriptwriter"
- "DP" or "director of photography" -> "Director of Photography (DP)"
- "director" (when meaning film director) -> "Director"
- "editor" or "video editor" -> "Lead Video Editor"
- "sound guy" or "sound person" -> "Sound Designer / Audio Recordist"
If the user mentions multiple roles, pick the PRIMARY one they are looking for.`;

    const formattedHistory = messages.map(m => `${m.role === 'user' ? 'User' : 'System'}: "${m.content}"`).join('\n');
    const prompt = `Chat History:\n${formattedHistory}\n\nBased on the ENTIRE conversation history above, extract the FINAL combined structured requirements that reflect the user's current intent.`;

    try {
      // Try multiple models in order — fallback if one is overloaded (503)
      const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'];
      let lastError: any = null;

      for (const model of models) {
        try {
          console.log(`[QueryUnderstanding] Trying model: ${model}`);
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0.3,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });

          const text = response?.text || (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text || null;
          if (text) {
            console.log(`[QueryUnderstanding] Success with model: ${model}`);
            return { success: true, data: JSON.parse(text) };
          }
        } catch (modelErr: any) {
          console.warn(`[QueryUnderstanding] ${model} failed:`, modelErr?.status || modelErr?.message);
          lastError = modelErr;
          // If it's a 503 (overloaded) or 429 (rate limit), try the next model
          if (modelErr?.status === 503 || modelErr?.status === 429) continue;
          // For other errors (400, 404), also try next model
          continue;
        }
      }

      return { success: false, error: lastError?.message || 'All models failed' };
    } catch (err: any) {
      console.error('[QueryUnderstanding] Error:', err);
      return { success: false, error: err.message || 'Failed to understand query' };
    }
  }
}
