import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { sendVerificationEmail } from "@/helpers/sendVerificationEmail";
import { consumeRateLimit, formatRetryAfter } from "@/lib/rateLimit";
import {
  extractEmailDomain,
  isAllowedSchoolEmail,
  normalizeEmail,
} from "@/helpers/emailDomains";

const EMAIL_RE = /^[\w.-]+@([\w-]+\.)+[\w-]{2,}$/;

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

    const sendLimit = await consumeRateLimit(
      `school-email:send:${session.user.id}`,
      3,
      10 * 60 * 1000,
    );
    if (!sendLimit.allowed) {
      return Response.json(
        {
          success: false,
          message: `Too many verification emails requested. Try again in ${formatRetryAfter(sendLimit.retryAfterMs)}.`,
        },
        { status: 429 },
      );
    }

    const body = await parseJsonObject(request);
    const email =
      typeof body?.email === "string" ? normalizeEmail(body.email) : "";

    if (!email || !EMAIL_RE.test(email)) {
      return Response.json(
        { success: false, message: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (!isAllowedSchoolEmail(email)) {
      return Response.json(
        {
          success: false,
          message:
            "Only educational email addresses can be verified (for example @nitk.edu.in or @college.ac.in).",
        },
        { status: 400 },
      );
    }

    const owner = await UserModel.findOne({
      schoolEmail: email,
      _id: { $ne: session.user.id },
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

    const user = await UserModel.findById(session.user.id);
    if (!user) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    const verifyCode = Math.floor(10000 + Math.random() * 90000).toString();
    user.pendingSchoolEmail = email;
    user.schoolVerifyCode = verifyCode;
    user.schoolVerifyCodeExpiry = new Date(Date.now() + 3600000);
    await user.save();

    const emailResponse = await sendVerificationEmail(
      email,
      user.username,
      verifyCode,
    );

    if (!emailResponse.success) {
      return Response.json(
        { success: false, message: emailResponse.message },
        { status: 500 },
      );
    }

    const domain = extractEmailDomain(email);

    return Response.json(
      {
        success: true,
        message: `Verification code sent to ${email}.`,
        pendingEmail: email,
        domain,
        demoCode:
          process.env.DEMO_OTP_MODE === "true" ? verifyCode : undefined,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error sending school email verification", error);
    return Response.json(
      { success: false, message: "Error sending verification code" },
      { status: 500 },
    );
  }
}
