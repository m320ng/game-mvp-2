import type { DirectionCode, DirectionFamily, GestureBaseType, GestureInfo, LastGesture, LengthProfile, Point } from './types';
import { clamp, dist } from './math';

export function classifyGestureDirection(dx: number, dy: number) {
  const absDx = Math.abs(dx); const absDy = Math.abs(dy);
  let baseType: GestureBaseType = 'diagonal';
  if (absDy > absDx * 1.45) baseType = 'vertical';
  else if (absDx > absDy * 1.45) baseType = 'horizontal';
  if (baseType === 'horizontal') return { baseType, dirCode: (dx >= 0 ? 'h_lr' : 'h_rl') as DirectionCode, dirLabel: dx >= 0 ? '좌→우' : '우→좌', family: 'horizontal' as DirectionFamily };
  if (baseType === 'vertical') return { baseType, dirCode: (dy >= 0 ? 'v_down' : 'v_up') as DirectionCode, dirLabel: dy >= 0 ? '위→아래' : '아래→위', family: 'vertical' as DirectionFamily };
  let dirCode: DirectionCode = 'd_dr'; let dirLabel = '↘';
  if (dx >= 0 && dy < 0) { dirCode = 'd_ur'; dirLabel = '↗'; }
  else if (dx < 0 && dy >= 0) { dirCode = 'd_dl'; dirLabel = '↙'; }
  else if (dx < 0 && dy < 0) { dirCode = 'd_ul'; dirLabel = '↖'; }
  return { baseType, dirCode, dirLabel, family: (dx * dy >= 0 ? 'diag_backslash' : 'diag_slash') as DirectionFamily };
}

export function isOppositeDirection(a: DirectionCode, b: DirectionCode) {
  const pairs: Record<DirectionCode, DirectionCode> = { h_lr: 'h_rl', h_rl: 'h_lr', v_down: 'v_up', v_up: 'v_down', d_dr: 'd_ul', d_ul: 'd_dr', d_ur: 'd_dl', d_dl: 'd_ur' };
  return pairs[a] === b;
}

export function lengthProfile(info: Pick<GestureInfo, 'direct'|'length'>): LengthProfile {
  const d = info.direct || info.length || 0;
  if (d < 112) return { tier: 'short', label: '짧은', damageMult: 1.16, rangeMult: 0.78, targetBonus: -1, slashLenMult: 0.84 };
  if (d < 205) return { tier: 'medium', label: '중간', damageMult: 1.00, rangeMult: 1.00, targetBonus: 0, slashLenMult: 1.00 };
  if (d < 315) return { tier: 'long', label: '긴', damageMult: 0.88, rangeMult: 1.32, targetBonus: 1, slashLenMult: 1.28 };
  return { tier: 'veryLong', label: '초장거리', damageMult: 0.76, rangeMult: 1.58, targetBonus: 2, slashLenMult: 1.48 };
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point) {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 0.001) return null;
  const px = ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / den;
  const py = ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / den;
  const within = px >= Math.min(a.x, b.x) - 12 && px <= Math.max(a.x, b.x) + 12 && px >= Math.min(c.x, d.x) - 12 && px <= Math.max(c.x, d.x) + 12 && py >= Math.min(a.y, b.y) - 12 && py <= Math.max(a.y, b.y) + 12 && py >= Math.min(c.y, d.y) - 12 && py <= Math.max(c.y, d.y) + 12;
  return within ? { x: px, y: py } : null;
}
function angleDelta(a: number, b: number) { let d = Math.abs(a - b) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return d; }

export function analyzeGesture(path: Point[], lastGesture: LastGesture | null = null, now = performance.now()): GestureInfo | null {
  if (!path || path.length < 2) return null;
  const start = path[0]; const end = path[path.length - 1];
  let length = 0; let sx = 0; let sy = 0;
  for (let i = 1; i < path.length; i++) { length += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y); sx += path[i].x; sy += path[i].y; }
  const dx = end.x - start.x; const dy = end.y - start.y; const direct = Math.hypot(dx, dy); const duration = Math.max(1, end.t - start.t); const straightness = direct / Math.max(1, length); const speed = length / duration;
  if (length < 58 || direct < 44 || straightness < 0.56 || duration > 1250 || speed < 0.08) return null;
  const dir = classifyGestureDirection(dx, dy);
  const info: GestureInfo = { type: dir.baseType, baseType: dir.baseType, dirCode: dir.dirCode, dirLabel: dir.dirLabel, family: dir.family, x1: start.x, y1: start.y, x2: end.x, y2: end.y, mx: sx / Math.max(1, path.length - 1), my: sy / Math.max(1, path.length - 1), angle: Math.atan2(dy, dx), length, direct, straightness, duration, profile: lengthProfile({ direct, length } as GestureInfo) };
  if (lastGesture && now - lastGesture.time < 850) {
    const inter = lineIntersection({ x: info.x1, y: info.y1, t: 0 }, { x: info.x2, y: info.y2, t: 0 }, { x: lastGesture.x1, y: lastGesture.y1, t: 0 }, { x: lastGesture.x2, y: lastGesture.y2, t: 0 });
    const angled = angleDelta(info.angle, lastGesture.angle) > 0.55;
    if (inter && angled) {
      const lastBase = lastGesture.baseType;
      if (info.baseType === 'diagonal' && lastBase === 'diagonal' && info.family !== lastGesture.family) info.type = 'xslash';
      else if ((info.baseType === 'horizontal' && lastBase === 'vertical') || (info.baseType === 'vertical' && lastBase === 'horizontal')) info.type = 'cross';
      else if (isOppositeDirection(lastGesture.dirCode, info.dirCode)) info.comboVariant = 'reverse';
      if (info.type === 'cross' || info.type === 'xslash') { info.mx = clamp(inter.x, -9999, 9999); info.my = inter.y; }
    }
  }
  return info;
}

export function slashLabel(info: GestureInfo | null) {
  if (!info) return '';
  const profile = info.profile || lengthProfile(info);
  const dir = info.dirLabel ? `${info.dirLabel} ` : '';
  if (info.type === 'cross') return `${profile.label} 십자베기`;
  if (info.type === 'xslash') return `${profile.label} X베기`;
  if (info.comboVariant === 'reverse' && info.baseType === 'horizontal') return `${profile.label} 왕복 가로베기`;
  if (info.comboVariant === 'reverse' && info.baseType === 'vertical') return `${profile.label} 상하 연격`;
  if (info.comboVariant === 'reverse' && info.baseType === 'diagonal') return `${profile.label} 반대대각 연격`;
  if (info.baseType === 'horizontal') return `${profile.label} ${dir}가로베기`;
  if (info.baseType === 'vertical') return `${profile.label} ${dir}세로베기`;
  return `${profile.label} ${dir}대각베기`;
}
