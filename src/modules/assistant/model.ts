import { GoogleGenAI } from "@google/genai";

/**
 * A thin seam over Gemini's function calling, so tests can script the model. The shapes
 * match the SDK's `Content` and `Part` for the fields used here.
 */

export interface FunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Part {
  text?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface ModelTurn {
  text: string;
  calls: FunctionCall[];
  /** The model's turn as it should be appended to the history before the tool results. */
  content: Content;
}

export type ChatModel = (req: {
  system: string;
  contents: Content[];
  tools: FunctionDeclaration[];
  signal: AbortSignal;
}) => Promise<ModelTurn>;

export function geminiChatModel(apiKey: string, model: string): ChatModel {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ system, contents, tools, signal }) => {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
        temperature: 0.5,
        abortSignal: signal,
      },
    });
    const calls = (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> }));
    const content = (res.candidates?.[0]?.content as Content | undefined) ?? { role: "model", parts: [] };
    const text = calls.length ? "" : (res.text ?? "");
    return { text, calls, content: { role: "model", parts: content.parts ?? [] } };
  };
}
