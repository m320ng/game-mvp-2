import type * as Phaser from 'phaser';
import type { EnemyType } from './types';

export type CharacterKind = 'hero' | EnemyType;
export type HeroAnimationState = 'idle' | 'run' | 'slash' | 'hit';
export type EnemyAnimationState = 'idle' | 'move' | 'attack' | 'hit' | 'death';
export type CharacterAnimationState = HeroAnimationState | EnemyAnimationState;

export interface AnimationFrameRange {
  from: number;
  to: number;
  frameRate: number;
  repeat: number;
}

export interface CharacterSpriteSpec {
  kind: CharacterKind;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  scale: number;
  states: Record<string, AnimationFrameRange>;
}

export interface HeroSpriteStripSpec {
  sourcePath: string;
  frames: number;
  framePadding: number;
}

export interface OpaqueColumnSegment {
  start: number;
  end: number;
  width: number;
}

const FRAME_W = 32;
const FRAME_H = 32;
const HERO_FRAME_H = 86;
const HERO_FRAME_W = 96;
const HERO_SCALE = 0.72;
const HERO_STATES: HeroAnimationState[] = ['idle', 'run', 'slash', 'hit'];

export const HERO_SPRITE_STRIPS: Record<HeroAnimationState, HeroSpriteStripSpec> = {
  idle: { sourcePath: '/assets/characters/knight-1/idle.png', frames: 4, framePadding: 8 },
  run: { sourcePath: '/assets/characters/knight-1/run.png', frames: 7, framePadding: 8 },
  slash: { sourcePath: '/assets/characters/knight-1/attack-3.png', frames: 4, framePadding: 10 },
  hit: { sourcePath: '/assets/characters/knight-1/hurt.png', frames: 2, framePadding: 8 },
};

export const CHARACTER_SPRITE_SPECS = {
  hero: {
    kind: 'hero',
    frameWidth: HERO_FRAME_W,
    frameHeight: HERO_FRAME_H,
    frameCount: 7,
    scale: HERO_SCALE,
    states: {
      idle: { from: 0, to: 3, frameRate: 5, repeat: -1 },
      run: { from: 0, to: 6, frameRate: 10, repeat: -1 },
      slash: { from: 0, to: 3, frameRate: 16, repeat: 0 },
      hit: { from: 0, to: 1, frameRate: 12, repeat: 0 },
    },
  },
  scout: enemySpec('scout', 1.38),
  gunner: enemySpec('gunner', 1.46),
  raider: enemySpec('raider', 1.42),
  brute: enemySpec('brute', 1.62),
  warden: enemySpec('warden', 1.92),
} satisfies Record<CharacterKind, CharacterSpriteSpec>;

export function characterTextureKey(kind: CharacterKind) {
  return kind === 'hero' ? heroAnimationTextureKey('idle') : `generated-character-${kind}`;
}

export function heroStripTextureKey(state: HeroAnimationState) {
  return `hero-strip-${state}`;
}

export function heroAnimationTextureKey(state: HeroAnimationState) {
  return `hero-sheet-${state}`;
}

export function characterAnimationKey(kind: CharacterKind, state: CharacterAnimationState) {
  return `${kind}-${state}`;
}

export function listCharacterAnimations(kind: CharacterKind) {
  return Object.keys(CHARACTER_SPRITE_SPECS[kind].states);
}

export function preloadCharacterSpriteAssets(scene: Phaser.Scene) {
  for (const state of HERO_STATES) {
    const strip = HERO_SPRITE_STRIPS[state];
    const key = heroStripTextureKey(state);
    if (!scene.textures.exists(key)) scene.load.image(key, strip.sourcePath);
  }
}

export function registerCharacterSprites(scene: Phaser.Scene) {
  registerHeroCharacterSprites(scene);
  registerGeneratedEnemySprites(scene);
}

export function registerGeneratedCharacterSprites(scene: Phaser.Scene) {
  registerCharacterSprites(scene);
}

export function extractOpaqueColumnSegments(columns: boolean[]): OpaqueColumnSegment[] {
  const segments: OpaqueColumnSegment[] = [];
  let start = -1;

  for (let index = 0; index <= columns.length; index += 1) {
    const opaque = columns[index] ?? false;
    if (opaque && start === -1) {
      start = index;
      continue;
    }
    if (!opaque && start !== -1) {
      segments.push({ start, end: index - 1, width: index - start });
      start = -1;
    }
  }

  return segments;
}

function registerHeroCharacterSprites(scene: Phaser.Scene) {
  for (const state of HERO_STATES) {
    const strip = HERO_SPRITE_STRIPS[state];
    const animation = CHARACTER_SPRITE_SPECS.hero.states[state];
    const textureKey = heroAnimationTextureKey(state);
    const animationKey = characterAnimationKey('hero', state);

    if (!scene.textures.exists(textureKey)) {
      const sourceKey = heroStripTextureKey(state);
      if (!scene.textures.exists(sourceKey)) throw new Error(`Missing hero sprite strip: ${sourceKey}`);
      const sheet = buildHeroAnimationSheet(scene, sourceKey, strip.frames, strip.framePadding);
      scene.textures.addSpriteSheet(textureKey, sheet as unknown as HTMLImageElement, {
        frameWidth: sheet.width / strip.frames,
        frameHeight: sheet.height,
        margin: 0,
        spacing: 0,
      });
    }

    if (scene.anims.exists(animationKey)) continue;
    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: animation.from, end: animation.to }),
      frameRate: animation.frameRate,
      repeat: animation.repeat,
    });
  }
}

