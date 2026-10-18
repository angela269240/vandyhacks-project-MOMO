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
  chats: { groupIndex: number; hourStart: string; messages: ChatMessage[] }[];
};

const idFor = (i: number) => `seed-${String(i + 1).padStart(4, "0")}`;
const interestId = (name: string) => INTERESTS.find((x) => x.name === name)!.id;

const FIRST = [
  "Alex", "Bea", "Cam", "Dana", "Eli", "Faye", "Gus", "Hugo", "Iris", "Jade", "Kian", "Lena", "Milo", "Nora",
  "Omar", "Pia", "Quinn", "Rosa", "Seth", "Tara", "Uma", "Vik", "Wren", "Xavi", "Yara", "Zane",
];
const LAST = ["Abbott", "Bishop", "Cruz", "Dutta", "Ellis", "Fong", "Garza", "Haas", "Ito", "Joshi", "Kerr", "Lund"];

/** Groups that get filled to CROWD_SIZE people in the local demo (CS3251 Exam Cram, ML Paper Club). */
const CROWD_GROUPS = [0, 4];
const CROWD_SIZE = 40;
const CROWD_CORE = 30; // people in each crowd who each know CROWD_CORE others there
const EXTRA_USERS = 100;

/**
 * Local-demo stress world: 100 more people. Two groups grow to 40 members, and 30 of each group's members
 * know 30 others in it (the 30 are all friends with each other, plus one friend among the other 10).
 * The rest of the newcomers spread across the remaining groups and the outer ring.
 */
function addCrowd(world: SeedWorld, r: () => number) {
  const { users, friendships } = world;
  const seen = new Set(friendships.map((f) => `${f.a}|${f.b}`));
  const addEdge = (x: string, y: string) => {
    const [a, b] = x < y ? [x, y] : [y, x];
    if (a === b || seen.has(`${a}|${b}`)) return;
    seen.add(`${a}|${b}`);
    friendships.push({ a, b, status: "accepted", requestedBy: x });
  };

  const start = users.length;
  const extras: SeedUser[] = Array.from({ length: EXTRA_USERS }, (_, k) => {
    const name = `${FIRST[k % FIRST.length]} ${LAST[Math.floor(k / FIRST.length) % LAST.length]}`;
    const picked = new Set<number>();
    const target = 3 + Math.floor(r() * 4);
    while (picked.size < target) picked.add(1 + Math.floor(r() * INTERESTS.length));
    return {
      id: idFor(start + k),
      name,
      linkedin: `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      bio: BIOS[Math.floor(r() * BIOS.length)],
      interestIds: [...picked],
      groupIndex: null,
      memberOf: [],
      inRoom: false,
      leftMinutesAgo: null,
    };
  });

  // Fill the two crowd groups to exactly CROWD_SIZE active members.
  let next = 0;
  for (const gi of CROWD_GROUPS) {
    const existing = users.filter((u) => u.groupIndex === gi);
    for (const u of existing) {
      // everyone in a crowd group is in the room, so the count is exactly 40
      u.inRoom = true;
      u.leftMinutesAgo = null;
    }
    const needed = CROWD_SIZE - existing.length;
    for (let i = 0; i < needed; i++) {
      const u = extras[next++];
      u.groupIndex = gi;
      u.memberOf = [gi];
      u.inRoom = true;
      u.interestIds = [interestId(SEED_GROUPS[gi].interests[0]), ...u.interestIds.filter((x) => x !== interestId(SEED_GROUPS[gi].interests[0]))].slice(0, 6);
    }
  }

  // The rest: about two-thirds join the other groups, the others wander the outer ring.
  const others = SEED_GROUPS.map((_, i) => i).filter((i) => !CROWD_GROUPS.includes(i));
  for (; next < extras.length; next++) {
    const u = extras[next];
    if (r() < 0.65) {
      const gi = others[Math.floor(r() * others.length)];
      u.groupIndex = gi;
      u.memberOf = [gi];
      u.inRoom = true;
    }
  }
  users.push(...extras);

  // Friendships inside each crowd: a 30-person core that all know each other (29 each) plus one more friend each.
  for (const gi of CROWD_GROUPS) {
    const members = users.filter((u) => u.groupIndex === gi);
    const core = members.slice(0, CROWD_CORE);
    const rest = members.slice(CROWD_CORE);
    for (let i = 0; i < core.length; i++) for (let j = i + 1; j < core.length; j++) addEdge(core[i].id, core[j].id);
    core.forEach((u, i) => addEdge(u.id, rest[i % rest.length].id));
  }

  // A few friendships for everyone else so they aren't islands.
  for (const u of extras) {
    if (u.groupIndex !== null && CROWD_GROUPS.includes(u.groupIndex)) continue;
    const pool = users.filter((v) => v.id !== u.id && (u.groupIndex === null || v.groupIndex === u.groupIndex));
    for (let k = 0; k < 2; k++) addEdge(u.id, pool[Math.floor(r() * pool.length)].id);
  }
}

export function buildSeedWorld(now = new Date(), opts: { crowd?: boolean } = {}): SeedWorld {
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

  const world = { users, groups, friendships, chats };
  if (opts.crowd) addCrowd(world, r);
  return world;
}
