import { describe, expect, it } from 'vitest';
import { DEPTH } from '../src/game/constants';
import { battleBannerLayout, comboFeedbackText, multiCoreFeedbackText, transientMessageLayout, upgradeCardTextLayout, directivePanelHelpText } from '../src/game/feedback';

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

  it('uses a compact non-pulsing battle banner layout', () => {
    const early = battleBannerLayout(1.5, 0);
    const later = battleBannerLayout(1.5, 999);

    expect(early.w).toBe(276);
    expect(early.h).toBe(48);
    expect(later.w).toBe(early.w);
    expect(later.h).toBe(early.h);
    expect(early.textY).toBe(early.y + early.h / 2 - 2);
  });



  it('keeps directive panel help text independent from transient feedback', () => {
    expect(directivePanelHelpText(true)).toEqual(directivePanelHelpText(false));
    expect(directivePanelHelpText(true).help1).toContain('좌/우/상/하/대각');
    expect(directivePanelHelpText(true).help2).toContain('가로+세로=십자');
  });

  it('positions upgrade card text around visual centers with baseline correction', () => {
    const layout = upgradeCardTextLayout(500 + 82);

    expect(layout.number.origin).toEqual([0.5, 0.5]);
    expect(layout.number.y).toBe(500 + 82 + 42 - 3);
    expect(layout.title.origin).toEqual([0, 0.5]);
    expect(layout.description.origin).toEqual([0, 0.5]);
    expect(layout.title.y).toBeLessThan(500 + 82 + 31);
    expect(layout.description.y).toBeLessThan(500 + 82 + 58);
  });

  it('reserves non-overlapping transient message lanes', () => {
    const layout = transientMessageLayout();
    const ys = [layout.combo.y, layout.multiCore.y, layout.instruction.y, layout.glitch.y];

    expect(new Set(ys).size).toBe(ys.length);
    expect(Math.abs(layout.glitch.y - layout.combo.y)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(layout.combo.y - layout.multiCore.y)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(layout.multiCore.y - layout.instruction.y)).toBeGreaterThanOrEqual(30);
    expect(layout.glitch.priority).toBeGreaterThan(layout.combo.priority);
    expect(layout.glitch.priority).toBeGreaterThan(layout.instruction.priority);
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
