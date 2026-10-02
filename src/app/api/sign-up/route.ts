import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/helpers/sendVerificationEmail";
import { signUpSchema } from "@/schema/signUpSchema";
import { parseJsonObject } from "@/helpers/parseBody";
import { checkUsername } from "@/lib/moderation";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await parseJsonObject(request);

    if (!body) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid request body. Expected a JSON object with username, email and password.",
        },
        { status: 400 },
      );
    }

    const parsed = signUpSchema.safeParse(body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const { username, email, password } = parsed.data;

    const usernameCheck = checkUsername(username);
    if (!usernameCheck.ok) {
      return Response.json(
        { success: false, message: usernameCheck.message },
        { status: 400 },
      );
    }

    const existingUserByEmail = await UserModel.findOne({ email });

    if (existingUserByEmail?.isVerified) {
      return Response.json(
        {
          success: false,
          message: "User already exists with this email",
        },
        { status: 400 },
      );
    }

    const usernameOwner = await UserModel.findOne({ username });
    if (
      usernameOwner &&
      String(usernameOwner._id) !== String(existingUserByEmail?._id)
    ) {
      return Response.json(
        {
          success: false,
          message: "Username is already taken",
        },
        { status: 400 },
      );
    }

    const verifyCode = Math.floor(10000 + Math.random() * 90000).toString();
    const verifyCodeExpiry = new Date(Date.now() + 3600000);

    if (existingUserByEmail) {
      // An unverified account with this email already exists: refresh the code
      // and resend. We allow the (public) username to be corrected, but we
      // never overwrite the password here — the password is the credential and
      // email ownership isn't proven until the OTP is entered, so changing it
      // would let anyone who knows the address take over the account.
      existingUserByEmail.username = username;
      existingUserByEmail.verifyCode = verifyCode;
      existingUserByEmail.verifyCodeExpiry = verifyCodeExpiry;
      await existingUserByEmail.save();
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const newUser = new UserModel({
        username,
        email,
        password: hashPassword,
        verifyCode,
        verifyCodeExpiry,
        isVerified: false,
        isAcceptingMessage: true,
        messages: [],
      });
      await newUser.save();
    }

    const emailResponse = await sendVerificationEmail(
      email,
      existingUserByEmail?.username ?? username,
      verifyCode,
    );

    if (!emailResponse.success) {
      return Response.json(
        {
          success: false,
          message: emailResponse.message,
        },
        { status: 500 },
      );
    }

    return Response.json(
      {
        success: true,
        message: "User registered successfully. Please verify your email.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error registering user", error);
    return Response.json(
      {
        success: false,
        message: "Error registering user",
      },
      { status: 500 },
    );
  }
}