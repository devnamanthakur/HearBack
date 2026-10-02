import z from "zod";

export const createCommunitySchema = z.object({
  name: z
    .string()
    .min(3, "Community name should contain at least 3 characters")
    .max(50, "Community name should not exceed 50 characters"),
  description: z
    .string()
    .min(10, "Description should contain at least 10 characters")
    .max(300, "Description should not exceed 300 characters"),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color")
    .optional(),
  type: z.enum(["normal", "educational"]).optional(),
  requiredEmailDomains: z
    .array(z.string().min(3).max(100))
    .max(5, "Up to 5 email formats are allowed")
    .optional(),
  aiModeration: z.boolean().optional(),
  joinPolicy: z.enum(["open", "approval"]).optional(),
  inviteTtlHours: z
    .number()
    .int()
    .positive()
    .max(24 * 365)
    .nullable()
    .optional(),
});

export const joinCommunitySchema = z.object({
  inviteCode: z
    .string()
    .min(4, "Invite code should be at least 4 characters")
    .max(12, "Invalid invite code"),
});

export const createTopicSchema = z.object({
  title: z
    .string()
    .min(4, "Title should contain at least 4 characters")
    .max(120, "Title should not exceed 120 characters"),
  body: z
    .string()
    .min(1, "Body cannot be empty")
    .max(2000, "Body should not exceed 2000 characters"),
});

export const createResponseSchema = z.object({
  body: z
    .string()
    .min(1, "Response cannot be empty")
    .max(2000, "Response should not exceed 2000 characters"),
  replyToId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid reply reference")
    .optional()
    .nullable(),
});