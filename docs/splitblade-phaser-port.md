# SplitBlade Phaser Port Notes

This port recreates `splitblade_mvp_v13.html` as a client-only Phaser 3 game mounted inside a Next.js TypeScript app.

## Architecture

- `app/` provides a minimal Next.js shell and responsive mobile cabinet styling.
- `src/components/SplitBladeGame.tsx` is a client component that dynamically imports the Phaser bootstrap in `useEffect`, so Phaser is never evaluated during SSR/prerendering.
- `src/game/SplitBladeGame.ts` creates a 540x960 Phaser game with `FIT` scaling.
- `src/game/GameScene.ts` ports the source MVP's runtime state, wave spawning, enemy AI, chip field, gesture processing, upgrades, HUD, effects, and WebAudio tones.
- `src/game/characterSprites.ts` generates original pixel-art character spritesheets at runtime and registers Phaser animations for the hero plus scout/gunner/raider/brute/warden enemies.
- `src/game/gesture.ts` contains test-covered gesture recognition shared by the scene.

## Gameplay parity targets

The port keeps the original virtual coordinate system and core numeric tuning: 100-second runs, battle waves, scout/gunner/raider/brute/warden enemy stats, hero auto-attack, skill dash targeting by slash direction and length profile, combo/overdrive, XP levels, three-card upgrade choice, chip kinds, glitch penalties, and start/choice/result overlays.

## Known parity limits

The original used direct Canvas 2D drawing with gradients and canvas text. This Phaser port keeps immediate-mode `Graphics` for arenas, UI, projectiles, slash trails, chip shards, and overlays, while character bodies are generated Phaser Sprite/Image objects using original in-code pixel-art spritesheets. Gameplay rules and coordinates are prioritized over exact draw-call parity.

## Visual polish pass

The second pass adds production-style neon panel treatment for the start, upgrade, battle, HUD, and result surfaces. Chip slicing now creates physical shard halves that split along the actual recognized slash angle, fly apart, rotate, fall, fade, and retain chip role colors.

The character sprite pass adds generated hero idle/run/slash/hit animations, enemy idle/move/attack/hit/death variants, dash afterimages, hit flashes, and short dissolve sprites for defeated enemies without importing external copyrighted assets.
