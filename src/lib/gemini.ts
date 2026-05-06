import { GoogleGenAI } from "@google/genai";
import { Expense, SpendingInsight } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function getSpendingInsights(expenses: Expense[]): Promise<SpendingInsight[]> {
  if (expenses.length === 0) return [];

  const expenseData = expenses.map(e => ({
    category: e.category,
    amount: e.amount,
    date: e.date,
    merchant: e.merchant
  }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze these expenses and provide 2-3 brief insights in JSON format. 
      Expenses: ${JSON.stringify(expenseData)}
      Return an array of objects with keys: title, description, type ('info', 'warning', 'success').
      Keep them professional and concise.`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to fetch insights", error);
    return [
      {
        title: "Real-time Tracking Active",
        description: "Your spending is being monitored. AI insights will appear as you add more transactions.",
        type: "info"
      }
    ];
  }
}
