import { describe, expect, it } from 'vitest';
import { analyzeGesture, classifyGestureDirection, isOppositeDirection, lengthProfile } from '../src/game/gesture';
import type { GestureInfo, Point } from '../src/game/types';

const path = (pts: Array<[number, number, number?]>): Point[] =>
  pts.map(([x, y, t], index) => ({ x, y, t: t ?? index * 90 }));

const asLast = (info: GestureInfo) => ({
  x1: info.x1,
  y1: info.y1,
  x2: info.x2,
  y2: info.y2,
  angle: info.angle,
  time: 1000,
  baseType: info.baseType,
  dirCode: info.dirCode,
  family: info.family,
});

describe('SplitBlade gesture recognition', () => {
  it('classifies direction families and opposite direction rules like the source MVP', () => {
    expect(classifyGestureDirection(200, 20)).toMatchObject({ baseType: 'horizontal', dirCode: 'h_lr' });
    expect(classifyGestureDirection(-200, 20)).toMatchObject({ baseType: 'horizontal', dirCode: 'h_rl' });
    expect(classifyGestureDirection(10, -180)).toMatchObject({ baseType: 'vertical', dirCode: 'v_up' });
    expect(classifyGestureDirection(120, -110)).toMatchObject({ baseType: 'diagonal', dirCode: 'd_ur', family: 'diag_slash' });
    expect(isOppositeDirection('d_dr', 'd_ul')).toBe(true);
    expect(isOppositeDirection('h_lr', 'v_up')).toBe(false);
  });

  it('rejects short, slow, or curled gestures and assigns length profiles', () => {
    expect(analyzeGesture(path([[0, 0, 0], [20, 10, 100]]))).toBeNull();
    expect(analyzeGesture(path([[0, 0, 0], [120, 0, 2200]]))).toBeNull();
    expect(analyzeGesture(path([[0, 0, 0], [120, 0, 100], [0, 80, 200]]))).toBeNull();
    expect(lengthProfile({ direct: 90 } as GestureInfo)).toMatchObject({ tier: 'short', damageMult: 1.16 });
    expect(lengthProfile({ direct: 340 } as GestureInfo)).toMatchObject({ tier: 'veryLong', targetBonus: 2 });
  });

  it('promotes intersecting horizontal and vertical gestures to cross', () => {
    const first = analyzeGesture(path([[270, 760, 0], [270, 560, 140]]));
    expect(first?.type).toBe('vertical');
    const second = analyzeGesture(path([[160, 660, 1100], [380, 660, 1220]]), asLast(first!));
    expect(second).toMatchObject({ type: 'cross', mx: 270, my: 660 });
  });

  it('promotes opposite diagonal families to xslash', () => {
    const first = analyzeGesture(path([[170, 570, 0], [370, 770, 160]]));
    expect(first?.family).toBe('diag_backslash');
    const second = analyzeGesture(path([[370, 570, 1100], [170, 770, 1230]]), asLast(first!));
    expect(second).toMatchObject({ type: 'xslash' });
  });
});
