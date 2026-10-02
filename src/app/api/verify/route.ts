import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { verifySchema } from "@/schema/verifySchema";
import { usernameValidation } from "@/schema/signUpSchema";
import { parseJsonObject } from "@/helpers/parseBody";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await parseJsonObject(request);

    if (!body) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid request body. Expected a JSON object with username and code.",
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

    const codeParsed = verifySchema.safeParse({ code: body.code });
    if (!codeParsed.success) {
      const issues = codeParsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const username = usernameParsed.data;
    const code = codeParsed.data.code;

    const user = await UserModel.findOne({ username });

    if (!user) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    if (user.isVerified) {
      return Response.json(
        { success: false, message: "Account already verified. Please sign in." },
        { status: 400 },
      );
    }

    const isCodeValid = user.verifyCode === code;
    const isNotExpired = user.verifyCodeExpiry > new Date();

    if (!isCodeValid || !isNotExpired) {
      return Response.json(
        {
          success: false,
          message: isNotExpired
            ? "Incorrect verification code"
            : "Verification code has expired. Please sign up again.",
        },
        { status: 400 },
      );
    }

    user.isVerified = true;
    await user.save();

    return Response.json(
      { success: true, message: "Account verified successfully. Please sign in." },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error verifying user", error);
    return Response.json(
      { success: false, message: "Error verifying user" },
      { status: 500 },
    );
  }
}