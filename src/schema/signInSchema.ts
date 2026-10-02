import z from "zod";

export const signInSchema = z.object({
  identifier: z.string().min(1, "username or email is required"),
  password: z.string().min(4, "password should contain at least 4 characters"),
});
