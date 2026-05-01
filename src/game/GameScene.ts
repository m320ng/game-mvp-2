import * as Phaser from 'phaser';
import { BOT_H, CORE_X, FIELD, H, HERO_HOME_X, HERO_HOME_Y, TAU, TOP_H, W } from './constants';
import { analyzeGesture, lengthProfile, slashLabel } from './gesture';
import { clamp, dist, easeOutCubic, lerp, rand, randi, segmentCircle } from './math';
import { TonePlayer } from './audio';
import { chipPalette, createChipShards } from './chipShards';
import { CHARACTER_SPRITE_SPECS, characterAnimationKey, characterTextureKey, heroAnimationTextureKey, preloadCharacterSpriteAssets, registerCharacterSprites } from './characterSprites';
import type { Chip, ChipShard, Enemy, EnemyType, FloatText, GameState, GestureInfo, Hero, HeroSkillPoint, LastGesture, Particle, Point, PointerState, Projectile, Slash, Upgrade } from './types';

const ENEMY_STATS: Record<EnemyType, { hp:number; speed:number; cooldown:number; damage:number; range:number; radius:number; score:number; xp:number; mode:'ranged'|'melee'; projectileSpeed?:number; projectileSize?:number; projectileColor?:string }> = {
  scout:  { hp: 18, speed: 19, cooldown: 3.10, damage: 2, range: 150, radius: 12, score: 100, xp: 0.85, mode: 'ranged', projectileSpeed: 205, projectileSize: 4, projectileColor: '#ffd39b' },
  gunner: { hp: 28, speed: 16, cooldown: 3.65, damage: 4, range: 178, radius: 14, score: 140, xp: 1.05, mode: 'ranged', projectileSpeed: 185, projectileSize: 5, projectileColor: '#ffb066' },
  raider: { hp: 34, speed: 12, cooldown: 1.35, damage: 5, range: 26,  radius: 13, score: 135, xp: 1.0, mode: 'melee' },
  brute:  { hp: 72, speed: 9,  cooldown: 1.95, damage: 9, range: 30, radius: 16, score: 240, xp: 1.8, mode: 'melee' },
  warden: { hp: 235, speed: 8,  cooldown: 1.65, damage: 12, range: 34, radius: 20, score: 1200, xp: 6.0, mode: 'melee' },
};

