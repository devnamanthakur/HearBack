import { render } from "@react-email/render";
import verificationEmail from "../../email/verificationEmail";
import { sendEmail } from "@/lib/mail";

export async function sendVerificationEmail(
  email: string,
  username: string,
  verifyCode: string,
) {
  if (process.env.DEMO_OTP_MODE === "true") {
    console.log(
      `[demo-otp] Skipping email for ${email} — OTP is shown on the verify page.`,
    );
    return { success: true, message: "email successfully sent" };
  }

  try {
    const html = await render(
      verificationEmail({ username, otp: verifyCode }),
    );
    return await sendEmail({
      to: email,
      subject: "Verify your email — Hearback",
      html,
    });
  } catch (emailError) {
    console.error("Error sending verification email", emailError);
    return {
      success: false,
      message: "Failed to send verification email.",
    };
  }
}
