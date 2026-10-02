import { auth } from "@/lib/auth";
import { summarizeNotes, aiConfigured } from "@/lib/ai";
import { parseMultipartForm, PDF_MIME, PDF_MAX_BYTES, fileToAttachment } from "@/helpers/uploads";

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

    const { files } = await parseMultipartForm(request);
    const file = files.attachment ?? files.pdf ?? files.file;
    if (!file) {
      return Response.json(
        { success: false, message: "No PDF uploaded" },
        { status: 400 },
      );
    }

    const result = await fileToAttachment(file, PDF_MAX_BYTES, [PDF_MIME]);
    if ("error" in result) {
      return Response.json(
        { success: false, message: result.error },
        { status: 400 },
      );
    }

    const summary = await summarizeNotes(result);
    if (!summary.ok) {
      return Response.json(
        { success: false, message: summary.message ?? "AI request failed" },
        { status: 502 },
      );
    }

    return Response.json(
      { success: true, suggested: summary.text },
      { status: 200 },
    );
  } catch (error) {
    console.error("AI notes summary error", error);
    return Response.json(
      { success: false, message: "AI request failed" },
      { status: 500 },
    );
  }
}