export class GameScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private state!: GameState;
  private hero!: Hero;
  private heroSprite: Phaser.GameObjects.Sprite | null = null;
  private heroTrailSprites: Phaser.GameObjects.Image[] = [];
  private enemySprites = new Map<number, Phaser.GameObjects.Sprite>();
  private deathSprites: Array<{ sprite: Phaser.GameObjects.Sprite; life: number; maxLife: number }> = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private chips: Chip[] = [];
  private chipShards: ChipShard[] = [];
  private slashes: Slash[] = [];
  private particles: Particle[] = [];
  private nextId = 1;
  private lastGesture: LastGesture | null = null;
  private pointerState!: PointerState;
  private tones = new TonePlayer();
  private hud: Record<string, Phaser.GameObjects.Text> = {};
  private floatLabels: Array<{ model: FloatText; text: Phaser.GameObjects.Text }> = [];
  private upgrades: Upgrade[] = [];

  constructor() { super('GameScene'); }

  preload() {
    preloadCharacterSpriteAssets(this);
  }

  create() {
    registerCharacterSprites(this);
    this.g = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(5);
    this.ui = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0);
    this.createHudTexts();
    this.resetState();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.finishPointer, this);
    this.input.on('pointercancel', this.finishPointer, this);
    this.input.keyboard?.on('keydown-SPACE', () => { this.tones.init(); if (['start','win','lose'].includes(this.state.status)) this.startRun(); });
    this.input.keyboard?.on('keydown-R', () => this.startRun());
    this.input.keyboard?.on('keydown-ONE', () => { if (this.state.status === 'choice') this.applyUpgrade(0); });
    this.input.keyboard?.on('keydown-TWO', () => { if (this.state.status === 'choice') this.applyUpgrade(1); });
    this.input.keyboard?.on('keydown-THREE', () => { if (this.state.status === 'choice') this.applyUpgrade(2); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyCharacterSprites, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.destroyCharacterSprites, this);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.033, deltaMs / 1000 || 0);
    if (this.state.status === 'running') this.updateRun(dt);
    this.updateEffects(dt);
    this.renderFrame();
  }

  private createHudTexts() {
    const make = (x:number, y:number, size:number, color = '#eaffff', align: 'left'|'center'|'right' = 'left') => {
      const t = this.add.text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: '900', color }).setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0.5).setDepth(10);
      this.ui.add(t); return t;
    };
    this.hud.timer = make(W/2, 26, 20, '#e8fbff', 'center');
    this.hud.battle = make(W/2, 48, 11, 'rgba(232,251,255,.7)', 'center');
    this.hud.score = make(W-18, 52, 13, '#dffcff', 'right');
    this.hud.combo = make(W-18, 92, 30, '#fff3a8', 'right');
    this.hud.sense = make(W/2, TOP_H + 86, 13, '#fff3a8', 'center');
    this.hud.coreLabel = make(28, 24, 10, '#ffb8c4');
    this.hud.xpLabel = make(28, 60, 10, '#b8ffd5');
    this.hud.overdriveLabel = make(W - 166, 25, 10, '#ffe889');
    this.hud.panelTitle = make(18, TOP_H + 18, 15, '#bdefff');
    this.hud.panelHelp1 = make(18, TOP_H + 40, 11, 'rgba(218,246,255,.75)', 'left');
    this.hud.panelHelp2 = make(18, TOP_H + 57, 11, 'rgba(218,246,255,.75)', 'left');
  }

  private resetState() {
    this.destroyCharacterSprites();
    this.state = { status: 'start', time: 0, runTime: 100, hp: 115, maxHp: 115, shield: 0, kills: 0, score: 0, level: 1, xp: 0, xpNeed: 8, combo: 0, maxCombo: 0, comboTimer: 0, overdrive: 0, chipSpawn: 0.25, shake: 0, flash: 0, battleIndex: 0, battleSize: 0, battleAlive: 0, battleClearTimer: -1, battleBanner: 0, battleBannerText: '', slashSenseText: '', slashSenseTime: 0, choiceOptions: [], resultLine: '', upg: { skillDamage: 1, heroAtk: 1, heroMove: 1, extraTargets: 0, healBoost: 1, comboBonus: 0, overdrive: 1, aoe: 1 } };
    this.hero = { x: HERO_HOME_X, y: HERO_HOME_Y, homeX: HERO_HOME_X, homeY: HERO_HOME_Y, facing: 1, attackCd: 0.1, swing: 0, hurt: 0, hitFlash: 0, trail: [], skill: null };
    this.enemies = []; this.projectiles = []; this.chips = []; this.chipShards = []; this.slashes = []; this.particles = []; this.nextId = 1; this.lastGesture = null;
    this.pointerState = { down: false, id: null, path: [], hitIds: new Set(), lastPoint: null, readyInfo: null, readyAt: 0, locked: false, committed: false };
    this.upgrades = [
      { title: 'Blade Edge+', desc: '스킬 피해 +22%', apply: () => { this.state.upg.skillDamage *= 1.22; } },
      { title: 'Quick Draw', desc: '영웅 기본 공격속도 +18%', apply: () => { this.state.upg.heroAtk *= 1.18; } },
      { title: 'Blink Drive', desc: '영웅 이동속도 +16%', apply: () => { this.state.upg.heroMove *= 1.16; } },
      { title: 'Shadow Step', desc: '스킬 타깃 수 +1', apply: () => { this.state.upg.extraTargets += 1; } },
      { title: 'Nanite Patch', desc: '즉시 18 회복, 회복 칩 효과 +50%', apply: () => { this.state.upg.healBoost *= 1.5; this.healPlayer(18); } },
      { title: 'Critical Mark', desc: '콤보 보너스 증가', apply: () => { this.state.upg.comboBonus += 0.025; } },
      { title: 'Overdrive Core', desc: '오버드라이브 피해 +30%', apply: () => { this.state.upg.overdrive *= 1.3; } },
      { title: 'Sweep Arc', desc: '가로/십자 스킬 범위 확대', apply: () => { this.state.upg.aoe *= 1.18; } },
    ];
    this.floatLabels.forEach(({ text }) => text.destroy()); this.floatLabels = [];
  }

  private startRun() { this.resetState(); this.state.status = 'running'; for (let i = 0; i < 5; i++) this.spawnChip(true); this.beginNextBattle(); this.tones.tone(460, 0.08, 'triangle', 0.04, 140); }

  private beginNextBattle() {
    this.state.battleIndex += 1; this.state.battleClearTimer = -1; this.state.battleBanner = 1.8;
    const isBoss = this.state.battleIndex % 4 === 0; const baseCount = clamp(10 + this.state.battleIndex * 2, 10, 20); const count = isBoss ? clamp(baseCount - 2, 10, 18) : clamp(baseCount + randi(-1, 2), 10, 20);
    this.state.battleSize = count + (isBoss ? 1 : 0); this.state.battleBannerText = isBoss ? `BATTLE ${this.state.battleIndex}: WARDEN` : `BATTLE ${this.state.battleIndex}`;
    const anchors: Array<{x:number;y:number}> = []; const groups = randi(2, 3);
    for (let i = 0; i < groups; i++) anchors.push({ x: rand(260, FIELD.x + FIELD.w - 42), y: rand(FIELD.y + 50, FIELD.y + FIELD.h - 46) });
    if (isBoss) this.spawnEnemy('warden', FIELD.x + FIELD.w - 75, HERO_HOME_Y + rand(-36, 62));
    const meleeChance = clamp(0.02 + Math.max(0, this.state.battleIndex - 2) * 0.055, 0.02, 0.38); const heavyChance = clamp(Math.max(0, this.state.battleIndex - 4) * 0.05, 0, 0.16);
    for (let i = 0; i < count; i++) {
      const anchor = anchors[i % anchors.length]; let type: EnemyType = 'scout'; const r = Math.random();
      if (r < heavyChance) type = 'brute'; else if (r < heavyChance + meleeChance) type = 'raider'; else if (r > 0.58) type = 'gunner';
      this.spawnEnemy(type, clamp(anchor.x + rand(-40, 40) + i * 0.8, 220, FIELD.x + FIELD.w - 20), clamp(anchor.y + rand(-62, 62), FIELD.y + 22, FIELD.y + FIELD.h - 22));
    }
  }

  private spawnEnemy(type: EnemyType, x: number, y: number) {
    const scale = 1 + this.state.battleIndex * 0.055; const stats = ENEMY_STATS[type];
    this.enemies.push({ id: this.nextId++, type, mode: stats.mode, isRanged: stats.mode === 'ranged', x, y, vx: rand(-7, 7), vy: rand(-7, 7), hp: stats.hp * scale, maxHp: stats.hp * scale, speed: stats.speed * (1 + this.state.battleIndex * 0.006), attackRate: Math.max(stats.mode === 'ranged' ? 1.65 : 0.85, stats.cooldown - Math.max(0, this.state.battleIndex - 1) * (stats.mode === 'ranged' ? 0.10 : 0.035)), attackCd: rand(stats.mode === 'ranged' ? 1.2 : 0.45, stats.mode === 'ranged' ? 2.8 : 1.2), damage: stats.damage, range: stats.range, preferredRange: stats.mode === 'ranged' ? stats.range - 18 : stats.range, radius: stats.radius, projectileSpeed: stats.projectileSpeed || 0, projectileSize: stats.projectileSize || 4, projectileColor: stats.projectileColor || '#ffb17d', score: stats.score, xp: stats.xp, facing: -1, hurt: 0, hitFlash: 0, swing: 0, dead: false });
  }

  private getPoint(pointer: Phaser.Input.Pointer): Point { return { x: pointer.x, y: pointer.y, t: performance.now() }; }
  private heroInvulnerable() { return !!this.hero.skill; }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    this.tones.init(); const p = this.getPoint(pointer);
    if (this.state.status === 'start' || this.state.status === 'win' || this.state.status === 'lose') { this.startRun(); return; }
    if (this.state.status === 'choice') { const idx = this.cardIndexAt(p); if (idx >= 0) this.applyUpgrade(idx); return; }
    if (this.state.status !== 'running' || p.y < TOP_H) return;
    this.pointerState = { down: true, id: pointer.id, path: [p], hitIds: new Set(), lastPoint: p, readyInfo: null, readyAt: 0, locked: false, committed: false };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    const ps = this.pointerState; if (!ps.down || pointer.id !== ps.id) return; const p = this.getPoint(pointer); if (p.y < TOP_H - 12) return;
    if (ps.locked) { ps.path = [p]; ps.lastPoint = p; return; }
    const last = ps.lastPoint || p; if (dist(last.x, last.y, p.x, p.y) < 4) return;
    ps.path.push(p); ps.lastPoint = p;
    for (const c of this.chips) if (!c.sliced && !c.remove && c.y >= TOP_H + 70 && segmentCircle(last.x, last.y, p.x, p.y, c.x, c.y, c.r + 10)) {
      if (!c.marked) { c.marked = true; c.markedPulse = 1; c.hitAngle = Math.atan2(p.y - last.y, p.x - last.x); ps.hitIds.add(c.id); this.addParticle(c.x, c.y, c.kind === 'glitch' ? '#ff8aa0' : '#bdefff', 4, 60, 2.4, 0.18); this.tones.tone(c.kind === 'glitch' ? 160 : 520, 0.025, 'triangle', c.kind === 'glitch' ? 0.018 : 0.014, 40); }
    }
    this.evaluatePointerGesture(); this.commitPointerGesture(false);
  }

  private finishPointer(pointer: Phaser.Input.Pointer) {
    const ps = this.pointerState; if (!ps.down || pointer.id !== ps.id) return; this.evaluatePointerGesture(); const hadMarked = ps.hitIds.size > 0; const wasCommitted = ps.committed; const committed = this.commitPointerGesture(true);
    if (!committed && hadMarked && !wasCommitted) { this.clearPointerMarks(); this.addText('더 길게 베어!', W/2, TOP_H + 110, '#9edffb', 16); this.tones.tone(260, 0.06, 'sine', 0.025, -40); }
    this.pointerState = { down: false, id: null, path: [], hitIds: new Set(), lastPoint: null, readyInfo: null, readyAt: 0, locked: false, committed: false };
  }

  private currentMarkedChips() { return this.chips.filter(c => this.pointerState.hitIds.has(c.id) && c.marked && !c.sliced && !c.remove); }
  private clearPointerMarks() { for (const c of this.currentMarkedChips()) { c.marked = false; c.markedPulse = 0; } }
  private evaluatePointerGesture() { const ps = this.pointerState; if (!ps.down || ps.locked) { ps.readyInfo = null; ps.readyAt = 0; return null; } const info = analyzeGesture(ps.path, this.lastGesture); if (info) { ps.readyInfo = info; if (!ps.readyAt) ps.readyAt = performance.now(); return info; } ps.readyInfo = null; ps.readyAt = 0; return null; }
  private commitPointerGesture(force = false) {
    const ps = this.pointerState; if (!ps.down || ps.locked) return false; const info = ps.readyInfo || this.evaluatePointerGesture(); if (!info) return false; const readyDelay = performance.now() - (ps.readyAt || performance.now()); if (!force && readyDelay < 120) return false;
    const marked = this.currentMarkedChips(); if (marked.length > 0) { this.processGesture(info, marked); ps.hitIds.clear(); this.addText('손을 떼고 다시 베기', W/2, TOP_H + 128, '#9edffb', 13); } else { this.setSlashSense(info, ' / 코어 없음'); this.rememberGesture(info); this.tones.tone(460, 0.045, 'sine', 0.022, 80); }
    ps.readyInfo = null; ps.readyAt = 0; ps.locked = true; ps.committed = true; if (ps.lastPoint) ps.path = [ps.lastPoint]; return true;
  }
  private rememberGesture(info: GestureInfo) { this.lastGesture = { x1: info.x1, y1: info.y1, x2: info.x2, y2: info.y2, angle: info.angle, time: performance.now(), baseType: info.baseType, dirCode: info.dirCode, family: info.family }; }

  private spawnChip(initial = false) { const r = Math.random(); let kind: Chip['kind'] = 'blade'; if (r < 0.10 && !initial) kind = 'glitch'; else if (r < 0.25) kind = 'repair'; else if (r < 0.43) kind = 'surge'; this.chips.push({ id: this.nextId++, kind, x: rand(60, W-60), y: initial ? rand(TOP_H+84, H-58) : H+rand(18,46), vx: rand(-62,62), vy: initial ? rand(-80,70) : rand(-800,-620), g: rand(760,920), r: kind === 'glitch' ? rand(23,27) : rand(25,32), rot: rand(0,TAU), spin: rand(-2.6,2.6), age: 0, marked: false, markedPulse: 0, hitAngle: 0, sliceAngle: 0, sliced: false, pop: 0, remove: false }); }
  private addParticle(x:number,y:number,color:string,count=8,speed=120,size=3,life=0.55) { for (let i=0;i<count;i++){ const a=rand(0,TAU); const s=rand(speed*.25,speed); this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,color,size:rand(size*.5,size),life:rand(life*.55,life),maxLife:life,drag:.9}); } }
  private addText(text:string,x:number,y:number,color='#eaffff',size=18) { const model: FloatText = { text, x, y, vy: -42, life: .82, maxLife: .82, color, size }; const label = this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: '900', color, stroke: '#00000099', strokeThickness: 3 }).setOrigin(.5).setDepth(30); this.floatLabels.push({ model, text: label }); }
  private setSlashSense(info: GestureInfo, suffix = '') { const text = slashLabel(info) + suffix; this.state.slashSenseText = text; this.state.slashSenseTime = 1.15; this.addText(text, W/2, TOP_H+102, suffix ? '#9edffb' : '#dffcff', suffix ? 14 : 16); }
  private healPlayer(amount:number) { const prev = this.state.hp; this.state.hp = clamp(this.state.hp + amount, 0, this.state.maxHp); if (this.state.hp > prev) this.addText('+' + Math.round(this.state.hp-prev), 92, 80, '#79ffbd', 18); }
  private damagePlayer(amount:number) { if (this.heroInvulnerable()) return; let remaining = amount; if (this.state.shield > 0) { const blocked = Math.min(this.state.shield, remaining); this.state.shield -= blocked; remaining -= blocked; if (blocked > 0) this.addText('SHIELD', 138, 98, '#92f6ff', 15); } if (remaining <= 0) return; this.state.hp -= remaining; this.state.flash = Math.max(this.state.flash, .24); this.state.shake = Math.max(this.state.shake, .28); this.addText('-' + Math.round(remaining), 92, 98, '#ff6e7f', 20); this.tones.tone(92,.15,'sawtooth',.06,-22); if (this.state.hp <= 0) { this.state.hp = 0; this.state.status = 'lose'; this.state.resultLine = '방어 코어 붕괴: 원거리 탄막에 전선이 무너졌습니다.'; } }
  private addXP(amount:number) { this.state.xp += amount; if (this.state.status === 'running' && this.state.xp >= this.state.xpNeed) { this.state.xp -= this.state.xpNeed; this.state.level += 1; this.state.xpNeed = Math.round(this.state.xpNeed * 1.32 + 4); this.enterChoice(); } }
  private enterChoice() { this.state.status = 'choice'; this.state.choiceOptions = this.pickUpgrades(); this.state.shield = Math.min(this.state.shield + 8, 32); this.addText('UPGRADE READY', W/2, TOP_H-24, '#fff1a6', 20); this.tones.tone(580,.09,'sine',.055,120); this.time.delayedCall(70, () => this.tones.tone(840,.14,'sine',.045,160)); }
  private pickUpgrades() { const pool = this.upgrades.slice(); const out: Upgrade[] = []; while(out.length < 3 && pool.length){ const idx = Math.floor(Math.random()*pool.length); out.push(pool.splice(idx,1)[0]); } return out; }
  private applyUpgrade(index:number) { const opt = this.state.choiceOptions[index]; if (!opt) return; opt.apply(); this.state.status='running'; this.addText(opt.title, W/2, TOP_H-24, '#b9fffb', 18); this.tones.tone(620,.08,'triangle',.055,160); }
  private cardIndexAt(p: Point) { for (let i=0;i<3;i++){ const x=36, y=TOP_H+76+i*96; if (p.x>=x && p.x<=x+W-72 && p.y>=y && p.y<=y+82) return i; } return -1; }

  private projectGestureToField(info: GestureInfo) { const nx = clamp(info.mx / W, 0, 1); const ny = clamp((info.my - TOP_H) / BOT_H, 0, 1); return { x: lerp(FIELD.x+48, FIELD.x+FIELD.w-48, nx), y: lerp(FIELD.y+32, FIELD.y+FIELD.h-32, ny) }; }
  private closestEnemy(point:{x:number;y:number}, filter?: (e:Enemy)=>boolean) { let best: Enemy | null = null; let bestD = Infinity; for (const e of this.enemies) if (!e.dead && (!filter || filter(e))) { const d=dist(point.x,point.y,e.x,e.y); if (d<bestD){bestD=d; best=e;} } return best; }
  private createSlash(x:number,y:number,angle:number,len:number,color:string,dur=.25,width=7){ this.slashes.push({x,y,angle,len,color,dur,t:0,width}); }
  private makeHeroSkill(type: GestureInfo['type'], points: HeroSkillPoint[], overdrive:boolean){ if(!points.length) return null; const startX=this.hero.x,startY=this.hero.y,last=points[points.length-1]; const dx=last.x-startX, dy=last.y-startY, d=Math.hypot(dx,dy)||1; const follow= type==='cross'?14:type==='vertical'?18:24; points.push({x:clamp(last.x+dx/d*follow,FIELD.x+14,FIELD.x+FIELD.w-18),y:clamp(last.y+dy/d*follow*.72,FIELD.y+18,FIELD.y+FIELD.h-18),damage:0,settle:true,angle:0,target:null}); return {type,seg:0,segT:0,startX,startY,overdrive,points}; }
  private triggerDirective(info: GestureInfo, goodCount:number, mult:number, overdrive:boolean) {
    const focus=this.projectGestureToField(info); const profile=info.profile || lengthProfile(info); const totalMult=mult*this.state.upg.skillDamage*profile.damageMult*(overdrive?this.state.upg.overdrive:1); const extra=this.state.upg.extraTargets; const aoe=this.state.upg.aoe*profile.rangeMult; const targetBonus=profile.targetBonus;
    this.tones.tone(info.type==='vertical'?420:info.type==='horizontal'?520:info.type==='cross'?680:info.type==='xslash'?760:570,.08,'triangle',.055,180); this.tones.tone(info.type==='cross'||info.type==='xslash'?270:220,.12,'sawtooth',.025,-60); if(!this.enemies.some(e=>!e.dead)) return;
    if(info.type==='horizontal'){ const band=42*aoe; const maxTargets=clamp(3+extra+targetBonus,1,7); const targets=this.enemies.filter(e=>!e.dead && Math.abs(e.y-focus.y)<=band).sort((a,b)=>Math.abs(a.x-focus.x)-Math.abs(b.x-focus.x)).slice(0,maxTargets); if(!targets.length){ const fb=this.closestEnemy(focus); if(fb) targets.push(fb); } const side=info.dirCode==='h_rl'?16:-16; const angle=info.dirCode==='h_rl'?Math.PI:0; this.hero.skill=this.makeHeroSkill('horizontal', targets.map(t=>({x:t.x+side,y:t.y,target:t,damage:(28+goodCount*3.5)*totalMult,angle,slashLen:58*profile.slashLenMult})), overdrive); }
    else if(info.type==='vertical'){ const target=this.enemies.filter(e=>!e.dead).sort((a,b)=>(b.hp*1.2-dist(b.x,b.y,focus.x,focus.y)*.2)-(a.hp*1.2-dist(a.x,a.y,focus.x,focus.y)*.2))[0]; if(target){ const upward=info.dirCode==='v_up'; const hits=clamp(1+extra+(upward?1:0)+Math.max(0,targetBonus),1,5); const power=upward?.88:1.14; const points: HeroSkillPoint[]=[]; for(let i=0;i<hits;i++) points.push({x:target.x-10+(i%2?12:-4),y:target.y+(i%2?-6:6),target,damage:(52+goodCount*5)*totalMult*power/hits,angle:upward?-Math.PI/2:Math.PI/2,slashLen:74*profile.slashLenMult}); this.hero.skill=this.makeHeroSkill('vertical', points, overdrive); } }
    else if(info.type==='diagonal'){ const unused=this.enemies.filter(e=>!e.dead).slice(); const points: HeroSkillPoint[]=[]; let cursor={x:focus.x,y:focus.y}; const count=clamp(3+extra+targetBonus,1,7); for(let i=0;i<count&&unused.length;i++){ unused.sort((a,b)=>dist(cursor.x,cursor.y,a.x,a.y)-dist(cursor.x,cursor.y,b.x,b.y)); const target=unused.shift()!; points.push({x:target.x-15,y:target.y,target,damage:(35+goodCount*4.2)*totalMult,angle:info.angle,slashLen:62*profile.slashLenMult}); cursor={x:target.x,y:target.y}; } this.hero.skill=this.makeHeroSkill('diagonal', points, overdrive); }
    else if(info.type==='cross'){ this.hero.skill=this.makeHeroSkill('cross', [{x:focus.x,y:focus.y,target:null,damage:(58+goodCount*5.5)*totalMult,angle:0,radius:110*aoe,slashLen:84*profile.slashLenMult}], overdrive); }
    else if(info.type==='xslash'){ const target=this.enemies.filter(e=>!e.dead).sort((a,b)=>((b.isRanged?70:0)+b.hp*1.1-dist(b.x,b.y,focus.x,focus.y)*.25)-((a.isRanged?70:0)+a.hp*1.1-dist(a.x,a.y,focus.x,focus.y)*.25))[0]; if(target) this.hero.skill=this.makeHeroSkill('xslash', [{x:target.x-12,y:target.y,target,damage:(74+goodCount*7)*totalMult,angle:info.angle,slashLen:86*profile.slashLenMult}], overdrive); }
  }
  private dealEnemyDamage(enemy: Enemy | null, amount:number, color?:string){ if(!enemy || enemy.dead) return; enemy.hp-=amount; enemy.hurt=.12; enemy.hitFlash=.16; this.addParticle(enemy.x,enemy.y-10,color||'#eaffff',8,95,3,.35); this.addText(String(Math.round(amount)),enemy.x,enemy.y-28,'#faffff',14); this.tones.tone(150,.05,'square',.032,-40); if(enemy.hp<=0){ enemy.dead=true; this.spawnEnemyDeathSprite(enemy); this.state.kills++; this.state.score+=Math.round(enemy.score*(1+this.state.combo*.01)); this.state.overdrive=clamp(this.state.overdrive+(enemy.type==='warden'?30:6),0,110); this.addXP(enemy.xp||.6); this.addParticle(enemy.x,enemy.y-4,enemy.type==='warden'?'#ffd17c':'#ff9f71',18,180,4,.6); if(enemy.type==='warden') this.addText('WARDEN DOWN',enemy.x,enemy.y-40,'#ffd17c',18); } }

  private heroAutoAttack(dt:number){ if(this.hero.skill) return; this.hero.hitFlash=Math.max(0,this.hero.hitFlash-dt); this.hero.hurt=Math.max(0,this.hero.hurt-dt); this.hero.attackCd-=dt*this.state.upg.heroAtk; this.hero.swing=Math.max(0,this.hero.swing-dt); const alive=this.enemies.filter(e=>!e.dead); if(!alive.length){ this.hero.x=lerp(this.hero.x,this.hero.homeX,dt*4.5); this.hero.y=lerp(this.hero.y,this.hero.homeY,dt*4.5); return; } const target=alive.sort((a,b)=>dist(this.hero.x,this.hero.y,a.x,a.y)-dist(this.hero.x,this.hero.y,b.x,b.y))[0]; const dx=target.x-this.hero.x, dy=target.y-this.hero.y, d=Math.hypot(dx,dy)||1; this.hero.facing=dx>=0?1:-1; if(d>36){ const move=130*this.state.upg.heroMove; this.hero.x+=dx/d*move*dt; this.hero.y+=dy/d*move*dt; } else if(this.hero.attackCd<=0){ this.hero.attackCd=.54; this.hero.swing=.22; this.createSlash(this.hero.x+this.hero.facing*20,this.hero.y-6,this.hero.facing>0?-.45:Math.PI+.45,58,'#dffcff',.22,7); this.dealEnemyDamage(target,14,'#dffcff'); } this.hero.x=clamp(this.hero.x,FIELD.x+10,FIELD.x+FIELD.w-18); this.hero.y=clamp(this.hero.y,FIELD.y+18,FIELD.y+FIELD.h-18); }
  private updateHeroSkill(dt:number){ const skill=this.hero.skill; if(!skill) return; const fromX=skill.seg===0?skill.startX:skill.points[skill.seg-1].x; const fromY=skill.seg===0?skill.startY:skill.points[skill.seg-1].y; const to=skill.points[skill.seg]; const segDur=to.settle?.12:.10; skill.segT+=dt; const p=easeOutCubic(skill.segT/segDur); this.hero.x=lerp(fromX,to.x,p); this.hero.y=lerp(fromY,to.y,p); this.hero.facing=(to.x-fromX)>=0?1:-1; this.hero.trail.push({x:this.hero.x,y:this.hero.y,life:.18}); if(this.hero.trail.length>6) this.hero.trail.shift(); if(skill.segT>=segDur){ if(!to.settle && !to.resolved){ to.resolved=true; if(skill.type==='cross'){ const radius=to.radius||110; for(const e of this.enemies) if(!e.dead && dist(e.x,e.y,to.x,to.y)<radius+e.radius) this.dealEnemyDamage(e,to.damage,skill.overdrive?'#fff2a8':'#dffcff'); const len=to.slashLen||84*this.state.upg.aoe; this.createSlash(to.x,to.y,.68,len,skill.overdrive?'#fff2a8':'#dffcff',.28,8); this.createSlash(to.x,to.y,-.68,len,skill.overdrive?'#fff2a8':'#dffcff',.28,8); } else if(skill.type==='xslash'){ this.dealEnemyDamage(to.target,to.damage,skill.overdrive?'#fff2a8':'#e7d7ff'); const len=to.slashLen||86; this.createSlash(to.x+4,to.y-8,.72,len,skill.overdrive?'#fff2a8':'#e7d7ff',.30,8); this.createSlash(to.x+4,to.y-8,-.72,len,skill.overdrive?'#fff2a8':'#e7d7ff',.30,8); this.addParticle(to.x,to.y-6,skill.overdrive?'#fff2a8':'#d8c7ff',18,170,4,.42); } else { this.dealEnemyDamage(to.target,to.damage,skill.overdrive?'#fff2a8':'#dffcff'); this.createSlash(to.x+8,to.y-8,to.angle,to.slashLen||(skill.type==='vertical'?74:58),skill.overdrive?'#fff2a8':'#dffcff',.24,7); } } skill.seg++; skill.segT=0; if(skill.seg>=skill.points.length){ this.hero.skill=null; this.hero.x=clamp(this.hero.x,FIELD.x+10,FIELD.x+FIELD.w-18); this.hero.y=clamp(this.hero.y,FIELD.y+18,FIELD.y+FIELD.h-18); } } }
  private updateEnemies(dt:number){ const alive=this.enemies.filter(e=>!e.dead); for(const e of alive){ e.hurt=Math.max(0,e.hurt-dt); e.hitFlash=Math.max(0,e.hitFlash-dt); e.attackCd-=dt; e.swing=Math.max(0,e.swing-dt); const tx=this.hero.skill?this.hero.x:this.hero.x-18, ty=this.hero.skill?this.hero.y:this.hero.y; const dx=tx-e.x,dy=ty-e.y,d=Math.hypot(dx,dy)||1; e.facing=dx>=0?1:-1; let sepX=0,sepY=0; for(const other of alive){ if(other===e) continue; const dd=dist(e.x,e.y,other.x,other.y), min=e.radius+other.radius+5; if(dd>0&&dd<min){ sepX+=(e.x-other.x)/dd*(min-dd)*1.5; sepY+=(e.y-other.y)/dd*(min-dd)*1.5; } } const orbitY=Math.sin((e.id*12+this.state.time*1.8))*10; if(e.isRanged){ const desired=e.preferredRange; let desiredX=sepX*1.2, desiredY=sepY*1.2+orbitY*.55; if(d>desired+18){ desiredX+=dx/d*e.speed; desiredY+=dy/d*e.speed; } else if(d<desired-18){ desiredX-=dx/d*e.speed*.95; desiredY-=dy/d*e.speed*.95; } else { desiredX+=-dy/d*e.speed*.55; desiredY+=dx/d*e.speed*.55; } e.vx=lerp(e.vx,desiredX,dt*5.5); e.vy=lerp(e.vy,desiredY,dt*5.5); e.x+=e.vx*dt; e.y+=e.vy*dt; if(d<=e.range&&e.attackCd<=0){ e.attackCd=e.attackRate+rand(.25,.85); e.swing=.12; if(!this.heroInvulnerable()&&this.projectiles.length<10){ this.fireProjectile(e,tx,ty); this.tones.tone(210,.04,'square',.018,30); } else e.attackCd=Math.max(e.attackCd,.8); } } else { if(d>e.range+4){ e.vx=lerp(e.vx,dx/d*e.speed+sepX*1.6,dt*5.5); e.vy=lerp(e.vy,dy/d*e.speed+sepY*1.6+orbitY*.16,dt*5.5); e.x+=e.vx*dt; e.y+=e.vy*dt; } else { e.vx=lerp(e.vx,sepX*1.25,dt*5.5); e.vy=lerp(e.vy,sepY*1.25+orbitY*.18,dt*5.5); e.x+=e.vx*dt; e.y+=e.vy*dt; if(e.attackCd<=0){ e.attackCd=e.attackRate; e.swing=.18; if(!this.heroInvulnerable()){ this.createSlash(e.x+e.facing*14,e.y-6,e.facing>0?-.45:Math.PI+.45,e.type==='warden'?42:34,'#ffb17d',.18,5); this.damagePlayer(e.damage); } else { this.addParticle(e.x+e.facing*10,e.y-4,'#d8fbff',4,55,2.4,.18); e.attackCd*=.45; } } } } e.x=clamp(e.x,FIELD.x+4,FIELD.x+FIELD.w-4); e.y=clamp(e.y,FIELD.y+14,FIELD.y+FIELD.h-14); } this.enemies=this.enemies.filter(e=>!e.dead); this.state.battleAlive=this.enemies.length; if(this.state.status==='running'&&this.state.battleAlive===0&&this.state.battleClearTimer<0){ this.state.battleClearTimer=1; this.addText('CLEAR',W/2,146,'#96ffd1',26); this.tones.tone(690,.11,'triangle',.048,160); } }
  private fireProjectile(enemy: Enemy, tx:number, ty:number){ const dx=tx-enemy.x,dy=ty-enemy.y,d=Math.hypot(dx,dy)||1; this.projectiles.push({x:enemy.x+dx/d*12,y:enemy.y+dy/d*12,vx:dx/d*enemy.projectileSpeed,vy:dy/d*enemy.projectileSpeed,life:2.2,damage:enemy.damage,radius:enemy.projectileSize,color:enemy.projectileColor,trail:0}); }
  private updateProjectiles(dt:number){ for(const p of this.projectiles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; p.trail+=dt; if(p.trail>.035){ p.trail=0; this.particles.push({x:p.x,y:p.y,vx:0,vy:0,color:p.color,size:p.radius*.72,life:.18,maxLife:.18,drag:1}); } const hd=dist(p.x,p.y,this.hero.x,this.hero.y); if(this.heroInvulnerable()){ if(hd<18){ p.life=-1; this.addParticle(p.x,p.y,'#e7fdff',6,70,2.8,.22); } } else if(hd<p.radius+12){ this.damagePlayer(p.damage); this.addParticle(p.x,p.y,'#ffd5a8',8,90,2.8,.25); p.life=-1; } if(p.x<FIELD.x-30||p.x>FIELD.x+FIELD.w+30||p.y<FIELD.y-30||p.y>FIELD.y+FIELD.h+30) p.life=-1; } this.projectiles=this.projectiles.filter(p=>p.life>0); }
  private processGesture(info: GestureInfo, hitChips: Chip[]){ const good: Chip[]=[]; const bad: Chip[]=[]; for(const c of hitChips){ c.marked=false; c.sliced=true; c.sliceAngle=Number.isFinite(c.hitAngle)?c.hitAngle:info.angle; c.pop=0; this.spawnChipShards(c); this.addParticle(c.x,c.y,c.kind==='glitch'?'#ff436a':'#dffcff',c.kind==='glitch'?16:12,150,3.8,.36); this.tones.tone(c.kind==='glitch'?120:760,.045,'triangle',c.kind==='glitch'?.045:.028,c.kind==='glitch'?-20:120); (c.kind==='glitch'?bad:good).push(c); } for(const c of bad){ this.damagePlayer(12); this.addParticle(c.x,c.y,'#ff406a',20,190,5,.6); this.addText('GLITCH',c.x,c.y-24,'#ff5b7a',17); this.state.combo=0; this.state.comboTimer=0; } this.setSlashSense(info,''); if(good.length>0){ let mult=1+Math.min(.65,this.state.combo*(.022+this.state.upg.comboBonus))+Math.min(.25,(good.length-1)*.08); const repairCount=good.filter(c=>c.kind==='repair').length; const surgeCount=good.filter(c=>c.kind==='surge').length; if(repairCount) this.healPlayer(repairCount*5*this.state.upg.healBoost); if(surgeCount){ this.state.overdrive=clamp(this.state.overdrive+surgeCount*18,0,120); this.addText('SURGE',info.mx,info.my-24,'#f3d46b',16); } this.state.overdrive=clamp(this.state.overdrive+good.length*3,0,120); let overdrive=false; if(this.state.overdrive>=100){ this.state.overdrive-=100; mult*=1.75; overdrive=true; this.state.flash=Math.max(this.state.flash,.2); this.addText('OVERDRIVE',W/2,TOP_H+22,'#fff2a8',22); } this.state.combo+=good.length; this.state.maxCombo=Math.max(this.state.maxCombo,this.state.combo); this.state.comboTimer=3; this.state.score+=Math.round(16*good.length*(1+this.state.combo*.05)); this.addXP(.28*good.length); this.triggerDirective(info,good.length,mult,overdrive); } this.rememberGesture(info); }

  private updateRun(dt:number){ this.state.time+=dt; if(this.state.comboTimer>0){ this.state.comboTimer-=dt; if(this.state.comboTimer<=0) this.state.combo=0; } this.state.battleBanner=Math.max(0,this.state.battleBanner-dt); this.state.chipSpawn-=dt; const chipInterval=clamp(.64-this.state.time*.002,.34,.64); if(this.state.chipSpawn<=0){ this.spawnChip(false); this.state.chipSpawn=chipInterval; } for(const c of this.chips){ c.age+=dt; if(!c.sliced){ c.x+=c.vx*dt; c.y+=c.vy*dt; c.vy+=c.g*dt; c.rot+=c.spin*dt; if(c.x<42||c.x>W-42) c.vx*=-.88; c.x=clamp(c.x,42,W-42); } else c.pop+=dt*6; if(c.markedPulse>0) c.markedPulse=Math.max(0,c.markedPulse-dt*4.5); if(c.y>H+60||c.pop>1) c.remove=true; } this.chips=this.chips.filter(c=>!c.remove); if(this.pointerState.down){ this.evaluatePointerGesture(); this.commitPointerGesture(false); } this.updateHeroSkill(dt); this.heroAutoAttack(dt); for(const t of this.hero.trail) t.life-=dt; this.hero.trail=this.hero.trail.filter(t=>t.life>0); this.updateEnemies(dt); this.updateProjectiles(dt); if(this.state.battleClearTimer>=0){ this.state.battleClearTimer-=dt; if(this.state.battleClearTimer<=0&&this.state.status==='running') this.beginNextBattle(); } if(this.state.time>=this.state.runTime&&this.state.status==='running'){ this.state.status='win'; this.state.resultLine=`전투 ${this.state.battleIndex}개 구역을 돌파하고 ${this.state.kills}명을 처치했습니다.`; this.tones.tone(640,.12,'triangle',.06,180); } }
  private updateEffects(dt:number){ for(const shard of this.chipShards){ shard.age+=dt; shard.life-=dt; shard.x+=shard.vx*dt; shard.y+=shard.vy*dt; shard.vy+=shard.g*dt; shard.rot+=shard.spin*dt; shard.vx*=Math.pow(.985,dt*60); } this.chipShards=this.chipShards.filter(shard=>shard.life>0); for(const s of this.slashes) s.t+=dt; this.slashes=this.slashes.filter(s=>s.t<s.dur); for(const p of this.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=Math.pow(p.drag,dt*60); p.vy*=Math.pow(p.drag,dt*60); p.life-=dt; } this.particles=this.particles.filter(p=>p.life>0); for(const death of this.deathSprites){ death.life-=dt; const a=clamp(death.life/death.maxLife,0,1); death.sprite.setAlpha(a*.72).setY(death.sprite.y-dt*10).setScale(death.sprite.scaleX*.985, death.sprite.scaleY*.985); } this.deathSprites=this.deathSprites.filter(death=>{ if(death.life>0) return true; death.sprite.destroy(); return false; }); for(const item of this.floatLabels){ const f=item.model; f.y+=f.vy*dt; f.life-=dt; item.text.setPosition(f.x,f.y).setAlpha(clamp(f.life/f.maxLife,0,1)); } this.floatLabels=this.floatLabels.filter(item=>{ if(item.model.life>0) return true; item.text.destroy(); return false; }); this.state.slashSenseTime=Math.max(0,this.state.slashSenseTime-dt); this.state.shake=Math.max(0,this.state.shake-dt*1.7); this.state.flash=Math.max(0,this.state.flash-dt*1.9); }

  private renderFrame(){ const g=this.g, fx=this.fx; g.clear(); fx.clear(); this.drawTop(g); this.drawBottom(g); this.syncCharacterSprites(); this.drawCharacterForeground(fx); this.drawParticles(fx); this.drawOverlay(g); this.updateHudTexts(); }

  private syncCharacterSprites() {
    const visible = this.state.status === 'running';
    this.syncHeroSprite(visible);
    this.syncHeroAfterimages(visible);
    this.syncEnemySprites(visible);
  }

  private syncHeroSprite(visible: boolean) {
    if (!this.heroSprite) {
      this.heroSprite = this.add.sprite(this.hero.x, this.hero.y, heroAnimationTextureKey('idle'), 0).setOrigin(0.5, 0.78).setDepth(3.2);
      this.heroSprite.setScale(CHARACTER_SPRITE_SPECS.hero.scale);
    }
    this.heroSprite.setVisible(visible);
    if (!visible) return;
    const state = this.hero.hitFlash > 0 ? 'hit' : (this.hero.skill || this.hero.swing > 0 ? 'slash' : this.heroMoving() ? 'run' : 'idle');
    this.playCharacterAnimation(this.heroSprite, 'hero', state);
    this.heroSprite
      .setPosition(this.hero.x, this.hero.y)
      .setFlipX(this.hero.facing < 0)
      .setDepth(3 + this.hero.y / 1000)
      .setAlpha(1)
      .setTint(this.hero.hitFlash > 0 ? 0xffffff : 0xffffff);
  }

  private heroMoving() {
    if (this.hero.skill) return true;
    return dist(this.hero.x, this.hero.y, this.hero.homeX, this.hero.homeY) > 8 || this.enemies.some(e => !e.dead);
  }

  private syncHeroAfterimages(visible: boolean) {
    while (this.heroTrailSprites.length < this.hero.trail.length) {
      this.heroTrailSprites.push(this.add.image(0, 0, characterTextureKey('hero'), 0).setOrigin(0.5, 0.78).setDepth(2.8).setScale(CHARACTER_SPRITE_SPECS.hero.scale).setTint(0x9ff6ff));
    }
    while (this.heroTrailSprites.length > this.hero.trail.length) this.heroTrailSprites.pop()?.destroy();
    const heroTexture = this.heroSprite?.texture.key ?? characterTextureKey('hero');
    const heroFrame = this.heroSprite?.frame.name ?? 0;
    for (let i = 0; i < this.heroTrailSprites.length; i++) {
      const trail = this.hero.trail[i];
      const sprite = this.heroTrailSprites[i];
      sprite.setVisible(visible && !!trail);
      if (!visible || !trail) continue;
      sprite
        .setTexture(heroTexture, heroFrame)
        .setPosition(trail.x, trail.y)
        .setFlipX(this.hero.facing < 0)
        .setAlpha(clamp(trail.life / .18, 0, 1) * .35)
        .setDepth(2.6 + trail.y / 1000);
    }
  }

  private syncEnemySprites(visible: boolean) {
    const aliveIds = new Set<number>();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      aliveIds.add(enemy.id);
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        sprite = this.add.sprite(enemy.x, enemy.y, characterTextureKey(enemy.type), 0).setOrigin(0.5, 0.78).setDepth(3);
        sprite.setScale(CHARACTER_SPRITE_SPECS[enemy.type].scale);
        this.enemySprites.set(enemy.id, sprite);
      }
      sprite.setVisible(visible);
      if (!visible) continue;
      const moving = Math.hypot(enemy.vx, enemy.vy) > 2;
      const state = enemy.hitFlash > 0 ? 'hit' : enemy.swing > 0 ? 'attack' : moving ? 'move' : 'idle';
      this.playCharacterAnimation(sprite, enemy.type, state);
      sprite
        .setPosition(enemy.x, enemy.y)
        .setFlipX(enemy.facing < 0)
        .setDepth(3 + enemy.y / 1000)
        .setTint(enemy.hitFlash > 0 ? 0xffffff : 0xffffff)
        .setAlpha(1);
    }
    for (const [id, sprite] of this.enemySprites) {
      if (aliveIds.has(id)) continue;
      sprite.destroy();
      this.enemySprites.delete(id);
    }
  }

  private playCharacterAnimation(sprite: Phaser.GameObjects.Sprite, kind: 'hero', state: 'idle' | 'run' | 'slash' | 'hit'): void;
  private playCharacterAnimation(sprite: Phaser.GameObjects.Sprite, kind: EnemyType, state: 'idle' | 'move' | 'attack' | 'hit' | 'death'): void;
  private playCharacterAnimation(sprite: Phaser.GameObjects.Sprite, kind: 'hero' | EnemyType, state: string) {
    const key = characterAnimationKey(kind, state as 'idle' | 'run' | 'slash' | 'move' | 'attack' | 'hit' | 'death');
    if (sprite.anims.currentAnim?.key !== key) sprite.play(key, true);
  }

  private spawnEnemyDeathSprite(enemy: Enemy) {
    const livingSprite = this.enemySprites.get(enemy.id);
    const sprite = this.add.sprite(enemy.x, enemy.y, characterTextureKey(enemy.type), 12)
      .setOrigin(0.5, 0.78)
      .setDepth(2.9 + enemy.y / 1000)
      .setScale(CHARACTER_SPRITE_SPECS[enemy.type].scale)
      .setFlipX(enemy.facing < 0)
      .setTint(enemy.type === 'warden' ? 0xffd17c : 0xffb17d);
    sprite.play(characterAnimationKey(enemy.type, 'death'));
    if (livingSprite) {
      livingSprite.destroy();
      this.enemySprites.delete(enemy.id);
    }
    this.deathSprites.push({ sprite, life: .42, maxLife: .42 });
  }

  private destroyCharacterSprites() {
    this.heroSprite?.destroy();
    this.heroSprite = null;
    this.heroTrailSprites.forEach(sprite => sprite.destroy());
    this.heroTrailSprites = [];
    this.enemySprites.forEach(sprite => sprite.destroy());
    this.enemySprites.clear();
    this.deathSprites.forEach(({ sprite }) => sprite.destroy());
    this.deathSprites = [];
  }
  private drawTop(g: Phaser.GameObjects.Graphics){
    g.fillGradientStyle(0x202838, 0x202838, 0x0d121b, 0x0d121b, 1, 1, 1, 1).fillRect(0,0,W,TOP_H);
    g.fillStyle(0x5fe2ff, .05).fillTriangle(0, 0, W, 0, W * .56, TOP_H);
    this.drawField(g);
    this.drawCore(g);
    this.drawProjectiles(g);
    if(this.state.battleBanner>0){
      const a=Math.min(1,this.state.battleBanner*1.25);
      g.fillStyle(0x06111c,.68*a).fillRoundedRect(W/2-144,88,288,54,18);
      g.lineStyle(2,0xfff3a8,.72*a).strokeRoundedRect(W/2-144,88,288,54,18);
      g.lineStyle(1,0x7ff0ff,.38*a).strokeRoundedRect(W/2-136,96,272,38,13);
    }
    g.lineStyle(3,0x8ef2ff,.36).lineBetween(0,TOP_H-.5,W,TOP_H-.5);
    if(this.state.flash>0) g.fillStyle(0xfff4d6,this.state.flash*.35).fillRect(0,0,W,H);
  }

  private drawField(g: Phaser.GameObjects.Graphics){ g.fillStyle(0x151b24).fillRoundedRect(FIELD.x,FIELD.y,FIELD.w,FIELD.h,22); g.fillStyle(0xffffff,.025); for(let i=0;i<150;i++) g.fillRect(FIELD.x+(i*73)%FIELD.w, FIELD.y+((i*47)%FIELD.h),4,4); g.lineStyle(1,0x6e8caa,.08); for(let x=FIELD.x+18;x<FIELD.x+FIELD.w;x+=34) g.lineBetween(x,FIELD.y+10,x+Math.sin(x)*8,FIELD.y+FIELD.h-10); for(let i=0;i<9;i++){ const x=FIELD.x+62+i*54+(i%2?12:-10), y=FIELD.y+54+(i%4)*92; g.fillStyle(0xffffff,.035).fillCircle(x,y,16+(i%2)*5); g.fillStyle(0x000000,.16).fillCircle(x+6,y+4,9+(i%2)*3); } }
  private drawCore(g: Phaser.GameObjects.Graphics){ g.fillStyle(0x2b3947).fillRoundedRect(CORE_X-22,HERO_HOME_Y-34,34,68,8); g.fillStyle(0x5fe2ff).fillRect(CORE_X-14,HERO_HOME_Y-22,10,44); g.fillStyle(0x5fe2ff,.25).fillCircle(CORE_X-9,HERO_HOME_Y,20); }
  private drawCharacterForeground(g: Phaser.GameObjects.Graphics){ this.drawSlashes(g); this.drawEnemyBars(g); this.drawHudBars(g); }
  private drawEnemyBars(g: Phaser.GameObjects.Graphics){ for(const e of this.enemies.slice().sort((a,b)=>a.y-b.y)){ if(e.hp<e.maxHp) this.drawMiniBar(g,e.x,e.y-(e.type==='warden'?34:26),e.type==='warden'?42:28,e.hp/e.maxHp,0xff7a6b); } }
  private drawMiniBar(g:Phaser.GameObjects.Graphics,x:number,y:number,w:number,ratio:number,color:number){ g.fillStyle(0x000000,.45).fillRect(Math.round(x-w/2),Math.round(y),w,4); g.fillStyle(color).fillRect(Math.round(x-w/2),Math.round(y),w*clamp(ratio,0,1),4); }
  private drawProjectiles(g:Phaser.GameObjects.Graphics){ for(const p of this.projectiles){ g.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color, clamp(p.life/.35,.35,1)).fillCircle(p.x,p.y,p.radius); g.lineStyle(1.2,0xffffff,.45).lineBetween(p.x-p.vx*.02,p.y-p.vy*.02,p.x+p.vx*.005,p.y+p.vy*.005); } }
  private drawSlashes(g:Phaser.GameObjects.Graphics){
    for(const s of this.slashes){
      const a=1-s.t/s.dur;
      const color=Phaser.Display.Color.HexStringToColor(s.color).color;
      const x1=s.x-Math.cos(s.angle)*s.len*.5, y1=s.y-Math.sin(s.angle)*s.len*.5;
      const x2=s.x+Math.cos(s.angle)*s.len*.5, y2=s.y+Math.sin(s.angle)*s.len*.5;
      g.lineStyle(s.width+14*a,color,.10*a).lineBetween(x1,y1,x2,y2);
      g.lineStyle(s.width+5*a,color,.70*a).lineBetween(x1,y1,x2,y2);
      g.lineStyle(Math.max(2,s.width*.30),0xffffff,.88*a).lineBetween(lerp(s.x,x1,.78),lerp(s.y,y1,.78),lerp(s.x,x2,.78),lerp(s.y,y2,.78));
      const tipX = lerp(s.x, x2, .92), tipY = lerp(s.y, y2, .92);
      g.fillStyle(0xffffff,.65*a).fillCircle(tipX,tipY,2.2+3*a);
    }
  }

  private drawHudBars(g:Phaser.GameObjects.Graphics){
    this.drawBar(g,18,18,178,19,this.state.hp/this.state.maxHp,0xff4f68,0x4f0f1d);
    if(this.state.shield>0) this.drawBar(g,18,42,178,8,this.state.shield/32,0x81edff,0x08313b);
    this.drawBar(g,18,54,178,11,this.state.xp/this.state.xpNeed,0x8affc1,0x0b3321);
    this.drawBar(g,W-190,18,172,18,this.state.overdrive/100,0xf4d767,0x463a0a);
  }
  private drawBar(g:Phaser.GameObjects.Graphics,x:number,y:number,w:number,h:number,ratio:number,color:number,bg=0x080b10){
    g.fillStyle(0x000000,.42).fillRoundedRect(x-3,y-3,w+6,h+6,8);
    g.lineStyle(1.5,0xe6faff,.28).strokeRoundedRect(x-3,y-3,w+6,h+6,8);
    g.fillStyle(bg,.92).fillRoundedRect(x,y,w,h,6);
    const fillW=Math.max(0,w*clamp(ratio,0,1));
    if(fillW>0){
      g.fillStyle(color,.98).fillRoundedRect(x,y,fillW,h,6);
      g.fillStyle(0xffffff,.22).fillRoundedRect(x+2,y+2,Math.max(0,fillW-4),Math.max(1,h*.32),5);
      g.lineStyle(2,color,.34).strokeRoundedRect(x-1,y-1,fillW+2,h+2,7);
    }
  }

  private drawBottom(g:Phaser.GameObjects.Graphics){
    g.fillGradientStyle(0x121d31,0x121d31,0x05070d,0x05070d,1,1,1,1).fillRect(0,TOP_H,W,BOT_H);
    g.fillStyle(0x68eaff,.035).fillRect(0,TOP_H,W,BOT_H);
    g.lineStyle(1,0x6fe2ff,.16);
    for(let x=0;x<=W;x+=44) g.lineBetween(x,TOP_H,x,H);
    for(let y=TOP_H;y<=H;y+=38) g.lineBetween(0,y,W,y);
    g.lineStyle(1,0xffffff,.045);
    for(let y=TOP_H+5+(this.state.time*28%38);y<=H;y+=38) g.lineBetween(0,y,W,y);
    g.fillStyle(0x07101d,.78).fillRoundedRect(10,TOP_H+8,W-20,64,16);
    g.lineStyle(1.5,0x6fe2ff,.32).strokeRoundedRect(10,TOP_H+8,W-20,64,16);
    g.fillStyle(0x78eaff,.08 + Math.sin(this.state.time*3)*.025).fillRoundedRect(16,TOP_H+76,W-32,BOT_H-88,24);
    g.lineStyle(2,0x78eaff,.16).strokeRoundedRect(16,TOP_H+76,W-32,BOT_H-88,24);
    for(const c of this.chips) this.drawChip(g,c);
    for(const shard of this.chipShards) this.drawChipShard(g, shard);
    this.drawPointerTrail(g);
  }


  private spawnChipShards(chip: Chip) {
    const shards = createChipShards(chip, chip.sliceAngle);
    this.chipShards.push(...shards);
    const palette = chipPalette(chip.kind);
    this.createSlash(chip.x, chip.y, chip.sliceAngle, chip.r * 2.75, Phaser.Display.Color.IntegerToColor(palette.edge).rgba, 0.18, 5);
    if (chip.kind === 'glitch') this.addParticle(chip.x, chip.y, '#ff7d9b', 18, 250, 2.8, 0.42);
  }

  private drawChip(g:Phaser.GameObjects.Graphics,c:Chip){
    const palette = chipPalette(c.kind);
    const alpha=c.sliced?Math.max(0,1-c.pop*1.4):1;
    if(alpha<=0) return;
    const pulse = 1 + Math.sin(c.age * 7) * 0.035;
    g.fillStyle(palette.glow, .08 * alpha).fillCircle(c.x, c.y, (c.r + 12) * pulse);
    if(c.kind==='glitch'){
      const pts: Phaser.Math.Vector2[]=[];
      for(let i=0;i<9;i++){ const a=-Math.PI/2+i*TAU/9+c.rot, rr=c.r*(i%2?.72:1.08)*pulse; pts.push(new Phaser.Math.Vector2(c.x+Math.cos(a)*rr,c.y+Math.sin(a)*rr)); }
      g.fillStyle(palette.dark,alpha).fillPoints(pts, true);
      g.lineStyle(3,palette.fill,alpha).strokePoints(pts, true);
      g.lineStyle(2,palette.edge,.72*alpha).lineBetween(c.x-10,c.y-10,c.x+10,c.y+10).lineBetween(c.x+10,c.y-10,c.x-10,c.y+10);
    } else {
      const pts: Phaser.Math.Vector2[]=[];
      for(let i=0;i<6;i++){ const a=-Math.PI/6+i*TAU/6+c.rot, rr=c.r*pulse; pts.push(new Phaser.Math.Vector2(c.x+Math.cos(a)*rr,c.y+Math.sin(a)*rr)); }
      g.fillStyle(palette.dark,.9*alpha).fillPoints(pts,true);
      g.fillStyle(palette.fill,.92*alpha).fillPoints(pts.map((pt)=>new Phaser.Math.Vector2(lerp(c.x,pt.x,.82),lerp(c.y,pt.y,.82))),true);
      g.lineStyle(2.6,palette.edge,.82*alpha).strokePoints(pts,true);
      this.drawChipIcon(g,c.kind,c.x,c.y,c.r,alpha);
    }
    if(c.marked&&!c.sliced){
      g.lineStyle(3,c.kind==='glitch'?0xff90a8:0xc8fbff,.55+c.markedPulse*.4).strokeCircle(c.x,c.y,c.r+8+c.markedPulse*4);
      g.lineStyle(1.5,0xffffff,.36).strokeCircle(c.x,c.y,c.r+15+c.markedPulse*6);
    }
    if(c.sliced){
      g.lineStyle(4,palette.edge,.9*alpha).lineBetween(c.x-Math.cos(c.sliceAngle)*c.r*1.25,c.y-Math.sin(c.sliceAngle)*c.r*1.25,c.x+Math.cos(c.sliceAngle)*c.r*1.25,c.y+Math.sin(c.sliceAngle)*c.r*1.25);
    }
  }

  private drawChipIcon(g: Phaser.GameObjects.Graphics, kind: Chip['kind'], x: number, y: number, r: number, alpha: number) {
    g.lineStyle(3, 0x07131a, .72 * alpha);
    g.fillStyle(0x07131a, .72 * alpha);
    if(kind==='blade'){
      g.lineBetween(x-r*.38,y+r*.38,x+r*.38,y-r*.38);
      g.lineStyle(2,0xffffff,.38*alpha).lineBetween(x-r*.18,y+r*.18,x+r*.34,y-r*.34);
    } else if(kind==='repair'){
      g.fillRoundedRect(x-4,y-r*.45,8,r*.9,2).fillRoundedRect(x-r*.45,y-4,r*.9,8,2);
    } else if(kind==='surge'){
      g.fillPoints([
        new Phaser.Math.Vector2(x+2,y-r*.55), new Phaser.Math.Vector2(x-r*.35,y+1), new Phaser.Math.Vector2(x-1,y+1),
        new Phaser.Math.Vector2(x-4,y+r*.55), new Phaser.Math.Vector2(x+r*.42,y-4), new Phaser.Math.Vector2(x+5,y-4),
      ], true);
    }
  }

  private drawChipShard(g: Phaser.GameObjects.Graphics, shard: ChipShard) {
    const alpha = clamp(shard.life / shard.maxLife, 0, 1);
    const shrink = 0.72 + alpha * 0.28;
    const half = shard.side;
    const local = shard.kind === 'glitch'
      ? [
          new Phaser.Math.Vector2(0, -shard.r * 1.08),
          new Phaser.Math.Vector2(half * shard.r * 0.98, -shard.r * 0.28),
          new Phaser.Math.Vector2(half * shard.r * 0.80, shard.r * 0.72),
          new Phaser.Math.Vector2(0, shard.r * 1.00),
        ]
      : [
          new Phaser.Math.Vector2(0, -shard.r * 0.98),
          new Phaser.Math.Vector2(half * shard.r * 0.96, -shard.r * 0.52),
          new Phaser.Math.Vector2(half * shard.r * 0.86, shard.r * 0.50),
          new Phaser.Math.Vector2(0, shard.r * 0.98),
        ];
    const cos = Math.cos(shard.rot), sin = Math.sin(shard.rot);
    const pts = local.map((v) => new Phaser.Math.Vector2(
      shard.x + (v.x * cos - v.y * sin) * shrink,
      shard.y + (v.x * sin + v.y * cos) * shrink,
    ));
    g.fillStyle(shard.dark, 0.72 * alpha).fillPoints(pts, true);
    g.fillStyle(shard.fill, 0.92 * alpha).fillPoints(pts.map((pt) => new Phaser.Math.Vector2(lerp(shard.x, pt.x, 0.82), lerp(shard.y, pt.y, 0.82))), true);
    g.lineStyle(2.2, shard.glow, 0.8 * alpha).strokePoints(pts, true);

    const edgeDx = Math.cos(shard.cutAngle) * shard.r * 0.9 * shrink;
    const edgeDy = Math.sin(shard.cutAngle) * shard.r * 0.9 * shrink;
    g.lineStyle(4, shard.edge, alpha).lineBetween(shard.x - edgeDx * 0.15, shard.y - edgeDy * 0.15, shard.x + edgeDx, shard.y + edgeDy);
    g.lineStyle(1.4, 0xffffff, 0.75 * alpha).lineBetween(shard.x - edgeDx * 0.08, shard.y - edgeDy * 0.08, shard.x + edgeDx * 0.72, shard.y + edgeDy * 0.72);

    if (shard.kind === 'glitch') {
      const pulse = 0.35 + Math.sin(shard.age * 38) * 0.18;
      g.lineStyle(2, 0xff9bb0, pulse * alpha).strokeCircle(shard.x, shard.y, shard.r * (0.42 + shard.age));
    }
  }

  private drawPointerTrail(g:Phaser.GameObjects.Graphics){
    const ps=this.pointerState; if(!ps.down||ps.path.length<2) return;
    for(let i=1;i<ps.path.length;i++){
      const p0=ps.path[i-1], p1=ps.path[i], a=i/ps.path.length;
      const ready=!!ps.readyInfo;
      const color=ready?0xfaffff:ps.hitIds.size>0?0x9edffb:0xdffcff;
      const alpha=ready?.34+a*.66:ps.hitIds.size>0?.16+a*.48:.16+a*.58;
      g.lineStyle(8+a*7,0x0ff0ff,alpha*.16).lineBetween(p0.x,p0.y,p1.x,p1.y);
      g.lineStyle(3+a*4,color,alpha).lineBetween(p0.x,p0.y,p1.x,p1.y);
    }
    const end=ps.path[ps.path.length-1];
    if(ps.readyInfo){
      g.lineStyle(2,0xfff3a8,.72 + Math.sin(this.state.time*18)*.12).strokeCircle(end.x,end.y,15);
      g.fillStyle(0xfff3a8,.18).fillCircle(end.x,end.y,24);
    }
    g.fillStyle(0xf5ffff,.95).fillCircle(end.x,end.y,5);
  }

  private drawParticles(g:Phaser.GameObjects.Graphics){ for(const p of this.particles){ const a=clamp(p.life/p.maxLife,0,1); g.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color,a).fillCircle(p.x,p.y,p.size*(.6+a)); } }
  private drawOverlay(g:Phaser.GameObjects.Graphics){ this.overlay.removeAll(true); if(this.state.status==='start') this.drawStartOverlay(g); if(this.state.status==='choice') this.drawChoiceOverlay(g); if(this.state.status==='win'||this.state.status==='lose') this.drawResultOverlay(g); }
  private overlayText(x:number,y:number,text:string,size:number,color:string,style='900',origin=.5){ const t=this.add.text(x,y,text,{fontFamily:'system-ui, sans-serif',fontSize:`${size}px`,fontStyle:style,color,align:'center',wordWrap:{width:470}}).setOrigin(origin).setDepth(40); this.overlay.add(t); return t; }
  private drawStartOverlay(g:Phaser.GameObjects.Graphics){
    g.fillStyle(0x02050a,.78).fillRect(0,0,W,H);
    g.fillStyle(0x00e7ff,.08).fillTriangle(0,0,W,110,0,TOP_H+130);
    g.lineStyle(1,0x6fe2ff,.14);
    for(let y=90;y<H;y+=18) g.lineBetween(42,y,W-42,y);
    this.overlayText(W/2+3,170,'SPLITBLADE',46,'#ff4f7d');
    this.overlayText(W/2-3,164,'SPLITBLADE',46,'#42f6ff');
    this.overlayText(W/2,167,'SPLITBLADE',46,'#f5fdff');
    this.overlayText(W/2,208,'네온 전장 지휘 × 코어 슬라이스 액션',15,'rgba(218,246,255,.88)','800');
    g.fillStyle(0x06111c,.92).fillRoundedRect(48,258,W-96,154,24);
    g.lineStyle(2.5,0x82efff,.78).strokeRoundedRect(48,258,W-96,154,24);
    g.lineStyle(1,0xfff3a8,.32).strokeRoundedRect(58,268,W-116,134,18);
    this.overlayText(W/2,296,'TAP TO DEPLOY',24,'#fff4a8');
    this.overlayText(W/2,328,'하단 패널의 코어를 베어 영웅에게 지시하세요',14,'rgba(232,251,255,.86)','700');
    this.overlayText(W/2,354,'가로/세로/대각 · 십자 · X베기 인식',13,'#9edffb','700');
    this.overlayText(W/2,378,'돌진 중 무적 · 글리치 코어는 피해를 줍니다',13,'rgba(255,170,190,.9)','700');
    this.overlayText(W/2,TOP_H+108,'DRAG THROUGH CORES  •  RELEASE TO CONFIRM',13,'#dffcff','900');
  }
  private drawChoiceOverlay(g:Phaser.GameObjects.Graphics){
    g.fillStyle(0x000000,.42).fillRect(0,0,W,TOP_H);
    g.fillGradientStyle(0x07101d,0x07101d,0x03050a,0x03050a,1,1,1,1).fillRect(0,TOP_H,W,BOT_H);
    this.overlayText(W/2,TOP_H+32,'ROGUE PATCH SELECT',23,'#fff1a6');
    this.overlayText(W/2,TOP_H+56,'전투 강화 카드 선택 · 1 / 2 / 3',12,'rgba(232,251,255,.82)','700');
    for(let i=0;i<3;i++){
      const x=32,y=TOP_H+82+i*104,w=W-64,h=88,opt=this.state.choiceOptions[i];
      g.fillGradientStyle(0x1e4155,0x10263a,0x0a1020,0x10172c,.98,.98,.98,.98).fillRoundedRect(x,y,w,h,18);
      g.lineStyle(2,0x7febff,.66).strokeRoundedRect(x,y,w,h,18);
      g.lineStyle(1,0xffffff,.12).strokeRoundedRect(x+6,y+6,w-12,h-12,13);
      g.fillStyle(0xfff4a8,.16).fillCircle(x+36,y+42,23);
      g.lineStyle(2,0xfff4a8,.48).strokeCircle(x+36,y+42,23);
      this.overlayText(x+36,y+49,String(i+1),22,'#fff4a8');
      if(opt){ this.overlayText(x+70,y+31,opt.title,16,'#eaffff','900',0); this.overlayText(x+70,y+58,opt.desc,13,'rgba(230,250,255,.82)','700',0); }
    }
  }
  private drawResultOverlay(g:Phaser.GameObjects.Graphics){
    const win=this.state.status==='win';
    g.fillStyle(win?0x031416:0x180409,.82).fillRect(0,0,W,H);
    g.fillStyle(0x050911,.94).fillRoundedRect(44,178,W-88,226,26);
    g.lineStyle(2.5,win?0xaaffee:0xff8aa0,.74).strokeRoundedRect(44,178,W-88,226,26);
    g.lineStyle(1,0xffffff,.14).strokeRoundedRect(56,190,W-112,202,18);
    this.overlayText(W/2,222,win?'EXTRACTION COMPLETE':'CORE OFFLINE',34,win?'#aaffee':'#ff9aac');
    this.overlayText(W/2,258,this.state.resultLine,15,'rgba(238,252,255,.88)','700');
    this.overlayText(W/2,306,`SCORE ${this.state.score}   KILLS ${this.state.kills}`,19,'#fff3a8');
    this.overlayText(W/2,334,`MAX COMBO x${this.state.maxCombo}   BATTLE ${this.state.battleIndex}`,17,'#dffcff');
    this.overlayText(W/2,374,'터치 / Space / R 로 다시 플레이',15,'rgba(232,251,255,.86)','800');
  }

  private updateHudTexts(){ this.hud.timer.setText(String(Math.ceil(Math.max(0,this.state.runTime-this.state.time))).padStart(2,'0')+'s').setVisible(this.state.status!=='start'); this.hud.battle.setText(`BATTLE ${this.state.battleIndex}  ENEMIES ${this.state.battleAlive}/${this.state.battleSize}`).setVisible(this.state.status!=='start'); this.hud.score.setText('K '+this.state.kills+'  S '+this.state.score).setVisible(this.state.status!=='start'); this.hud.combo.setText(this.state.combo>0?'x'+this.state.combo:'').setVisible(this.state.combo>0); this.hud.sense.setText(this.state.slashSenseTime>0&&this.state.slashSenseText?'인식: '+this.state.slashSenseText:''); this.hud.coreLabel.setText('CORE'); this.hud.xpLabel.setText('LV '+this.state.level); this.hud.overdriveLabel.setText('OVERDRIVE'); this.hud.panelTitle.setText('DIRECTIVE SLICE PANEL'); this.hud.panelHelp1.setText('좌/우/상/하/대각 방향 구분 · 길이별 위력/범위 변화'); this.hud.panelHelp2.setText('가로+세로=십자 / 반대 대각 콤보=X베기'); if(this.state.battleBanner>0){ this.overlayText(W/2,124,this.state.battleBannerText,23,'#fff3a8'); } }
}
