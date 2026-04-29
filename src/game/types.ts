export type RunStatus = 'start' | 'running' | 'choice' | 'win' | 'lose';
export type EnemyType = 'scout' | 'gunner' | 'raider' | 'brute' | 'warden';
export type ChipKind = 'blade' | 'repair' | 'surge' | 'glitch';
export type GestureBaseType = 'horizontal' | 'vertical' | 'diagonal';
export type GestureType = GestureBaseType | 'cross' | 'xslash';
export type DirectionCode = 'h_lr' | 'h_rl' | 'v_down' | 'v_up' | 'd_dr' | 'd_ur' | 'd_dl' | 'd_ul';
export type DirectionFamily = 'horizontal' | 'vertical' | 'diag_backslash' | 'diag_slash';

export interface Point { x: number; y: number; t: number; }
export interface LengthProfile { tier: 'short' | 'medium' | 'long' | 'veryLong'; label: string; damageMult: number; rangeMult: number; targetBonus: number; slashLenMult: number; }
export interface GestureInfo {
  type: GestureType;
  baseType: GestureBaseType;
  dirCode: DirectionCode;
  dirLabel: string;
  family: DirectionFamily;
  x1: number; y1: number; x2: number; y2: number; mx: number; my: number;
  angle: number; length: number; direct: number; straightness: number; duration: number;
  profile: LengthProfile;
  comboVariant?: 'reverse';
}
export type LastGesture = Pick<GestureInfo, 'x1'|'y1'|'x2'|'y2'|'angle'|'baseType'|'dirCode'|'family'> & { time: number };

export interface UpgradeState { skillDamage: number; heroAtk: number; heroMove: number; extraTargets: number; healBoost: number; comboBonus: number; overdrive: number; aoe: number; }
export interface GameState {
  status: RunStatus; time: number; runTime: number; hp: number; maxHp: number; shield: number; kills: number; score: number; level: number; xp: number; xpNeed: number; combo: number; maxCombo: number; comboTimer: number; overdrive: number; chipSpawn: number; shake: number; flash: number; battleIndex: number; battleSize: number; battleAlive: number; battleClearTimer: number; battleBanner: number; battleBannerText: string; slashSenseText: string; slashSenseTime: number; choiceOptions: Upgrade[]; resultLine: string; upg: UpgradeState;
}
export interface Upgrade { title: string; desc: string; apply: () => void; }
export interface HeroSkillPoint { x: number; y: number; damage: number; angle: number; target: Enemy | null; slashLen?: number; radius?: number; settle?: boolean; resolved?: boolean; }
export interface HeroSkill { type: GestureType; seg: number; segT: number; startX: number; startY: number; overdrive: boolean; points: HeroSkillPoint[]; }
export interface Hero { x: number; y: number; homeX: number; homeY: number; facing: number; attackCd: number; swing: number; hurt: number; hitFlash: number; trail: Array<{x:number;y:number;life:number}>; skill: HeroSkill | null; }
export interface Enemy { id: number; type: EnemyType; mode: 'ranged'|'melee'; isRanged: boolean; x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; speed: number; attackRate: number; attackCd: number; damage: number; range: number; preferredRange: number; radius: number; projectileSpeed: number; projectileSize: number; projectileColor: string; score: number; xp: number; facing: number; hurt: number; hitFlash: number; swing: number; dead: boolean; }
export interface Projectile { x: number; y: number; vx: number; vy: number; life: number; damage: number; radius: number; color: string; trail: number; }
export interface Chip { id: number; kind: ChipKind; x: number; y: number; vx: number; vy: number; g: number; r: number; rot: number; spin: number; age: number; marked: boolean; markedPulse: number; hitAngle: number; sliceAngle: number; sliced: boolean; pop: number; remove: boolean; }
export interface ChipShard { id: string; kind: ChipKind; side: -1 | 1; x: number; y: number; vx: number; vy: number; g: number; r: number; rot: number; spin: number; cutAngle: number; age: number; life: number; maxLife: number; fill: number; dark: number; edge: number; glow: number; fragmentBurst: number; }
export interface Slash { x: number; y: number; angle: number; len: number; color: string; dur: number; t: number; width: number; }
export interface Particle { x: number; y: number; vx: number; vy: number; color: string; size: number; life: number; maxLife: number; drag: number; }
export interface FloatText { text: string; x: number; y: number; vy: number; life: number; maxLife: number; color: string; size: number; }
export interface PointerState { down: boolean; id: number | null; path: Point[]; hitIds: Set<number>; lastPoint: Point | null; readyInfo: GestureInfo | null; readyAt: number; locked: boolean; committed: boolean; }
