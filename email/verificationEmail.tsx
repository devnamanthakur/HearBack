import * as React from "react";
import { Html, Head, Text } from "react-email";

interface verificationProps {
  username: string;
  otp: string;
}
//this is the email template
export default function verificationEmail({
  username,
  otp,
}: verificationProps) {
  return (
    <Html lang="en">
      <Head>
        <title>Please Verify Your email</title>
      </Head>
      <Text>
        Hi {username},To verify use the OTP :{otp}
      </Text> 
    </Html>
  );
}
