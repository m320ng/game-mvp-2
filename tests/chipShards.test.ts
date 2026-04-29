import { describe, expect, it } from 'vitest';
import { createChipShards, chipPalette } from '../src/game/chipShards';
import type { Chip } from '../src/game/types';

function chip(kind: Chip['kind']): Chip {
  return {
    id: 7,
    kind,
    x: 260,
    y: 700,
    vx: 10,
    vy: -20,
    g: 800,
    r: 30,
    rot: 0.25,
    spin: 0,
    age: 0,
    marked: false,
    markedPulse: 0,
    hitAngle: 0,
    sliceAngle: 0,
    sliced: false,
    pop: 0,
    remove: false,
  };
}

describe('chip shard generation', () => {
  it('creates two shard halves that separate along opposite slash normals', () => {
    const shards = createChipShards(chip('blade'), 0, 100);

    expect(shards).toHaveLength(2);
    expect(shards[0]).toMatchObject({ side: -1, kind: 'blade', cutAngle: 0 });
    expect(shards[1]).toMatchObject({ side: 1, kind: 'blade', cutAngle: 0 });
    expect(shards[0].vy).toBeLessThan(0);
    expect(shards[1].vy).toBeGreaterThan(0);
    expect(shards[0].life).toBeGreaterThan(0.6);
  });

  it('preserves chip color identity and gives glitch shards extra fragments', () => {
    expect(chipPalette('repair')).toMatchObject({ fill: 0x66f5ad, edge: 0xcaffdf });
    expect(chipPalette('surge')).toMatchObject({ fill: 0xffd86c });

    const glitch = createChipShards(chip('glitch'), Math.PI / 2, 200);
    expect(glitch.every((s) => s.fill === 0xff486f)).toBe(true);
    expect(glitch.every((s) => s.fragmentBurst >= 8)).toBe(true);
  });
});
