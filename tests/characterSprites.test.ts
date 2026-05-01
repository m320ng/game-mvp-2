import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTER_SPRITE_SPECS, HERO_SPRITE_STRIPS, characterAnimationKey, characterTextureKey, extractOpaqueColumnSegments, heroAnimationTextureKey, listCharacterAnimations } from '../src/game/characterSprites';
import type { EnemyType } from '../src/game/types';

const enemyTypes: EnemyType[] = ['scout', 'gunner', 'raider', 'brute', 'warden'];

describe('character sprite definitions', () => {
  it('defines hero animations from shipped knight sprite strips', () => {
    const hero = CHARACTER_SPRITE_SPECS.hero;

    expect(hero.states).toMatchObject({
      idle: { from: 0, to: 3, frameRate: 5, repeat: -1 },
      run: { from: 0, to: 6, frameRate: 10, repeat: -1 },
      slash: { from: 0, to: 3, frameRate: 16, repeat: 0 },
      hit: { from: 0, to: 1, frameRate: 12, repeat: 0 },
    });

    expect(HERO_SPRITE_STRIPS).toMatchObject({
      idle: { sourcePath: '/assets/characters/knight-1/idle.png', frames: 4 },
      run: { sourcePath: '/assets/characters/knight-1/run.png', frames: 7 },
      slash: { sourcePath: '/assets/characters/knight-1/attack-3.png', frames: 4 },
      hit: { sourcePath: '/assets/characters/knight-1/hurt.png', frames: 2 },
    });
    expect(existsSync(join(process.cwd(), 'public', HERO_SPRITE_STRIPS.idle.sourcePath.replace(/^\//, '')))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public', HERO_SPRITE_STRIPS.run.sourcePath.replace(/^\//, '')))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public', HERO_SPRITE_STRIPS.slash.sourcePath.replace(/^\//, '')))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public', HERO_SPRITE_STRIPS.hit.sourcePath.replace(/^\//, '')))).toBe(true);
    expect(characterTextureKey('hero')).toBe(heroAnimationTextureKey('idle'));
    expect(characterAnimationKey('hero', 'slash')).toBe('hero-slash');
    expect(listCharacterAnimations('hero')).toEqual(['idle', 'run', 'slash', 'hit']);
  });

  it('defines every enemy with idle, move, attack, hit, and death animation variants', () => {
    for (const type of enemyTypes) {
      const spec = CHARACTER_SPRITE_SPECS[type];

      expect(spec.kind).toBe(type);
      expect(spec.states).toEqual(expect.objectContaining({
        idle: expect.objectContaining({ repeat: -1 }),
        move: expect.objectContaining({ repeat: -1 }),
        attack: expect.objectContaining({ repeat: 0 }),
        hit: expect.objectContaining({ repeat: 0 }),
        death: expect.objectContaining({ repeat: 0 }),
      }));
      expect(listCharacterAnimations(type)).toEqual(['idle', 'move', 'attack', 'hit', 'death']);
      expect(characterTextureKey(type)).toBe(`generated-character-${type}`);
    }
  });

  it('extracts frame spans from opaque sprite strip columns', () => {
    expect(extractOpaqueColumnSegments([false, true, true, false, true, false, false, true, true, true, false])).toEqual([
      { start: 1, end: 2, width: 2 },
      { start: 4, end: 4, width: 1 },
      { start: 7, end: 9, width: 3 },
    ]);
  });
});
