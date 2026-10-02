import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { usernameValidation } from "@/schema/signUpSchema";

export async function GET(request: Request) {
  // Demo OTP mode must never be reachable in production unless the operator
  // explicitly opts in twice. Otherwise anyone could fetch the signup code for
  // any unverified account and bypass email verification.
  const demoOtpEnabled =
    process.env.DEMO_OTP_MODE === "true" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.DEMO_OTP_ALLOW_PRODUCTION === "true");

  if (!demoOtpEnabled) {
    return Response.json(
      { success: false, message: "Demo OTP mode is disabled" },
      { status: 403 },
    );
  }

  try {
    await dbConnect();
    const url = new URL(request.url);
    const username = url.searchParams.get("username");

    const parsed = usernameValidation.safeParse(username);
    if (!parsed.success) {
      return Response.json(
        { success: false, message: "Invalid username" },
        { status: 400 },
      );
    }

    const user = await UserModel.findOne({ username: parsed.data });
    if (!user) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    if (user.isVerified) {
      return Response.json(
        { success: true, otp: null, message: "Account already verified" },
        { status: 200 },
      );
    }

    return Response.json(
      { success: true, otp: user.verifyCode, message: "Demo OTP fetched" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching demo OTP", error);
    return Response.json(
      { success: false, message: "Error fetching demo OTP" },
      { status: 500 },
    );
  }
}