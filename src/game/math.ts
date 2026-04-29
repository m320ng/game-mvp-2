export function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function rand(a: number, b: number) { return a + Math.random() * (b - a); }
export function randi(a: number, b: number) { return Math.floor(rand(a, b + 1)); }
export function dist(ax: number, ay: number, bx: number, by: number) { return Math.hypot(ax - bx, ay - by); }
export function easeOutCubic(t: number) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
export function segmentCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number) {
  const abx = bx - ax; const aby = by - ay; const ab2 = abx * abx + aby * aby || 1;
  const t = clamp(((cx - ax) * abx + (cy - ay) * aby) / ab2, 0, 1);
  const px = ax + abx * t; const py = ay + aby * t;
  return dist(px, py, cx, cy) <= r;
}
