import * as Phaser from 'phaser';
import { BOT_H, CORE_X, FIELD, H, HERO_HOME_X, HERO_HOME_Y, TAU, TOP_H, W } from './constants';
import { analyzeGesture, lengthProfile, slashLabel } from './gesture';
import { clamp, dist, easeOutCubic, lerp, rand, randi, segmentCircle } from './math';
import { TonePlayer } from './audio';
import type { Chip, Enemy, EnemyType, FloatText, GameState, GestureInfo, Hero, HeroSkillPoint, LastGesture, Particle, Point, PointerState, Projectile, Slash, Upgrade } from './types';

const ENEMY_STATS: Record<EnemyType, { hp:number; speed:number; cooldown:number; damage:number; range:number; radius:number; score:number; xp:number; mode:'ranged'|'melee'; projectileSpeed?:number; projectileSize?:number; projectileColor?:string }> = {
  scout:  { hp: 18, speed: 19, cooldown: 3.10, damage: 2, range: 150, radius: 12, score: 100, xp: 0.85, mode: 'ranged', projectileSpeed: 205, projectileSize: 4, projectileColor: '#ffd39b' },
  gunner: { hp: 28, speed: 16, cooldown: 3.65, damage: 4, range: 178, radius: 14, score: 140, xp: 1.05, mode: 'ranged', projectileSpeed: 185, projectileSize: 5, projectileColor: '#ffb066' },
  raider: { hp: 34, speed: 12, cooldown: 1.35, damage: 5, range: 26,  radius: 13, score: 135, xp: 1.0, mode: 'melee' },
  brute:  { hp: 72, speed: 9,  cooldown: 1.95, damage: 9, range: 30, radius: 16, score: 240, xp: 1.8, mode: 'melee' },
  warden: { hp: 235, speed: 8,  cooldown: 1.65, damage: 12, range: 34, radius: 20, score: 1200, xp: 6.0, mode: 'melee' },
};

