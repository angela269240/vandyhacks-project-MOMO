/** The category tag every bubble gets at creation (exactly one). */
export const CATEGORIES = [
  "Academics",
  "Tech",
  "Science",
  "Health & Pre-Med",
  "Arts & Media",
  "Sports & Fitness",
  "Games",
  "Career & Startups",
  "Languages & Culture",
  "Social",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const isCategory = (v: string): v is Category => (CATEGORIES as readonly string[]).includes(v);
