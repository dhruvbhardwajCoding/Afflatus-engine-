import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function list() {
  const models = await ai.models.list();
  for (const m of models) {
    if (m.name.includes("flash") || m.name.includes("lite") || m.name.includes("8b")) {
      console.log(m.name);
    }
  }
}
list().catch(console.error);
