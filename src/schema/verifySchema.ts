import z from "zod";

export const verifySchema = z.object({
  code: z
    .string()
    .length(5, "Verification code must be of 5 digits")
    .regex(/^\d+$/, "Verification code must only contain digits"),
});
