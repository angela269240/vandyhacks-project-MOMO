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
