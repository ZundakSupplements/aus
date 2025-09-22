import { NextResponse } from "next/server";
import { z } from "zod";

import {
  generationSettingsSchema,
  scenarioSchema,
  type Scenario,
} from "@/lib/schemas";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const requestSchema = z.object({
  threadId: z.string().optional(),
  productName: z.string().optional(),
  productImage: z.object({
    data: z.string().min(10, "Image data is required"),
    mimeType: z.string().default("image/png"),
  }),
  scenarios: z.array(scenarioSchema).min(1),
  settings: generationSettingsSchema,
});

type GeminiImagePart = {
  mimeType: string;
  data: string;
  scenario: Scenario;
};

type GeminiInlinePart = {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiInlinePart[];
  };
};

const DEFAULT_MODEL = "gemini-2.5-flash-nano-banana";

function buildPrompt(
  scenario: Scenario,
  productName: string | undefined,
  settings: z.infer<typeof generationSettingsSchema>,
) {
  const shotList = scenario.shotList?.length
    ? `Key shots: ${scenario.shotList.join(", ")}.`
    : "";

  const notes: string[] = [];
  notes.push(`Tone: ${settings.tone}`);
  notes.push(`Visual style: ${settings.visualStyle}`);
  notes.push(`Orientation: ${settings.orientation}`);
  notes.push(`Quality: ${settings.quality}`);
  notes.push(`Focus level (1-5): ${settings.focusOnProduct}`);
  if (settings.addMotion) notes.push("Add subtle motion-friendly composition cues");
  if (settings.retouchProduct) notes.push("Ensure the product looks polished and retouched");
  if (settings.includeCaptions) notes.push("Include natural caption overlay space in the composition");

  return (
    `Create a photorealistic UGC marketing photo for ${productName ?? "the featured product"}. ` +
    `Scenario title: ${scenario.title}. ${scenario.summary}. ${scenario.setting ?? ""}. ${shotList} ` +
    `The audience should immediately understand how it solves their need. ` +
    `Keep the composition authentic, candid, and ready for social media. ` +
    `${notes.join(" | ")}`
  );
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const model = process.env.GOOGLE_GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing GOOGLE_GEMINI_API_KEY environment variable.",
      },
      { status: 500 },
    );
  }

  const payload = requestSchema.safeParse(await req.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid generate payload", details: payload.error.flatten() },
      { status: 400 },
    );
  }

  const { scenarios, productImage, settings, productName, threadId } = payload.data;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const results: GeminiImagePart[] = [];

    for (const scenario of scenarios) {
      const prompt = buildPrompt(scenario, productName, settings);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: productImage.mimeType,
                    data: productImage.data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            topK: 32,
            responseMimeType: "image/png",
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini image generation failed: ${response.status} ${errorBody}`);
      }

      const json = await response.json();
      const candidate = (json.candidates?.[0] ?? null) as GeminiCandidate | null;
      const part = candidate?.content?.parts?.find((item) => item.inlineData);

      if (!part?.inlineData?.data || !part?.inlineData?.mimeType) {
        throw new Error("Gemini response did not include image data");
      }

      results.push({
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
        scenario,
      });
    }

    const supabase = getSupabaseServerClient();

    if (supabase) {
      const inserts = results.map((result) => ({
        thread_id: threadId ?? null,
        scenario_id: result.scenario.id,
        scenario_title: result.scenario.title,
        scenario_summary: result.scenario.summary,
        settings,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("ugc_generations").insert(inserts);

      if (error) {
        console.warn("Failed to persist generation metadata in Supabase", error);
      }
    }

    return NextResponse.json({
      images: results.map((result) => ({
        mimeType: result.mimeType,
        data: result.data,
        scenario: result.scenario,
      })),
    });
  } catch (error) {
    console.error("Gemini generation failed", error);
    return NextResponse.json(
      {
        error: "Image generation failed. Please try again with a different concept.",
      },
      { status: 500 },
    );
  }
}