export class GameScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private state!: GameState;
  private hero!: Hero;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private chips: Chip[] = [];
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

  create() {
    this.g = this.add.graphics();
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
    this.hud.combo = make(W-18, 92, 26, '#fff3a8', 'right');
    this.hud.sense = make(W/2, TOP_H + 86, 13, '#fff3a8', 'center');
  }

  private resetState() {
    this.state = { status: 'start', time: 0, runTime: 100, hp: 115, maxHp: 115, shield: 0, kills: 0, score: 0, level: 1, xp: 0, xpNeed: 8, combo: 0, maxCombo: 0, comboTimer: 0, overdrive: 0, chipSpawn: 0.25, shake: 0, flash: 0, battleIndex: 0, battleSize: 0, battleAlive: 0, battleClearTimer: -1, battleBanner: 0, battleBannerText: '', slashSenseText: '', slashSenseTime: 0, choiceOptions: [], resultLine: '', upg: { skillDamage: 1, heroAtk: 1, heroMove: 1, extraTargets: 0, healBoost: 1, comboBonus: 0, overdrive: 1, aoe: 1 } };
    this.hero = { x: HERO_HOME_X, y: HERO_HOME_Y, homeX: HERO_HOME_X, homeY: HERO_HOME_Y, facing: 1, attackCd: 0.1, swing: 0, hurt: 0, hitFlash: 0, trail: [], skill: null };
    this.enemies = []; this.projectiles = []; this.chips = []; this.slashes = []; this.particles = []; this.nextId = 1; this.lastGesture = null;
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
  private dealEnemyDamage(enemy: Enemy | null, amount:number, color?:string){ if(!enemy || enemy.dead) return; enemy.hp-=amount; enemy.hurt=.12; enemy.hitFlash=.16; this.addParticle(enemy.x,enemy.y-10,color||'#eaffff',8,95,3,.35); this.addText(String(Math.round(amount)),enemy.x,enemy.y-28,'#faffff',14); this.tones.tone(150,.05,'square',.032,-40); if(enemy.hp<=0){ enemy.dead=true; this.state.kills++; this.state.score+=Math.round(enemy.score*(1+this.state.combo*.01)); this.state.overdrive=clamp(this.state.overdrive+(enemy.type==='warden'?30:6),0,110); this.addXP(enemy.xp||.6); this.addParticle(enemy.x,enemy.y-4,enemy.type==='warden'?'#ffd17c':'#ff9f71',18,180,4,.6); if(enemy.type==='warden') this.addText('WARDEN DOWN',enemy.x,enemy.y-40,'#ffd17c',18); } }

  private heroAutoAttack(dt:number){ if(this.hero.skill) return; this.hero.hitFlash=Math.max(0,this.hero.hitFlash-dt); this.hero.hurt=Math.max(0,this.hero.hurt-dt); this.hero.attackCd-=dt*this.state.upg.heroAtk; this.hero.swing=Math.max(0,this.hero.swing-dt); const alive=this.enemies.filter(e=>!e.dead); if(!alive.length){ this.hero.x=lerp(this.hero.x,this.hero.homeX,dt*4.5); this.hero.y=lerp(this.hero.y,this.hero.homeY,dt*4.5); return; } const target=alive.sort((a,b)=>dist(this.hero.x,this.hero.y,a.x,a.y)-dist(this.hero.x,this.hero.y,b.x,b.y))[0]; const dx=target.x-this.hero.x, dy=target.y-this.hero.y, d=Math.hypot(dx,dy)||1; this.hero.facing=dx>=0?1:-1; if(d>36){ const move=130*this.state.upg.heroMove; this.hero.x+=dx/d*move*dt; this.hero.y+=dy/d*move*dt; } else if(this.hero.attackCd<=0){ this.hero.attackCd=.54; this.hero.swing=.22; this.createSlash(this.hero.x+this.hero.facing*20,this.hero.y-6,this.hero.facing>0?-.45:Math.PI+.45,58,'#dffcff',.22,7); this.dealEnemyDamage(target,14,'#dffcff'); } this.hero.x=clamp(this.hero.x,FIELD.x+10,FIELD.x+FIELD.w-18); this.hero.y=clamp(this.hero.y,FIELD.y+18,FIELD.y+FIELD.h-18); }
  private updateHeroSkill(dt:number){ const skill=this.hero.skill; if(!skill) return; const fromX=skill.seg===0?skill.startX:skill.points[skill.seg-1].x; const fromY=skill.seg===0?skill.startY:skill.points[skill.seg-1].y; const to=skill.points[skill.seg]; const segDur=to.settle?.12:.10; skill.segT+=dt; const p=easeOutCubic(skill.segT/segDur); this.hero.x=lerp(fromX,to.x,p); this.hero.y=lerp(fromY,to.y,p); this.hero.facing=(to.x-fromX)>=0?1:-1; this.hero.trail.push({x:this.hero.x,y:this.hero.y,life:.18}); if(this.hero.trail.length>6) this.hero.trail.shift(); if(skill.segT>=segDur){ if(!to.settle && !to.resolved){ to.resolved=true; if(skill.type==='cross'){ const radius=to.radius||110; for(const e of this.enemies) if(!e.dead && dist(e.x,e.y,to.x,to.y)<radius+e.radius) this.dealEnemyDamage(e,to.damage,skill.overdrive?'#fff2a8':'#dffcff'); const len=to.slashLen||84*this.state.upg.aoe; this.createSlash(to.x,to.y,.68,len,skill.overdrive?'#fff2a8':'#dffcff',.28,8); this.createSlash(to.x,to.y,-.68,len,skill.overdrive?'#fff2a8':'#dffcff',.28,8); } else if(skill.type==='xslash'){ this.dealEnemyDamage(to.target,to.damage,skill.overdrive?'#fff2a8':'#e7d7ff'); const len=to.slashLen||86; this.createSlash(to.x+4,to.y-8,.72,len,skill.overdrive?'#fff2a8':'#e7d7ff',.30,8); this.createSlash(to.x+4,to.y-8,-.72,len,skill.overdrive?'#fff2a8':'#e7d7ff',.30,8); this.addParticle(to.x,to.y-6,skill.overdrive?'#fff2a8':'#d8c7ff',18,170,4,.42); } else { this.dealEnemyDamage(to.target,to.damage,skill.overdrive?'#fff2a8':'#dffcff'); this.createSlash(to.x+8,to.y-8,to.angle,to.slashLen||(skill.type==='vertical'?74:58),skill.overdrive?'#fff2a8':'#dffcff',.24,7); } } skill.seg++; skill.segT=0; if(skill.seg>=skill.points.length){ this.hero.skill=null; this.hero.x=clamp(this.hero.x,FIELD.x+10,FIELD.x+FIELD.w-18); this.hero.y=clamp(this.hero.y,FIELD.y+18,FIELD.y+FIELD.h-18); } } }
  private updateEnemies(dt:number){ const alive=this.enemies.filter(e=>!e.dead); for(const e of alive){ e.hurt=Math.max(0,e.hurt-dt); e.hitFlash=Math.max(0,e.hitFlash-dt); e.attackCd-=dt; e.swing=Math.max(0,e.swing-dt); const tx=this.hero.skill?this.hero.x:this.hero.x-18, ty=this.hero.skill?this.hero.y:this.hero.y; const dx=tx-e.x,dy=ty-e.y,d=Math.hypot(dx,dy)||1; e.facing=dx>=0?1:-1; let sepX=0,sepY=0; for(const other of alive){ if(other===e) continue; const dd=dist(e.x,e.y,other.x,other.y), min=e.radius+other.radius+5; if(dd>0&&dd<min){ sepX+=(e.x-other.x)/dd*(min-dd)*1.5; sepY+=(e.y-other.y)/dd*(min-dd)*1.5; } } const orbitY=Math.sin((e.id*12+this.state.time*1.8))*10; if(e.isRanged){ const desired=e.preferredRange; let desiredX=sepX*1.2, desiredY=sepY*1.2+orbitY*.55; if(d>desired+18){ desiredX+=dx/d*e.speed; desiredY+=dy/d*e.speed; } else if(d<desired-18){ desiredX-=dx/d*e.speed*.95; desiredY-=dy/d*e.speed*.95; } else { desiredX+=-dy/d*e.speed*.55; desiredY+=dx/d*e.speed*.55; } e.vx=lerp(e.vx,desiredX,dt*5.5); e.vy=lerp(e.vy,desiredY,dt*5.5); e.x+=e.vx*dt; e.y+=e.vy*dt; if(d<=e.range&&e.attackCd<=0){ e.attackCd=e.attackRate+rand(.25,.85); e.swing=.12; if(!this.heroInvulnerable()&&this.projectiles.length<10){ this.fireProjectile(e,tx,ty); this.tones.tone(210,.04,'square',.018,30); } else e.attackCd=Math.max(e.attackCd,.8); } } else { if(d>e.range+4){ e.vx=lerp(e.vx,dx/d*e.speed+sepX*1.6,dt*5.5); e.vy=lerp(e.vy,dy/d*e.speed+sepY*1.6+orbitY*.16,dt*5.5); e.x+=e.vx*dt; e.y+=e.vy*dt; } else { e.vx=lerp(e.vx,sepX*1.25,dt*5.5); e.vy=lerp(e.vy,sepY*1.25+orbitY*.18,dt*5.5); e.x+=e.vx*dt; e.y+=e.vy*dt; if(e.attackCd<=0){ e.attackCd=e.attackRate; e.swing=.18; if(!this.heroInvulnerable()){ this.createSlash(e.x+e.facing*14,e.y-6,e.facing>0?-.45:Math.PI+.45,e.type==='warden'?42:34,'#ffb17d',.18,5); this.damagePlayer(e.damage); } else { this.addParticle(e.x+e.facing*10,e.y-4,'#d8fbff',4,55,2.4,.18); e.attackCd*=.45; } } } } e.x=clamp(e.x,FIELD.x+4,FIELD.x+FIELD.w-4); e.y=clamp(e.y,FIELD.y+14,FIELD.y+FIELD.h-14); } this.enemies=this.enemies.filter(e=>!e.dead); this.state.battleAlive=this.enemies.length; if(this.state.status==='running'&&this.state.battleAlive===0&&this.state.battleClearTimer<0){ this.state.battleClearTimer=1; this.addText('CLEAR',W/2,146,'#96ffd1',26); this.tones.tone(690,.11,'triangle',.048,160); } }
  private fireProjectile(enemy: Enemy, tx:number, ty:number){ const dx=tx-enemy.x,dy=ty-enemy.y,d=Math.hypot(dx,dy)||1; this.projectiles.push({x:enemy.x+dx/d*12,y:enemy.y+dy/d*12,vx:dx/d*enemy.projectileSpeed,vy:dy/d*enemy.projectileSpeed,life:2.2,damage:enemy.damage,radius:enemy.projectileSize,color:enemy.projectileColor,trail:0}); }
  private updateProjectiles(dt:number){ for(const p of this.projectiles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; p.trail+=dt; if(p.trail>.035){ p.trail=0; this.particles.push({x:p.x,y:p.y,vx:0,vy:0,color:p.color,size:p.radius*.72,life:.18,maxLife:.18,drag:1}); } const hd=dist(p.x,p.y,this.hero.x,this.hero.y); if(this.heroInvulnerable()){ if(hd<18){ p.life=-1; this.addParticle(p.x,p.y,'#e7fdff',6,70,2.8,.22); } } else if(hd<p.radius+12){ this.damagePlayer(p.damage); this.addParticle(p.x,p.y,'#ffd5a8',8,90,2.8,.25); p.life=-1; } if(p.x<FIELD.x-30||p.x>FIELD.x+FIELD.w+30||p.y<FIELD.y-30||p.y>FIELD.y+FIELD.h+30) p.life=-1; } this.projectiles=this.projectiles.filter(p=>p.life>0); }
  private processGesture(info: GestureInfo, hitChips: Chip[]){ const good: Chip[]=[]; const bad: Chip[]=[]; for(const c of hitChips){ c.marked=false; c.sliced=true; c.sliceAngle=Number.isFinite(c.hitAngle)?c.hitAngle:info.angle; c.pop=0; this.addParticle(c.x,c.y,c.kind==='glitch'?'#ff436a':'#dffcff',c.kind==='glitch'?16:12,150,3.8,.36); this.tones.tone(c.kind==='glitch'?120:760,.045,'triangle',c.kind==='glitch'?.045:.028,c.kind==='glitch'?-20:120); (c.kind==='glitch'?bad:good).push(c); } for(const c of bad){ this.damagePlayer(12); this.addParticle(c.x,c.y,'#ff406a',20,190,5,.6); this.addText('GLITCH',c.x,c.y-24,'#ff5b7a',17); this.state.combo=0; this.state.comboTimer=0; } this.setSlashSense(info,''); if(good.length>0){ let mult=1+Math.min(.65,this.state.combo*(.022+this.state.upg.comboBonus))+Math.min(.25,(good.length-1)*.08); const repairCount=good.filter(c=>c.kind==='repair').length; const surgeCount=good.filter(c=>c.kind==='surge').length; if(repairCount) this.healPlayer(repairCount*5*this.state.upg.healBoost); if(surgeCount){ this.state.overdrive=clamp(this.state.overdrive+surgeCount*18,0,120); this.addText('SURGE',info.mx,info.my-24,'#f3d46b',16); } this.state.overdrive=clamp(this.state.overdrive+good.length*3,0,120); let overdrive=false; if(this.state.overdrive>=100){ this.state.overdrive-=100; mult*=1.75; overdrive=true; this.state.flash=Math.max(this.state.flash,.2); this.addText('OVERDRIVE',W/2,TOP_H+22,'#fff2a8',22); } this.state.combo+=good.length; this.state.maxCombo=Math.max(this.state.maxCombo,this.state.combo); this.state.comboTimer=3; this.state.score+=Math.round(16*good.length*(1+this.state.combo*.05)); this.addXP(.28*good.length); this.triggerDirective(info,good.length,mult,overdrive); } this.rememberGesture(info); }

  private updateRun(dt:number){ this.state.time+=dt; if(this.state.comboTimer>0){ this.state.comboTimer-=dt; if(this.state.comboTimer<=0) this.state.combo=0; } this.state.battleBanner=Math.max(0,this.state.battleBanner-dt); this.state.chipSpawn-=dt; const chipInterval=clamp(.64-this.state.time*.002,.34,.64); if(this.state.chipSpawn<=0){ this.spawnChip(false); this.state.chipSpawn=chipInterval; } for(const c of this.chips){ c.age+=dt; if(!c.sliced){ c.x+=c.vx*dt; c.y+=c.vy*dt; c.vy+=c.g*dt; c.rot+=c.spin*dt; if(c.x<42||c.x>W-42) c.vx*=-.88; c.x=clamp(c.x,42,W-42); } else c.pop+=dt*6; if(c.markedPulse>0) c.markedPulse=Math.max(0,c.markedPulse-dt*4.5); if(c.y>H+60||c.pop>1) c.remove=true; } this.chips=this.chips.filter(c=>!c.remove); if(this.pointerState.down){ this.evaluatePointerGesture(); this.commitPointerGesture(false); } this.updateHeroSkill(dt); this.heroAutoAttack(dt); for(const t of this.hero.trail) t.life-=dt; this.hero.trail=this.hero.trail.filter(t=>t.life>0); this.updateEnemies(dt); this.updateProjectiles(dt); if(this.state.battleClearTimer>=0){ this.state.battleClearTimer-=dt; if(this.state.battleClearTimer<=0&&this.state.status==='running') this.beginNextBattle(); } if(this.state.time>=this.state.runTime&&this.state.status==='running'){ this.state.status='win'; this.state.resultLine=`전투 ${this.state.battleIndex}개 구역을 돌파하고 ${this.state.kills}명을 처치했습니다.`; this.tones.tone(640,.12,'triangle',.06,180); } }
  private updateEffects(dt:number){ for(const s of this.slashes) s.t+=dt; this.slashes=this.slashes.filter(s=>s.t<s.dur); for(const p of this.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=Math.pow(p.drag,dt*60); p.vy*=Math.pow(p.drag,dt*60); p.life-=dt; } this.particles=this.particles.filter(p=>p.life>0); for(const item of this.floatLabels){ const f=item.model; f.y+=f.vy*dt; f.life-=dt; item.text.setPosition(f.x,f.y).setAlpha(clamp(f.life/f.maxLife,0,1)); } this.floatLabels=this.floatLabels.filter(item=>{ if(item.model.life>0) return true; item.text.destroy(); return false; }); this.state.slashSenseTime=Math.max(0,this.state.slashSenseTime-dt); this.state.shake=Math.max(0,this.state.shake-dt*1.7); this.state.flash=Math.max(0,this.state.flash-dt*1.9); }

  private renderFrame(){ const g=this.g; g.clear(); this.drawTop(g); this.drawBottom(g); this.drawParticles(g); this.drawOverlay(g); this.updateHudTexts(); }
  private drawTop(g: Phaser.GameObjects.Graphics){ g.fillStyle(0x1b202b).fillRect(0,0,W,TOP_H); this.drawField(g); this.drawCore(g); this.drawEnemies(g); this.drawProjectiles(g); this.drawHero(g); this.drawSlashes(g); this.drawHudBars(g); if(this.state.battleBanner>0){ g.fillStyle(0x000000, .42).fillRect(W/2-112,100,224,34); } g.lineStyle(2,0x78b4d2,.28).lineBetween(0,TOP_H-.5,W,TOP_H-.5); if(this.state.flash>0) g.fillStyle(0xfff4d6,this.state.flash*.35).fillRect(0,0,W,H); }
  private drawField(g: Phaser.GameObjects.Graphics){ g.fillStyle(0x151b24).fillRoundedRect(FIELD.x,FIELD.y,FIELD.w,FIELD.h,22); g.fillStyle(0xffffff,.025); for(let i=0;i<150;i++) g.fillRect(FIELD.x+(i*73)%FIELD.w, FIELD.y+((i*47)%FIELD.h),4,4); g.lineStyle(1,0x6e8caa,.08); for(let x=FIELD.x+18;x<FIELD.x+FIELD.w;x+=34) g.lineBetween(x,FIELD.y+10,x+Math.sin(x)*8,FIELD.y+FIELD.h-10); for(let i=0;i<9;i++){ const x=FIELD.x+62+i*54+(i%2?12:-10), y=FIELD.y+54+(i%4)*92; g.fillStyle(0xffffff,.035).fillCircle(x,y,16+(i%2)*5); g.fillStyle(0x000000,.16).fillCircle(x+6,y+4,9+(i%2)*3); } }
  private drawCore(g: Phaser.GameObjects.Graphics){ g.fillStyle(0x2b3947).fillRoundedRect(CORE_X-22,HERO_HOME_Y-34,34,68,8); g.fillStyle(0x5fe2ff).fillRect(CORE_X-14,HERO_HOME_Y-22,10,44); g.fillStyle(0x5fe2ff,.25).fillCircle(CORE_X-9,HERO_HOME_Y,20); }
  private drawSprite(g:Phaser.GameObjects.Graphics,type:string,x:number,y:number,facing:number,scale=1,tint?:number,swing=0){
    const rx = (px:number,w:number) => facing > 0 ? x + px * scale : x - (px + w) * scale;
    const ry = (py:number) => y + py * scale;
    const rect = (px:number, py:number, w:number, h:number, color:number) => g.fillStyle(color).fillRect(rx(px,w), ry(py), w*scale, h*scale);
    const stroke = (px:number, py:number, w:number, h:number) => g.lineStyle(2,0x12151c,.9).strokeRect(rx(px,w), ry(py), w*scale, h*scale);
    g.fillStyle(0x000000,.22).fillEllipse(x,y+13*scale,18*scale,8*scale);
    const body=tint ?? (type==='hero'?0x25232c:type.includes('warden')?0x8a7e73:type.includes('brute')?0xaeb8c5:0x705a44);
    const head=tint ?? (type==='hero'?0xefefef:type.includes('gunner')?0xf08c4d:type.includes('raider')?0xefad39:type.includes('brute')?0xd7dbe2:type.includes('warden')?0xc7bbb0:0xd7b07c);
    rect(-6,-1,12,16,body); stroke(-6,-1,12,16);
    rect(-9,-17,18,16,head); stroke(-9,-17,18,16);
    rect(-6,-12,12,4,0x111820);
    const accent=tint ?? (type==='hero'?0x6ad7ff:type.includes('warden')?0xff5b46:0xffc67b);
    rect(6,type==='hero'?-1:-3,9+swing*18,3,accent);
  }
  private drawHero(g:Phaser.GameObjects.Graphics){ for(const t of this.hero.trail){ g.setAlpha(t.life/.18*.35); this.drawSprite(g,'hero',t.x,t.y,this.hero.facing,1.14,0xd7f8ff); g.setAlpha(1); } this.drawSprite(g,'hero',this.hero.x,this.hero.y,this.hero.facing,1.16,this.hero.hitFlash>0?0xffffff:undefined,this.hero.swing); }
  private drawEnemies(g:Phaser.GameObjects.Graphics){ for(const e of this.enemies.slice().sort((a,b)=>a.y-b.y)){ const scale=e.type==='warden'?1.26:e.type==='brute'?1.08:1; this.drawSprite(g,`enemy_${e.type}`,e.x,e.y,e.facing,scale,e.hitFlash>0?0xffffff:undefined,e.swing); if(e.hp<e.maxHp) this.drawMiniBar(g,e.x,e.y-(e.type==='warden'?34:26),e.type==='warden'?42:28,e.hp/e.maxHp,0xff7a6b); } }
  private drawMiniBar(g:Phaser.GameObjects.Graphics,x:number,y:number,w:number,ratio:number,color:number){ g.fillStyle(0x000000,.45).fillRect(Math.round(x-w/2),Math.round(y),w,4); g.fillStyle(color).fillRect(Math.round(x-w/2),Math.round(y),w*clamp(ratio,0,1),4); }
  private drawProjectiles(g:Phaser.GameObjects.Graphics){ for(const p of this.projectiles){ g.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color, clamp(p.life/.35,.35,1)).fillCircle(p.x,p.y,p.radius); g.lineStyle(1.2,0xffffff,.45).lineBetween(p.x-p.vx*.02,p.y-p.vy*.02,p.x+p.vx*.005,p.y+p.vy*.005); } }
  private drawSlashes(g:Phaser.GameObjects.Graphics){ for(const s of this.slashes){ const a=1-s.t/s.dur; const color=Phaser.Display.Color.HexStringToColor(s.color).color; const x1=s.x-Math.cos(s.angle)*s.len*.5, y1=s.y-Math.sin(s.angle)*s.len*.5, x2=s.x+Math.cos(s.angle)*s.len*.5, y2=s.y+Math.sin(s.angle)*s.len*.5; g.lineStyle(s.width+a*4,color,a).lineBetween(x1,y1,x2,y2); g.lineStyle(Math.max(2,s.width*.34),0xffffff,.38*a).lineBetween(lerp(s.x,x1,.72),lerp(s.y,y1,.72),lerp(s.x,x2,.72),lerp(s.y,y2,.72)); } }
  private drawHudBars(g:Phaser.GameObjects.Graphics){ this.drawBar(g,18,18,168,14,this.state.hp/this.state.maxHp,0xff5b6d); if(this.state.shield>0) this.drawBar(g,18,37,168,6,this.state.shield/32,0x81edff); this.drawBar(g,18,50,168,7,this.state.xp/this.state.xpNeed,0x8affc1); this.drawBar(g,W-178,18,160,11,this.state.overdrive/100,0xf4d767); }
  private drawBar(g:Phaser.GameObjects.Graphics,x:number,y:number,w:number,h:number,ratio:number,color:number){ g.fillStyle(0x000000,.48).fillRect(x,y,w,h); g.fillStyle(color).fillRect(x,y,w*clamp(ratio,0,1),h); g.lineStyle(1,0xe6faff,.22).strokeRect(x,y,w,h); }
  private drawBottom(g:Phaser.GameObjects.Graphics){ g.fillStyle(0x101827).fillRect(0,TOP_H,W,BOT_H); g.lineStyle(1,0x6fe2ff,.18); for(let x=0;x<=W;x+=44) g.lineBetween(x,TOP_H,x,H); for(let y=TOP_H;y<=H;y+=38) g.lineBetween(0,y,W,y); g.fillStyle(0x0a0c12,.52).fillRect(0,TOP_H,W,70); for(const c of this.chips) this.drawChip(g,c); this.drawPointerTrail(g); }
  private drawChip(g:Phaser.GameObjects.Graphics,c:Chip){ const color = c.kind==='glitch'?0xff486f:c.kind==='repair'?0x66f5ad:c.kind==='surge'?0xffd86c:0x77e6ff; const alpha=c.sliced?Math.max(0,1-c.pop):1; if(c.kind==='glitch'){ const pts: number[]=[]; for(let i=0;i<9;i++){ const a=-Math.PI/2+i*TAU/9+c.rot, rr=c.r*(i%2?.72:1.08); pts.push(c.x+Math.cos(a)*rr,c.y+Math.sin(a)*rr); } g.fillStyle(0x3b0b19,alpha).fillPoints(pts.map((_,i)=>i%2===0?new Phaser.Math.Vector2(pts[i],pts[i+1]):null).filter(Boolean) as Phaser.Math.Vector2[], true); g.lineStyle(3,color,alpha).strokePoints(pts.map((_,i)=>i%2===0?new Phaser.Math.Vector2(pts[i],pts[i+1]):null).filter(Boolean) as Phaser.Math.Vector2[], true); } else { const pts: Phaser.Math.Vector2[]=[]; for(let i=0;i<6;i++){ const a=-Math.PI/6+i*TAU/6+c.rot; pts.push(new Phaser.Math.Vector2(c.x+Math.cos(a)*c.r,c.y+Math.sin(a)*c.r)); } g.fillStyle(color,alpha).fillPoints(pts,true); g.lineStyle(2.4,0xf0ffff,.75*alpha).strokePoints(pts,true); }
    if(c.marked&&!c.sliced) g.lineStyle(3,c.kind==='glitch'?0xff90a8:0xc8fbff,.45+c.markedPulse*.4).strokeCircle(c.x,c.y,c.r+8+c.markedPulse*4); if(c.sliced){ g.lineStyle(4,0xffffff,.9*alpha).lineBetween(c.x-Math.cos(c.sliceAngle)*c.r*1.25,c.y-Math.sin(c.sliceAngle)*c.r*1.25,c.x+Math.cos(c.sliceAngle)*c.r*1.25,c.y+Math.sin(c.sliceAngle)*c.r*1.25); } }
  private drawPointerTrail(g:Phaser.GameObjects.Graphics){ const ps=this.pointerState; if(!ps.down||ps.path.length<2) return; for(let i=1;i<ps.path.length;i++){ const p0=ps.path[i-1], p1=ps.path[i], a=i/ps.path.length; const alpha=ps.readyInfo?.type ? .28+a*.72 : ps.hitIds.size>0 ? .12+a*.42 : .16+a*.65; g.lineStyle(3+a*6,0xe6ffff,alpha).lineBetween(p0.x,p0.y,p1.x,p1.y); } const end=ps.path[ps.path.length-1]; g.fillStyle(0xf5ffff,.9).fillCircle(end.x,end.y,5); }
  private drawParticles(g:Phaser.GameObjects.Graphics){ for(const p of this.particles){ const a=clamp(p.life/p.maxLife,0,1); g.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color,a).fillCircle(p.x,p.y,p.size*(.6+a)); } }
  private drawOverlay(g:Phaser.GameObjects.Graphics){ this.overlay.removeAll(true); if(this.state.status==='start') this.drawStartOverlay(g); if(this.state.status==='choice') this.drawChoiceOverlay(g); if(this.state.status==='win'||this.state.status==='lose') this.drawResultOverlay(g); }
  private overlayText(x:number,y:number,text:string,size:number,color:string,style='900',origin=.5){ const t=this.add.text(x,y,text,{fontFamily:'system-ui, sans-serif',fontSize:`${size}px`,fontStyle:style,color,align:'center',wordWrap:{width:470}}).setOrigin(origin).setDepth(40); this.overlay.add(t); return t; }
  private drawStartOverlay(g:Phaser.GameObjects.Graphics){ g.fillStyle(0x000000,.60).fillRect(0,0,W,H); this.overlayText(W/2,188,'SPLITBLADE',40,'#effcff'); this.overlayText(W/2,218,'세로형 RTS 교전 × 원거리 적 무리',15,'rgba(230,250,255,.84)','700'); g.fillStyle(0x0a121c,.88).fillRoundedRect(W/2-205,260,410,116,18); g.lineStyle(2,0x82efff,.7).strokeRoundedRect(W/2-205,260,410,116,18); this.overlayText(W/2,296,'터치 / 클릭 / Space 로 시작',20,'#fff4a8'); this.overlayText(W/2,326,'초반 사격 빈도를 낮췄습니다.\n돌진 베기 중에는 탄환과 근접 공격을 받지 않습니다.',14,'rgba(232,251,255,.78)','600'); this.overlayText(W/2,TOP_H+90,'짧게 스치면 코어는 사라지지 않습니다.',14,'rgba(255,120,140,.85)','600'); }
  private drawChoiceOverlay(g:Phaser.GameObjects.Graphics){ g.fillStyle(0x000000,.35).fillRect(0,0,W,TOP_H); g.fillStyle(0x040911,.88).fillRect(0,TOP_H,W,BOT_H); this.overlayText(W/2,TOP_H+34,'ROGUE PATCH SELECT',22,'#fff1a6'); this.overlayText(W/2,TOP_H+55,'카드 터치 또는 1/2/3. 선택 즉시 전투 재개.',12,'rgba(232,251,255,.78)','600'); for(let i=0;i<3;i++){ const x=36,y=TOP_H+76+i*96,w=W-72,h=82,opt=this.state.choiceOptions[i]; g.fillStyle(0x1e3848,.95).fillRoundedRect(x,y,w,h,14); g.lineStyle(2,0x7febff,.65).strokeRoundedRect(x,y,w,h,14); g.fillStyle(0xffffff,.16).fillCircle(x+32,y+32,20); this.overlayText(x+32,y+39,String(i+1),20,'#fff4a8'); if(opt){ this.overlayText(x+64,y+30,opt.title,15,'#eaffff','900',0); this.overlayText(x+64,y+54,opt.desc,12,'rgba(230,250,255,.78)','600',0); } } }
  private drawResultOverlay(g:Phaser.GameObjects.Graphics){ const win=this.state.status==='win'; g.fillStyle(win?0x031416:0x180409,.76).fillRect(0,0,W,H); this.overlayText(W/2,214,win?'EXTRACTION COMPLETE':'CORE OFFLINE',36,win?'#aaffee':'#ff9aac'); this.overlayText(W/2,248,this.state.resultLine,15,'rgba(238,252,255,.85)','700'); this.overlayText(W/2,292,`SCORE ${this.state.score}   KILLS ${this.state.kills}`,18,'#fff3a8'); this.overlayText(W/2,318,`MAX COMBO x${this.state.maxCombo}   BATTLE ${this.state.battleIndex}`,18,'#fff3a8'); this.overlayText(W/2,362,'터치 / Space / R 로 다시 플레이',15,'rgba(232,251,255,.82)','700'); }
  private updateHudTexts(){ this.hud.timer.setText(String(Math.ceil(Math.max(0,this.state.runTime-this.state.time))).padStart(2,'0')+'s').setVisible(this.state.status!=='start'); this.hud.battle.setText(`BATTLE ${this.state.battleIndex}  ENEMIES ${this.state.battleAlive}/${this.state.battleSize}`).setVisible(this.state.status!=='start'); this.hud.score.setText('K '+this.state.kills+'  S '+this.state.score).setVisible(this.state.status!=='start'); this.hud.combo.setText(this.state.combo>0?'x'+this.state.combo:'').setVisible(this.state.combo>0); this.hud.sense.setText(this.state.slashSenseTime>0&&this.state.slashSenseText?'인식: '+this.state.slashSenseText:''); if(this.state.battleBanner>0){ this.overlayText(W/2,124,this.state.battleBannerText,23,'#fff3a8'); } }
}
