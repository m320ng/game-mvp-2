export const W = 540;
export const H = 960;
export const TOP_H = 500;
export const BOT_H = H - TOP_H;
export const FIELD = { x: 30, y: 68, w: 480, h: 426 } as const;
export const CORE_X = 42;
export const HERO_HOME_X = 130;
export const HERO_HOME_Y = 250;
export const TAU = Math.PI * 2;


export const DEPTH = {
  BACKGROUND: 0,
  CHARACTER_TRAIL: 90,
  CHARACTER_BASE: 100,
  CHARACTER_Y_SORT_RANGE: 1,
  EFFECTS: 220,
  POINTER: 260,
  HUD: 500,
  FLOATING_TEXT: 620,
  GLITCH_WARNING: 680,
  OVERLAY: 800,
  OVERLAY_TEXT: 820,
} as const;
