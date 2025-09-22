import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { scenarioResponseSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const scenarioRequestSchema = z.object({
  threadId: z.string(),
  audience: z.string().min(1, "Audience is required"),
  productDetails: z.string().min(1, "Product details are required"),
  productName: z.string().optional(),
  niche: z.string().optional(),
  tone: z.string().optional(),
  visualStyle: z.string().optional(),
  shots: z.number().int().min(1).max(12).default(6),
  focusOnProduct: z.number().int().min(1).max(5).default(3),
  additionalNotes: z.array(z.string()).optional(),
});

function sanitizeResponse(raw: string) {
  return raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.OPENAI_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY or OPENAI_ASSISTANT_ID. Update your environment variables to enable scenario ideation.",
      },
      { status: 500 },
    );
  }

  const json = await req.json();
  const parsed = scenarioRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid scenario request payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    threadId,
    audience,
    productDetails,
    productName,
    niche,
    tone,
    visualStyle,
    shots,
    focusOnProduct,
    additionalNotes,
  } = parsed.data;

  try {
    const client = new OpenAI({ apiKey });

    const contextPrompt = `You are a world-class UGC strategist tasked with planning lifestyle photo shoots for an AI image generator. \n\n` +
      `Product name: ${productName ?? "Unknown"}\n` +
      `Product niche: ${niche ?? "Not provided"}\n` +
      `Audience: ${audience}\n` +
      `Product details: ${productDetails}\n` +
      `Desired vibe or tone: ${tone ?? "Not specified"}\n` +
      `Visual style preference: ${visualStyle ?? "Not specified"}\n` +
      `Shots requested: ${shots}\n` +
      `Focus on product (1-5): ${focusOnProduct}\n` +
      `Extra considerations: ${additionalNotes?.join(", ") ?? "None"}\n\n` +
      `Produce exactly six distinct scenarios for capturing short-form UGC images. Each scenario must reference the product authentically, ` +
      `highlight the audience pain point, and include specific visual cues (camera angle, environment, lighting, props).` +
      `Return the answer as JSON that matches this TypeScript type strictly: {"scenarios": [{"id": string, "title": string, "summary": string, "setting"?: string, "shotList"?: string[], "hook"?: string}]}.
`;

    await client.beta.threads.messages.create(threadId, {
      role: "user",
      content: contextPrompt,
    });

    const run = await client.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: assistantId,
      instructions:
        "Respond only with valid JSON. Do not include markdown code fences. Focus on high-converting, platform-ready UGC concepts.",
    });

    if (run.status !== "completed") {
      throw new Error(`Assistant run finished with status ${run.status}`);
    }

    const messages = await client.beta.threads.messages.list(threadId, {
      order: "desc",
      limit: 10,
    });

    const assistantMessage = messages.data.find((message) => message.role === "assistant");

    const textPart = assistantMessage?.content?.find((part) => part.type === "text");

    if (!textPart || textPart.type !== "text") {
      throw new Error("Assistant response did not contain text content");
    }

    const clean = sanitizeResponse(textPart.text.value ?? "");

    const parsedResponse = scenarioResponseSchema.parse(JSON.parse(clean));

    return NextResponse.json({ threadId, ...parsedResponse });
  } catch (error) {
    console.error("Failed to generate scenarios", error);
    return NextResponse.json(
      {
        error: "Unable to generate scenarios at this time. Please refine your brief and try again.",
      },
      { status: 500 },
    );
  }
}
