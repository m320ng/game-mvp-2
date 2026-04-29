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
