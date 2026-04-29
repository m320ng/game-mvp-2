# SplitBlade Phaser Port Notes

This port recreates `splitblade_mvp_v13.html` as a client-only Phaser 3 game mounted inside a Next.js TypeScript app.

## Architecture

- `app/` provides a minimal Next.js shell and responsive mobile cabinet styling.
- `src/components/SplitBladeGame.tsx` is a client component that dynamically imports the Phaser bootstrap in `useEffect`, so Phaser is never evaluated during SSR/prerendering.
- `src/game/SplitBladeGame.ts` creates a 540x960 Phaser game with `FIT` scaling.
- `src/game/GameScene.ts` ports the source MVP's runtime state, wave spawning, enemy AI, chip field, gesture processing, upgrades, HUD, effects, and WebAudio tones.
- `src/game/gesture.ts` contains test-covered gesture recognition shared by the scene.

## Gameplay parity targets

The port keeps the original virtual coordinate system and core numeric tuning: 100-second runs, battle waves, scout/gunner/raider/brute/warden enemy stats, hero auto-attack, skill dash targeting by slash direction and length profile, combo/overdrive, XP levels, three-card upgrade choice, chip kinds, glitch penalties, and start/choice/result overlays.

## Known parity limits

The original used direct Canvas 2D drawing with gradients, pixel-art sprite routines, and canvas text. This Phaser port uses immediate-mode `Graphics` plus Phaser text objects, so some sprite silhouettes, gradients, and glow/shadow effects are approximations. Gameplay rules and coordinates are prioritized over exact draw-call parity.
