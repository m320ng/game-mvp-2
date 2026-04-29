import { describe, expect, it } from 'vitest';
import { DEPTH } from '../src/game/constants';
import { comboFeedbackText, multiCoreFeedbackText } from '../src/game/feedback';

describe('feedback helpers', () => {
  it('formats visible combo tiers for chained cuts', () => {
    expect(comboFeedbackText(1, 1)).toBe('PERFECT CUT');
    expect(comboFeedbackText(2, 1)).toBe('CHAIN x2');
    expect(comboFeedbackText(8, 2)).toBe('COMBO x8');
  });

  it('formats aggregate multi-core cuts only for multiple good cores', () => {
    expect(multiCoreFeedbackText(1)).toBeNull();
    expect(multiCoreFeedbackText(2)).toBe('2 CORES CUT');
    expect(multiCoreFeedbackText(3)).toBe('3 CORES CUT');
  });

  it('keeps y-sorted characters and effects below HUD and overlays', () => {
    expect(DEPTH.BACKGROUND).toBeLessThan(DEPTH.CHARACTER_BASE);
    expect(DEPTH.CHARACTER_BASE + DEPTH.CHARACTER_Y_SORT_RANGE).toBeLessThan(DEPTH.EFFECTS);
    expect(DEPTH.EFFECTS).toBeLessThan(DEPTH.POINTER);
    expect(DEPTH.POINTER).toBeLessThan(DEPTH.HUD);
    expect(DEPTH.HUD).toBeLessThan(DEPTH.FLOATING_TEXT);
    expect(DEPTH.FLOATING_TEXT).toBeLessThan(DEPTH.GLITCH_WARNING);
    expect(DEPTH.GLITCH_WARNING).toBeLessThan(DEPTH.OVERLAY);
  });
});
