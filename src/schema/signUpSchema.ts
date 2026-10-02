import z from "zod";

export const usernameValidation = z
  .string()
  .min(4, "username should contain at least 4 characters")
  .max(20, "username should not consist of more than 20 characters")
  .regex(
    /^[a-zA-Z0-9]+$/,
    "username should only contain letters and numbers",
  );

export const signUpSchema = z.object({
  username: usernameValidation,
  email: z.email({ error: "Invalid email" }),
  password: z.string().min(4, "password should contain atleast 4 characters"),
});
