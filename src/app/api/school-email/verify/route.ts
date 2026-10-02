import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { verifySchema } from "@/schema/verifySchema";
import { extractEmailDomain } from "@/helpers/emailDomains";
import { consumeRateLimit, formatRetryAfter } from "@/lib/rateLimit";

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000 || code === 11001;
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const verifyLimit = await consumeRateLimit(
      `school-email:verify:${session.user.id}`,
      5,
      10 * 60 * 1000,
    );
    if (!verifyLimit.allowed) {
      return Response.json(
        {
          success: false,
          message: `Too many verification attempts. Try again in ${formatRetryAfter(verifyLimit.retryAfterMs)}.`,
        },
        { status: 429 },
      );
    }

    const body = await parseJsonObject(request);
    const parsed = verifySchema.safeParse({ code: body?.code });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const user = await UserModel.findById(session.user.id);
    if (!user) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    if (!user.pendingSchoolEmail || !user.schoolVerifyCode) {
      return Response.json(
        {
          success: false,
          message: "Request a verification code for your school email first.",
        },
        { status: 400 },
      );
    }

    const isCodeValid = user.schoolVerifyCode === parsed.data.code;
    const isNotExpired =
      user.schoolVerifyCodeExpiry !== undefined &&
      user.schoolVerifyCodeExpiry > new Date();

    if (!isCodeValid || !isNotExpired) {
      return Response.json(
        {
          success: false,
          message: isNotExpired
            ? "Incorrect verification code"
            : "Verification code has expired. Please request a new one.",
        },
        { status: 400 },
      );
    }

    const email = user.pendingSchoolEmail;
    const owner = await UserModel.findOne({
      schoolEmail: email,
      _id: { $ne: user._id },
    });
    if (owner) {
      return Response.json(
        {
          success: false,
          message:
            "This school email is already verified by another account. One account per student email.",
        },
        { status: 400 },
      );
    }

    user.schoolEmail = email;
    user.schoolDomain = extractEmailDomain(email) ?? undefined;
    user.schoolEmailVerifiedAt = new Date();
    user.pendingSchoolEmail = undefined;
    user.schoolVerifyCode = undefined;
    user.schoolVerifyCodeExpiry = undefined;
    try {
      await user.save();
    } catch (error) {
      // Two accounts can hold the same pending email; the unique index only
      // trips at save time. Report it like the friendly pre-check instead of a
      // raw 500.
      if (isDuplicateKeyError(error)) {
        return Response.json(
          {
            success: false,
            message:
              "This school email is already verified by another account. One account per student email.",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    return Response.json(
      {
        success: true,
        message: "School email verified successfully.",
        schoolEmail: user.schoolEmail,
        schoolDomain: user.schoolDomain,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error verifying school email", error);
    return Response.json(
      { success: false, message: "Error verifying school email" },
      { status: 500 },
    );
  }
}
