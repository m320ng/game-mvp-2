export function comboFeedbackText(combo: number, cutCount: number): string | null {
  if (combo <= 0 || cutCount <= 0) return null;
  if (combo === 1) return 'PERFECT CUT';
  if (combo < 5) return `CHAIN x${combo}`;
  return `COMBO x${combo}`;
}

export function multiCoreFeedbackText(goodCoreCount: number): string | null {
  if (goodCoreCount < 2) return null;
  return `${goodCoreCount} CORES CUT`;
}

export function battleBannerLayout(remaining: number, _time: number, screenW = 540) {
  const w = 276;
  const h = 48;
  const x = screenW / 2 - w / 2;
  const y = 88;
  const alpha = Math.max(0, Math.min(1, remaining * 1.35));
  return { x, y, w, h, radius: 15, alpha, textY: y + h / 2 - 2 };
}
