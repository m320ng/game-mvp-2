import { describe, expect, it } from 'vitest';
import { CHARACTER_SPRITE_SPECS, characterAnimationKey, characterTextureKey, listCharacterAnimations } from '../src/game/characterSprites';
import type { EnemyType } from '../src/game/types';

const enemyTypes: EnemyType[] = ['scout', 'gunner', 'raider', 'brute', 'warden'];

describe('generated character sprite definitions', () => {
  it('defines hero idle, run, slash, and hit animation frame ranges', () => {
    const hero = CHARACTER_SPRITE_SPECS.hero;

    expect(hero.states).toMatchObject({
      idle: { from: 0, to: 3, frameRate: 5, repeat: -1 },
      run: { from: 4, to: 7, frameRate: 10, repeat: -1 },
      slash: { from: 8, to: 11, frameRate: 16, repeat: 0 },
      hit: { from: 12, to: 13, frameRate: 12, repeat: 0 },
    });
    expect(characterTextureKey('hero')).toBe('generated-character-hero');
    expect(characterAnimationKey('hero', 'slash')).toBe('hero-slash');
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
});
