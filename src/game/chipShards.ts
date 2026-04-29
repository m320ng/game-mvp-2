import type { Chip, ChipKind, ChipShard } from './types';

export function chipPalette(kind: ChipKind) {
  switch (kind) {
    case 'repair': return { fill: 0x66f5ad, dark: 0x1f6f58, edge: 0xcaffdf, glow: 0x71ffb5 };
    case 'surge': return { fill: 0xffd86c, dark: 0x7a5420, edge: 0xfff2a6, glow: 0xffd76a };
    case 'glitch': return { fill: 0xff486f, dark: 0x3b0b19, edge: 0xffc0cf, glow: 0xff426d };
    default: return { fill: 0x77e6ff, dark: 0x1d607d, edge: 0xdffcff, glow: 0x78eaff };
  }
}

export function createChipShards(chip: Chip, cutAngle: number, now = performance.now()): ChipShard[] {
  const palette = chipPalette(chip.kind);
  const nx = -Math.sin(cutAngle);
  const ny = Math.cos(cutAngle);
  const tangentX = Math.cos(cutAngle);
  const tangentY = Math.sin(cutAngle);
  const baseKick = chip.kind === 'glitch' ? 260 : chip.kind === 'surge' ? 220 : 190;
  const tangentKick = chip.kind === 'repair' ? 28 : 42;

  return [-1, 1].map((side) => ({
    id: `${chip.id}-${side}-${Math.round(now)}`,
    kind: chip.kind,
    side: side as -1 | 1,
    x: chip.x + nx * side * 3,
    y: chip.y + ny * side * 3,
    vx: chip.vx * 0.34 + nx * side * baseKick + tangentX * side * tangentKick,
    vy: chip.vy * 0.18 + ny * side * baseKick + tangentY * side * tangentKick - 72,
    g: 980,
    r: chip.r,
    rot: chip.rot,
    spin: chip.spin * 0.4 + side * (chip.kind === 'glitch' ? 7.2 : 4.8),
    cutAngle,
    age: 0,
    life: chip.kind === 'glitch' ? 0.92 : 1.05,
    maxLife: chip.kind === 'glitch' ? 0.92 : 1.05,
    fill: palette.fill,
    dark: palette.dark,
    edge: palette.edge,
    glow: palette.glow,
    fragmentBurst: chip.kind === 'glitch' ? 10 : chip.kind === 'surge' ? 4 : 2,
  }));
}
