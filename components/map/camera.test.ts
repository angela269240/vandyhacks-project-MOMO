// Run with: npx tsx --test components/map/camera.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyDragDelta,
  centerToTranslate,
  clampCameraPosition,
  getCameraPanBounds,
  getGraphBounds,
  smoothBounds,
  translateToCenter,
} from "./camera";

const view = { width: 1000, height: 800 };
const nodes = [
  { x: -1500, y: -900 },
  { x: 2000, y: 300 },
  { x: 100, y: 1200 },
];

test("bounds ignore nodes without coordinates and handle an empty graph", () => {
  assert.equal(getGraphBounds([]), null);
  assert.equal(getGraphBounds([{ x: undefined, y: 3 }, { x: NaN, y: 1 }]), null);
  assert.deepEqual(getGraphBounds([...nodes, { x: undefined, y: undefined }]), {
    minX: -1500,
    maxX: 2000,
    minY: -900,
    maxY: 1200,
  });
});

test("at each limit the outermost node sits on the viewport centerline", () => {
  const b = getGraphBounds(nodes)!;
  for (const k of [0.5, 1, 2.5]) {
    const pb = getCameraPanBounds(b, k, view);
    // dragging the map up as far as it goes: bottom-most node at the horizontal centerline
    assert.equal(b.maxY * k + pb.minPanY, view.height / 2);
    // dragging down: top-most node at the centerline
    assert.equal(b.minY * k + pb.maxPanY, view.height / 2);
    // dragging left: right-most node at the vertical centerline; dragging right: left-most node
    assert.equal(b.maxX * k + pb.minPanX, view.width / 2);
    assert.equal(b.minX * k + pb.maxPanX, view.width / 2);
  }
});

test("dragging past a limit stops on that axis only", () => {
  const b = getGraphBounds(nodes)!;
  const pb = getCameraPanBounds(b, 1, view);
  const start = { x: view.width / 2, y: view.height / 2, k: 1 };
  // huge upward drag plus a small sideways one: y pins to the limit, x still follows the pointer
  const t = applyDragDelta(start, 40, -50_000, pb);
  assert.equal(t.y, pb.minPanY);
  assert.equal(t.x, start.x + 40);
  // moving back the other way moves the graph again straight away
  const back = applyDragDelta(t, 0, 10, pb);
  assert.equal(back.y, pb.minPanY + 10);
});

test("limits widen when zoomed in", () => {
  const b = getGraphBounds(nodes)!;
  const near = getCameraPanBounds(b, 2, view);
  const far = getCameraPanBounds(b, 0.5, view);
  assert.ok(near.maxPanX - near.minPanX > far.maxPanX - far.minPanX);
});

test("an axis that fits on screen is locked centered", () => {
  const small = getGraphBounds([
    { x: 100, y: 0 },
    { x: 300, y: 50 },
  ])!;
  const pb = getCameraPanBounds(small, 1, view, 100);
  assert.equal(pb.minPanX, pb.maxPanX);
  assert.equal(pb.minPanY, pb.maxPanY);
  const t = clampCameraPosition({ x: -9999, y: 9999, k: 1 }, pb);
  const c = translateToCenter(t, view);
  assert.deepEqual(c, { x: 200, y: 25 });

  // tall but narrow: x locked, y free
  const tall = getGraphBounds([
    { x: 0, y: -2000 },
    { x: 10, y: 2000 },
  ])!;
  const tb = getCameraPanBounds(tall, 1, view, 100);
  assert.equal(tb.minPanX, tb.maxPanX);
  assert.ok(tb.maxPanY - tb.minPanY === 4000);
});

test("center and translate conversions round-trip", () => {
  const t = centerToTranslate({ x: 123, y: -45 }, 1.7, view);
  const c = translateToCenter(t, view);
  assert.ok(Math.abs(c.x - 123) < 1e-9 && Math.abs(c.y + 45) < 1e-9);
});

test("smoothed bounds settle and stop changing", () => {
  let b = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  const target = { minX: -50, maxX: 100, minY: 0, maxY: 300 };
  for (let i = 0; i < 200; i++) b = smoothBounds(b, target, 0.1)!;
  assert.deepEqual(b, target);
  assert.equal(smoothBounds(b, { ...target }, 0.1), b);
});
