import { z } from "zod";
import { CATEGORIES } from "./categories";
import { INTERESTS } from "./interests";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const linkedinSchema = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s/]+\/?$/i.test(v), {
    message: "LinkedIn should look like linkedin.com/in/your-name",
  })
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v));

export const interestIdsSchema = z
  .array(z.number().int().refine((id) => INTERESTS.some((i) => i.id === id), "Unknown interest"))
  .min(3, "Pick at least 3 interests")
  .max(6, "Pick at most 6 interests")
  .transform((ids) => [...new Set(ids)]);

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  linkedin: linkedinSchema,
  bio: optionalText(280),
  interestIds: interestIdsSchema,
});

export const bookmarksSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(40),
      name: z.string().trim().min(1, "Bookmark needs a name").max(40),
      groupIds: z.array(z.number().int()).max(200),
    }),
  )
  .max(50);

export const profilePatchSchema = profileSchema.partial().extend({
  avatarUrl: z.string().max(500).nullish(),
  bookmarks: bookmarksSchema.optional(),
});

export const categorySchema = z.enum(CATEGORIES, { message: "Pick a category" });

export const groupNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(60, "Name must be at most 60 characters")
  .regex(/^[^/\\?#%]+$/, "Name can't contain / \\ ? # or %");

export const chatSchema = z.object({ text: z.string().trim().min(1).max(1000) });
