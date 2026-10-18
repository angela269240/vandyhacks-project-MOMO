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
  "Aisha Rahman", "Ben Carter", "Camila Ortiz", "Daniel Cho", "Esther Adeyemi", "Finn Larsen",
  "Gabriela Silva", "Henry Walsh", "Ines Moreau", "Jae Lee", "Kofi Mensah", "Laila Haddad",
  "Mateo Garcia", "Naomi Fischer", "Oscar Lindqvist", "Paloma Reyes", "Rahul Iyer", "Sara Cohen",
  "Tomas Herrera", "Valentina Cruz", "Will Bennett", "Ximena Lopez", "Yusuf Demir", "Zoe Hartman",
  "Adrian Kowalski", "Bianca Costa", "Connor Hayes", "Deepa Krishnan", "Emeka Obi", "Freya Jensen",
  "Gideon Shapiro", "Harper Quinn", "Ivan Sokolov", "Jasmine Wu", "Kenji Watanabe", "Lauren Mitchell",
  "Mohammed Saleh", "Nadia Haider", "Olivia Brennan", "Pedro Alves", "Rosa Delgado", "Simon Ng",
  "Tessa Morgan", "Victor Huang", "Wendy Osei",
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
  "Sophomore, still deciding between econ and CS. Convince me.",
  "TA for intro bio. Office hours are a vibe, I promise.",
  "Third floor of the library is my second home.",
  "Writing a thesis on something nobody asks about at parties.",
  "Looking for a study buddy who won't let me procrastinate.",
  "Grad school applications have taken over my life.",
  "Lab rat by day, intramural runner by night.",
  "First-gen student, happy to share what I've learned so far.",
  "I color-code my notes and I'm not sorry.",
  "Internship hunting. Will review your resume if you review mine.",
];

/**
 * The demo's bubbles: the six original rooms first (the seeded chat history points at them by index), then
 * college study, career and campus-life groups. Interests must be names from lib/interests.ts.
 */
export const SEED_GROUPS = [
  { name: "CS3251 Exam Cram", category: "Academics", interests: ["CS3251", "Hackathons", "Game Dev"] },
  { name: "Badminton Sunday", category: "Sports & Fitness", interests: ["Badminton", "Running", "Rock Climbing"] },
  { name: "Baby Bio Study Hall", category: "Health & Pre-Med", interests: ["Baby Bio", "Pre-Med", "Cooking"] },
  { name: "Startup Ideas", category: "Career & Startups", interests: ["Startups", "Hackathons", "Debate"] },
  { name: "ML Paper Club", category: "Tech", interests: ["Machine Learning", "Linear Algebra", "Robotics"] },
  { name: "Late Night Chess", category: "Games", interests: ["Chess", "Philosophy", "Jazz"] },
  { name: "Orgo II Problem Sets", category: "Science", interests: ["Pre-Med", "Baby Bio", "Linear Algebra"] },
  { name: "Linear Algebra Office Hours", category: "Academics", interests: ["Linear Algebra", "Machine Learning", "Chess"] },
  { name: "MCAT Prep Circle", category: "Health & Pre-Med", interests: ["Pre-Med", "Baby Bio", "Running"] },
  { name: "Hackathon Team Finder", category: "Tech", interests: ["Hackathons", "Startups", "Game Dev"] },
  { name: "Robotics Lab Build Night", category: "Tech", interests: ["Robotics", "Machine Learning", "Hackathons"] },
  { name: "Philosophy 101 Discussion", category: "Academics", interests: ["Philosophy", "Debate", "Film"] },
  { name: "Debate Team Practice", category: "Social", interests: ["Debate", "Philosophy", "Spanish"] },
  { name: "Spanish Conversation Table", category: "Languages & Culture", interests: ["Spanish", "Cooking", "Film"] },
  { name: "Calc III Study Group", category: "Academics", interests: ["Linear Algebra", "CS3251", "Chess"] },
  { name: "Physics Lab Report Help", category: "Science", interests: ["Linear Algebra", "Robotics", "Philosophy"] },
  { name: "Resume & Internship Review", category: "Career & Startups", interests: ["Startups", "Hackathons", "Debate"] },
  { name: "Thesis Writing Accountability", category: "Academics", interests: ["Philosophy", "Film", "Photography"] },
  { name: "Coding Interview Prep", category: "Career & Startups", interests: ["CS3251", "Machine Learning", "Hackathons"] },
  { name: "Film Studies Screening Club", category: "Arts & Media", interests: ["Film", "Photography", "Jazz"] },
  { name: "Campus Photography Walk", category: "Arts & Media", interests: ["Photography", "Film", "Rock Climbing"] },
  { name: "Econ 101 Problem Sets", category: "Academics", interests: ["Startups", "Linear Algebra", "Debate"] },
  { name: "Game Dev Studio", category: "Games", interests: ["Game Dev", "Hackathons", "Jazz"] },
  { name: "Library Quiet Study Hour", category: "Academics", interests: ["Philosophy", "Chess", "Jazz"] },
  { name: "Intramural Running Club", category: "Sports & Fitness", interests: ["Running", "Rock Climbing", "Badminton"] },
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
  chats: { groupIndex: number; hourStart: string; messages: ChatMessage[] }[];
};

const idFor = (i: number) => `seed-${String(i + 1).padStart(4, "0")}`;
const interestId = (name: string) => INTERESTS.find((x) => x.name === name)!.id;

/** How many friendships the world gets: dense-ish within groups, a sprinkle across them. */
const FRIENDSHIPS = 120;

/**
 * Which group each person sits in: the first SEED_GROUPS.length people one per group (so every bubble has someone),
 * everyone else spread at random, weighted so some rooms come out bigger than others.
 */
function assignGroups(count: number, r: () => number): number[] {
  const groups = SEED_GROUPS.length;
  const order = Array.from({ length: groups }, (_, i) => i).sort(() => r() - 0.5);
  const weights = Array.from({ length: groups }, () => 0.4 + r() * 2.6);
  const total = weights.reduce((a, b) => a + b, 0);
  const out = order.slice(0, Math.min(groups, count));
  while (out.length < count) {
    let x = r() * total;
    let gi = 0;
    while ((x -= weights[gi]) > 0) gi++;
    out.push(Math.min(gi, groups - 1));
  }
  return out;
}

export function buildSeedWorld(now = new Date()): SeedWorld {
  const r = rng(42);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const placement = assignGroups(NAMES.length, r);

  const users: SeedUser[] = NAMES.map((name, i) => {
    const groupIndex: number | null = placement[i];
    const base = SEED_GROUPS[groupIndex].interests.map(interestId);
    const picked = new Set<number>(base.slice(0, 1 + Math.floor(r() * 2)));
    const target = 3 + Math.floor(r() * 4);
    while (picked.size < target) picked.add(1 + Math.floor(r() * INTERESTS.length));
    // the first person placed in each group is always in the room, so no bubble is only gray leftovers
    const away = i >= SEED_GROUPS.length && r() < 0.15;
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
  while (friendships.length < FRIENDSHIPS) {
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
      id: `seed-${groupIndex}-${h}-${i}`,
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
    },
    {
      groupIndex: 0,
      hourStart: hourAgo(1),
      messages: msgs(0, 1, ["Practice exam is up on the course page", "Doing problem 3 now, who's in?", "Me, sharing screen in 5"]),
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
    },
  ];

  return { users, groups, friendships, chats };
}
