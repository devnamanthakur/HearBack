import z from "zod";

export const messageSchema = z.object({
  content: z.string().min(4, "Meessage should contain atleast 4 characters"),
});
