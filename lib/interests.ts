import { HUES, interestHue } from "./colors";
import type { Interest } from "./types";

export const INTEREST_NAMES = [
  "CS3251",
  "Badminton",
  "Baby Bio",
  "Machine Learning",
  "Startups",
  "Pre-Med",
  "Linear Algebra",
  "Hackathons",
  "Robotics",
  "Game Dev",
  "Photography",
  "Film",
  "Jazz",
  "Chess",
  "Debate",
  "Philosophy",
  "Rock Climbing",
  "Running",
  "Cooking",
  "Spanish",
] as const;

export const INTERESTS: Interest[] = INTEREST_NAMES.map((name, i) => ({
  id: i + 1,
  name,
  // stored swatch only; the UI renders interestColor(id), which follows the theme
  color: HUES.find((h) => h.key === interestHue(i + 1))!.swatch,
}));
