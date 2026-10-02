import dbConnect from "@/lib/dbConnect";
import UserModel, { Message } from "@/model/User";
import { messageSchema } from "@/schema/MessageSchema";
import { usernameValidation } from "@/schema/signUpSchema";
import { parseJsonObject } from "@/helpers/parseBody";
import { checkContent } from "@/lib/moderation";
import { consumeRateLimit, formatRetryAfter } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    await dbConnect();
    // The inbox is intentionally public, but it must not be floodable.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const limit = await consumeRateLimit(`dm:${ip}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) {
      return Response.json(
        {
          success: false,
          message: `Too many messages. Try again in ${formatRetryAfter(limit.retryAfterMs)}.`,
        },
        { status: 429 },
      );
    }

    const body = await parseJsonObject(request);

    if (!body) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid request body. Expected a JSON object with username and content.",
        },
        { status: 400 },
      );
    }

    const usernameParsed = usernameValidation.safeParse(body.username);
    if (!usernameParsed.success) {
      return Response.json(
        { success: false, message: "Invalid username" },
        { status: 400 },
      );
    }

    const contentParsed = messageSchema.safeParse({ content: body.content });
    if (!contentParsed.success) {
      const issues = contentParsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const username = usernameParsed.data;
    const content = contentParsed.data.content;

    const contentCheck = checkContent(content);
    if (!contentCheck.ok) {
      return Response.json(
        { success: false, message: contentCheck.message },
        { status: 400 },
      );
    }

    const user = await UserModel.findOne({ username });

    if (!user) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    if (!user.isAcceptingMessage) {
      return Response.json(
        { success: false, message: "User is currently not accepting messages" },
        { status: 403 },
      );
    }

    user.messages.push({ content, createdAt: new Date() } as Message);
    await user.save();

    return Response.json(
      { success: true, message: "Message sent successfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error sending message", error);
    return Response.json(
      { success: false, message: "Error sending message" },
      { status: 500 },
    );
  }
}