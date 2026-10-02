import { auth } from "@/lib/auth";
import { suggestText, aiConfigured } from "@/lib/ai";
import { parseJsonObject } from "@/helpers/parseBody";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    if (!aiConfigured()) {
      return Response.json(
        {
          success: false,
          message: "AI is not configured. Ask the developer to set GEMINI_API_KEY.",
        },
        { status: 501 },
      );
    }

    const body = await parseJsonObject(request);
    const text = typeof body?.text === "string" ? body.text : "";
    const action = body?.action === "translate" ? "translate" : "correct";
    if (!text.trim()) {
      return Response.json(
        { success: false, message: "Write something first." },
        { status: 400 },
      );
    }

    const result = await suggestText(text, action);
    if (!result.ok) {
      return Response.json(
        { success: false, message: result.message ?? "AI request failed" },
        { status: 502 },
      );
    }

    return Response.json(
      { success: true, suggested: result.text, action },
      { status: 200 },
    );
  } catch (error) {
    console.error("AI suggest error", error);
    return Response.json(
      { success: false, message: "AI request failed" },
      { status: 500 },
    );
  }
}