function buildHeroAnimationSheet(
  scene: Phaser.Scene,
  sourceKey: string,
  expectedFrames: number,
  framePadding: number,
) {
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const columns = readOpaqueColumns(source);
  const spans = normalizeFrameSegments(columns, expectedFrames);
  const frameWidth = Math.max(...spans.map((span) => span.width)) + framePadding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = frameWidth * spans.length;
  canvas.height = source.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create hero sprite sheet canvas');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  spans.forEach((span, index) => {
    const destX = index * frameWidth + Math.floor((frameWidth - span.width) / 2);
    ctx.drawImage(source, span.start, 0, span.width, source.height, destX, 0, span.width, source.height);
  });

  return canvas;
}

function normalizeFrameSegments(columns: boolean[], expectedFrames: number) {
  const segments = extractOpaqueColumnSegments(columns);
  if (segments.length === expectedFrames) return segments;
  return splitStripEvenly(columns.length, expectedFrames);
}

function splitStripEvenly(totalWidth: number, frames: number): OpaqueColumnSegment[] {
  const segments: OpaqueColumnSegment[] = [];
  for (let index = 0; index < frames; index += 1) {
    const start = Math.round((index * totalWidth) / frames);
    const end = Math.round(((index + 1) * totalWidth) / frames) - 1;
    segments.push({ start, end, width: end - start + 1 });
  }
  return segments;
}

function readOpaqueColumns(source: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to inspect hero sprite pixels');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const columns = new Array<boolean>(width).fill(false);

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        columns[x] = true;
        break;
      }
    }
  }

  return columns;
}

function registerGeneratedEnemySprites(scene: Phaser.Scene) {
  for (const kind of Object.keys(CHARACTER_SPRITE_SPECS) as CharacterKind[]) {
    if (kind === 'hero') continue;
    const spec = CHARACTER_SPRITE_SPECS[kind];
    const key = characterTextureKey(kind);
    if (!scene.textures.exists(key)) {
      const canvas = drawCharacterSheet(kind, spec);
      scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
        margin: 0,
        spacing: 0,
      });
    }

    for (const [state, range] of Object.entries(spec.states)) {
      const animKey = characterAnimationKey(kind, state as CharacterAnimationState);
      if (scene.anims.exists(animKey)) continue;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(key, { start: range.from, end: range.to }),
        frameRate: range.frameRate,
        repeat: range.repeat,
      });
    }
  }
}

function enemySpec(kind: EnemyType, scale: number): CharacterSpriteSpec {
  return {
    kind,
    frameWidth: FRAME_W,
    frameHeight: FRAME_H,
    frameCount: 15,
    scale,
    states: {
      idle: { from: 0, to: 2, frameRate: 4, repeat: -1 },
      move: { from: 3, to: 6, frameRate: 8, repeat: -1 },
      attack: { from: 7, to: 9, frameRate: 11, repeat: 0 },
      hit: { from: 10, to: 11, frameRate: 12, repeat: 0 },
      death: { from: 12, to: 14, frameRate: 10, repeat: 0 },
    },
  };
}

function drawCharacterSheet(kind: CharacterKind, spec: CharacterSpriteSpec) {
  const canvas = document.createElement('canvas');
  canvas.width = spec.frameWidth * spec.frameCount;
  canvas.height = spec.frameHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create generated character sprite canvas');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let frame = 0; frame < spec.frameCount; frame++) {
    const ox = frame * spec.frameWidth;
    if (kind === 'hero') drawHeroFrame(ctx, ox, frame);
    else drawEnemyFrame(ctx, ox, frame, kind);
  }

  return canvas;
}

