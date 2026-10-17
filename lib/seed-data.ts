import { colorForName } from "./colors";
import { INTERESTS } from "./interests";
import { hourStart } from "./time";
import type { ChatMessage } from "./types";

/** Deterministic demo world shared by the in-memory store and `scripts/seed.ts`. */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Maya Chen", "Jordan Brooks", "Priya Raman", "Leo Martinez", "Ava Thompson", "Noah Kim",
  "Zara Okafor", "Ethan Park", "Sofia Rossi", "Liam O'Connor", "Hana Suzuki", "Marcus Reed",
  "Isla Nguyen", "Caleb Foster", "Amara Diallo", "Owen Patel", "Ruby Alvarez", "Felix Wagner",
  "Nina Petrova", "Theo Grant", "Lucia Fernandez", "Sam Rivera", "Elena Volkova", "Kai Nakamura",
  "Grace Liu", "Diego Santos", "Mila Novak", "Arjun Mehta", "Chloe Dubois", "Jonah Weiss",
];

const BIOS = [
  "Always down for a late-night study session and good coffee.",
  "Building small things, breaking bigger ones. Ask me about side projects.",
  "Trying to understand neurons, both the biological and artificial kind.",
  "Weekend climber, weekday debugger.",
  "I make flashcards for fun. Yes, really.",
  "Looking for people to start something with.",
  "Film nerd who also likes eigenvalues.",
  "Pre-med by day, jazz piano by night.",
  "Runs on oat milk lattes and spaced repetition.",
  "Will trade chess lessons for cooking tips.",
];

export const SEED_GROUPS = [
  { name: "CS3251 Exam Cram", category: "Academics", interests: ["CS3251", "Hackathons", "Game Dev"] },
  { name: "Badminton Sunday", category: "Sports & Fitness", interests: ["Badminton", "Running", "Rock Climbing"] },
  { name: "Baby Bio Study Hall", category: "Health & Pre-Med", interests: ["Baby Bio", "Pre-Med", "Cooking"] },
  { name: "Startup Ideas", category: "Career & Startups", interests: ["Startups", "Hackathons", "Debate"] },
  { name: "ML Paper Club", category: "Tech", interests: ["Machine Learning", "Linear Algebra", "Robotics"] },
  { name: "Late Night Chess", category: "Games", interests: ["Chess", "Philosophy", "Jazz"] },
];

export type SeedUser = {
  id: string;
  name: string;
  linkedin: string;
  bio: string;
  interestIds: number[];
  groupIndex: number | null;
  /** all communities joined (includes groupIndex) */
  memberOf: number[];
  inRoom: boolean;
  /** minutes ago they left the room, when not in it */
  leftMinutesAgo: number | null;
};

export type SeedWorld = {
  users: SeedUser[];
  groups: { name: string; color: string; category: string; createdByIndex: number }[];
  friendships: { a: string; b: string; status: "accepted" | "pending"; requestedBy: string }[];
  chats: { groupIndex: number; hourStart: string; messages: ChatMessage[]; summary: string | null }[];
};

const idFor = (i: number) => `seed-${String(i + 1).padStart(4, "0")}`;
const interestId = (name: string) => INTERESTS.find((x) => x.name === name)!.id;

export function buildSeedWorld(now = new Date()): SeedWorld {
  const r = rng(42);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];

  const users: SeedUser[] = NAMES.map((name, i) => {
    // 26 of 30 users sit in a group; the rest float on the outer ring.
    const groupIndex = i < 26 ? i % SEED_GROUPS.length : null;
    const base = groupIndex === null ? [] : SEED_GROUPS[groupIndex].interests.map(interestId);
    const picked = new Set<number>(base.slice(0, 1 + Math.floor(r() * 2)));
    const target = 3 + Math.floor(r() * 4);
    while (picked.size < target) picked.add(1 + Math.floor(r() * INTERESTS.length));
    const away = groupIndex !== null && r() < 0.15;
    const memberOf = new Set<number>(groupIndex === null ? [] : [groupIndex]);
    if (r() < 0.45) memberOf.add(Math.floor(r() * SEED_GROUPS.length)); // some people belong to a second community
    return {
      id: idFor(i),
      name,
      linkedin: `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      bio: pick(BIOS),
      interestIds: [...picked],
      groupIndex,
      memberOf: [...memberOf],
      inRoom: groupIndex !== null && !away,
      leftMinutesAgo: away ? 30 + Math.floor(r() * 300) : null,
    };
  });

  const groups = SEED_GROUPS.map((g, i) => ({ name: g.name, color: colorForName(g.name), category: g.category, createdByIndex: i }));

  const friendships: SeedWorld["friendships"] = [];
  const seen = new Set<string>();
  const addEdge = (a: string, b: string, status: "accepted" | "pending" = "accepted") => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    friendships.push({ a: x, b: y, status, requestedBy: a });
  };
  // Dense-ish within groups, a sprinkle across groups so the map has bridges.
  while (friendships.length < 45) {
    const u = pick(users);
    const sameGroup = r() < 0.6 && u.groupIndex !== null;
    const candidates = sameGroup ? users.filter((v) => v.groupIndex === u.groupIndex) : users;
    addEdge(u.id, pick(candidates).id);
  }

  const hourAgo = (h: number) => hourStart(new Date(now.getTime() - h * 3600_000));
  const msgs = (groupIndex: number, h: number, lines: string[]): ChatMessage[] => {
    const members = users.filter((u) => u.groupIndex === groupIndex);
    const start = new Date(hourAgo(h)).getTime();
    return lines.map((text, i) => ({
      ts: new Date(start + (i + 1) * 4 * 60_000).toISOString(),
      userId: members[i % members.length].id,
      text,
    }));
  };

  const chats: SeedWorld["chats"] = [
    {
      groupIndex: 0,
      hourStart: hourAgo(2),
      messages: msgs(0, 2, [
        "Anyone else stuck on the visitor pattern question?",
        "Yeah, the double dispatch part is confusing",
        "Think of accept() as 'tell the visitor who I am'",
        "Oh that actually helps",
        "Is the midterm cumulative?",
        "Everything through the observer pattern",
      ]),
      summary: "The group worked through the visitor pattern (accept() as double dispatch) and confirmed the midterm covers material through the observer pattern.",
    },
    {
      groupIndex: 0,
      hourStart: hourAgo(1),
      messages: msgs(0, 1, ["Practice exam is up on the course page", "Doing problem 3 now, who's in?", "Me, sharing screen in 5"]),
      summary: null,
    },
    {
      groupIndex: 2,
      hourStart: hourAgo(3),
      messages: msgs(2, 3, [
        "Can someone explain the Krebs cycle like I'm five",
        "It's a merry-go-round that makes energy tokens",
        "And NADH carries them to the electron transport chain",
        "Ok making flashcards for this",
        "Share them please!",
      ]),
      summary: "A quick Krebs cycle explainer turned into a flashcard-making session, with the deck to be shared with the group.",
    },
  ];

  return { users, groups, friendships, chats };
}
