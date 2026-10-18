// Run with: npx tsx --test components/map/layout.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterRadius, computeLayout, footprintsApart, ringPoint, type LabelBox } from "./layout";

const above = (p: { x: number; y: number }, r: number, l: LabelBox) => ({
  x0: p.x - l.w / 2,
  x1: p.x + l.w / 2,
  y0: p.y - r - l.h,
  y1: p.y - r,
});

test("bubbles, their labels, you and the people in no bubble never overlap", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const sizes = new Map(ids.map((id, i) => [id, [20, 6, 6, 4, 20, 4, 12, 1][i]]));
  // labels sized for a far-out view: much wider than the bubbles themselves
  const labels = new Map<number, LabelBox>(ids.map((id) => [id, { w: 1100, h: 230 }]));
  const me = { r: 120, label: { w: 700, h: 130 } };
  const L = computeLayout(ids, [], null, sizes, 0.55, [], labels, me);

  const prints = ids.map((id) => {
    const p = L.anchors.get(id)!;
    const r = clusterRadius(sizes.get(id)!);
    return { p, r, boxes: [above(p, r, labels.get(id)!)] };
  });
  const you = { p: { x: 0, y: 0 }, r: me.r, boxes: [{ x0: -350, x1: 350, y0: me.r, y1: me.r + 130 }] };
  const all = [you, ...prints];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) assert.ok(footprintsApart(all[i], all[j]), `footprints ${i} and ${j} overlap`);

  // the ring of people in no bubble sits outside every bubble and label
  for (const id of ["a", "b", "c", "d", "e"]) {
    const q = ringPoint(id, L.ringRadius);
    for (const f of prints) {
      assert.ok(Math.hypot(q.x - f.p.x, q.y - f.p.y) > f.r + 42, "ring person inside a bubble");
      const b = f.boxes[0];
      assert.ok(q.x < b.x0 || q.x > b.x1 || q.y < b.y0 || q.y > b.y1, "ring person on a label");
    }
  }
});

test("without labels the layout is unchanged in spirit: tight but non-overlapping", () => {
  const ids = [1, 2, 3];
  const sizes = new Map([[1, 10], [2, 10], [3, 10]]);
  const L = computeLayout(ids, [], 1, sizes);
  assert.deepEqual(L.anchors.get(1), { x: 0, y: 0 });
  const r = clusterRadius(10);
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const pa = L.anchors.get(a)!;
    const pb = L.anchors.get(b)!;
    assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= 2 * r);
  }
});

test("focused bubbles form square bounds even when their labels have different widths", () => {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const sizes = new Map(ids.map((id) => [id, 1 + ((id * 7) % 9)]));
  const labels = new Map<number, LabelBox>(ids.map((id) => [id, { w: 180 + (id % 4) * 95, h: 70 }]));
  const L = computeLayout(ids, [], 1, sizes, 0.55, [], labels);
  const prints = ids.map((id) => {
    const p = L.anchors.get(id)!;
    const r = clusterRadius(sizes.get(id)!);
    return { p, r };
  });
  const x0 = Math.min(...prints.map(({ p, r }) => p.x - r));
  const x1 = Math.max(...prints.map(({ p, r }) => p.x + r));
  const y0 = Math.min(...prints.map(({ p, r }) => p.y - r));
  const y1 = Math.max(...prints.map(({ p, r }) => p.y + r));

  assert.ok(Math.abs(x1 - x0 - (y1 - y0)) < 0.01, `layout is ${x1 - x0} × ${y1 - y0}`);
});

test("focused bubbles take the center while unfocused bubbles remain in the surrounding field", () => {
  const focused = [4, 5];
  const unfocused = [1, 2, 3, 6];
  const ids = [...focused, ...unfocused];
  const sizes = new Map(ids.map((id) => [id, 6]));
  const L = computeLayout(focused, unfocused, null, sizes, 0.55, focused);

  assert.deepEqual(L.anchors.get(4), { x: 0, y: 0 }, "the first highlighted bubble owns the center");
  const outer = unfocused.map((id) => L.anchors.get(id)!);
  assert.ok(outer.some((p) => p.x < 0), "unfocused bubbles surround the center instead of forming a right-side strip");
  assert.ok(outer.some((p) => Math.abs(p.y) > 40), "unfocused bubbles spread vertically around the focused field");

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const pa = L.anchors.get(a)!;
      const pb = L.anchors.get(b)!;
      const ra = clusterRadius(sizes.get(a)!, focused.includes(a) ? 1 : 0.55);
      const rb = clusterRadius(sizes.get(b)!, focused.includes(b) ? 1 : 0.55);
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= ra + rb, `${a} and ${b} overlap`);
    }
  }
});
