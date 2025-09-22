import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.OPENAI_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY or OPENAI_ASSISTANT_ID. Update your environment variables to enable the assistant workflow.",
      },
      { status: 500 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const thread = await client.beta.threads.create();

    return NextResponse.json({ threadId: thread.id });
  } catch (error) {
    console.error("Failed to create OpenAI assistant thread", error);
    return NextResponse.json(
      {
        error: "Unable to create a new assistant thread. Please try again.",
      },
      { status: 500 },
    );
  }
}