function drawHeroFrame(ctx: CanvasRenderingContext2D, ox: number, frame: number) {
  const bob = frame <= 3 ? (frame % 2) : frame <= 7 ? (frame % 2 ? -1 : 1) : 0;
  const attacking = frame >= 8 && frame <= 11;
  const hit = frame >= 12;
  const slashReach = attacking ? (frame - 7) * 3 : 0;
  const leg = frame >= 4 && frame <= 7 ? (frame % 2 ? 2 : -2) : 0;

  shadow(ctx, ox, 16, 27, 11, 3, hit ? '#5ef4ff55' : '#00000055');
  rect(ctx, ox, 13, 13 + bob, 7, 11, hit ? '#f7fdff' : '#293041');
  rect(ctx, ox, 12, 5 + bob, 9, 8, hit ? '#ffffff' : '#e7edf5');
  rect(ctx, ox, 13, 9 + bob, 7, 2, '#121923');
  rect(ctx, ox, 19, 15 + bob, 4 + slashReach, 3, attacking ? '#f4fbff' : '#64ddff');
  rect(ctx, ox, 8, 15 + bob, 5, 3, '#46657e');
  rect(ctx, ox, 12 + leg, 24 + bob, 3, 5, '#74eaff');
  rect(ctx, ox, 18 - leg, 24 + bob, 3, 5, '#74eaff');
  rect(ctx, ox, 16, 2 + bob, 5, 3, '#66eaff');
  if (attacking) {
    rect(ctx, ox, 21, 10 + frame % 2, 5 + slashReach, 2, '#dffcff');
    rect(ctx, ox, 23, 8 + frame % 3, 3 + slashReach, 1, '#fff4a8');
  }
  outline(ctx, ox, 12, 5 + bob, 9, 8);
  outline(ctx, ox, 13, 13 + bob, 7, 11);
}

function drawEnemyFrame(ctx: CanvasRenderingContext2D, ox: number, frame: number, kind: EnemyType) {
  const palette = enemyPalette(kind);
  const move = frame >= 3 && frame <= 6;
  const attack = frame >= 7 && frame <= 9;
  const hit = frame >= 10 && frame <= 11;
  const death = frame >= 12;
  const bob = move ? (frame % 2 ? 1 : -1) : frame % 2;
  const lean = death ? frame - 12 : attack ? frame - 7 : 0;
  const w = kind === 'warden' ? 13 : kind === 'brute' ? 11 : 9;
  const h = kind === 'warden' ? 15 : kind === 'brute' ? 14 : 12;
  const headW = kind === 'warden' ? 12 : 10;
  const deathAlpha = death ? ['#ffffff', '#ffffffaa', '#ffffff55'][frame - 12] : null;
  const body = hit ? '#ffffff' : deathAlpha ?? palette.body;
  const head = hit ? '#ffffff' : deathAlpha ?? palette.head;

  shadow(ctx, ox, 16, 27, kind === 'warden' ? 13 : 10, death ? 2 : 3, '#00000055');
  rect(ctx, ox, 16 - Math.floor(w / 2) + lean, 13 + bob, w, h, body);
  rect(ctx, ox, 16 - Math.floor(headW / 2) + lean, 5 + bob, headW, 8, head);
  rect(ctx, ox, 13 + lean, 9 + bob, 7, 2, palette.visor);
  rect(ctx, ox, 20 + lean, 15 + bob, 4 + (attack ? 5 + lean * 2 : 1), 3, hit ? '#ffffff' : palette.accent);
  rect(ctx, ox, 9 + lean, 15 + bob, 4, 3, palette.dark);
  rect(ctx, ox, 12 + (move && frame % 2 ? -2 : 0) + lean, 25 + bob, 3, 4, palette.accent);
  rect(ctx, ox, 18 + (move && frame % 2 ? 2 : 0) + lean, 25 + bob, 3, 4, palette.accent);
  if (kind === 'gunner') rect(ctx, ox, 22 + lean, 13 + bob, attack ? 8 : 5, 2, hit ? '#ffffff' : '#ffca78');
  if (kind === 'warden') rect(ctx, ox, 11 + lean, 2 + bob, 10, 3, hit ? '#ffffff' : '#ff5b46');
  if (death) {
    rect(ctx, ox, 9, 26 + (frame - 12), 14, 2, palette.accent);
    rect(ctx, ox, 22, 22 + (frame - 12) * 2, 3, 3, palette.accent);
  }
  outline(ctx, ox, 16 - Math.floor(w / 2) + lean, 13 + bob, w, h);
  outline(ctx, ox, 16 - Math.floor(headW / 2) + lean, 5 + bob, headW, 8);
}

function enemyPalette(kind: EnemyType) {
  switch (kind) {
    case 'gunner': return { body: '#62422f', head: '#f08c4d', visor: '#151b22', accent: '#ffb066', dark: '#2a1d19' };
    case 'raider': return { body: '#5d4a37', head: '#efad39', visor: '#121820', accent: '#ffd06c', dark: '#2a2119' };
    case 'brute': return { body: '#596879', head: '#d7dbe2', visor: '#101820', accent: '#9fc2d8', dark: '#26313c' };
    case 'warden': return { body: '#75685f', head: '#c7bbb0', visor: '#241016', accent: '#ff5b46', dark: '#332926' };
    case 'scout':
    default: return { body: '#614933', head: '#d7b07c', visor: '#111820', accent: '#ffc67b', dark: '#2b2118' };
  }
}

function rect(ctx: CanvasRenderingContext2D, ox: number, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + x, y, w, h);
}

function outline(ctx: CanvasRenderingContext2D, ox: number, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = '#0b1018';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + x + 0.5, y + 0.5, w - 1, h - 1);
}

function shadow(ctx: CanvasRenderingContext2D, ox: number, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(ox + x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}
