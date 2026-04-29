# Combo Multi-Core Depth Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chained combo and multi-core cut feedback while ensuring battle banners/HUD render above characters in SplitBlade.

**Architecture:** Introduce small pure helpers for feedback labels and explicit depth constants, covered by Vitest tests. Refactor `GameScene` rendering into world, FX, HUD, and overlay graphics layers so y-sorted character sprites remain below HUD/overlays. Add aggregate float text for combo/core cuts while preserving per-core shards and glitch warning priority.

**Tech Stack:** Next.js, Phaser 3, TypeScript, Vitest.

---

### Task 1: Depth constants and feedback helpers
**Files:** `src/game/constants.ts`, `src/game/feedback.ts`, `tests/feedback.test.ts`
- [ ] Write failing tests for depth ordering and label formatting.
- [ ] Implement `DEPTH` constants and `comboFeedbackText` / `multiCoreFeedbackText` helpers.
- [ ] Run targeted tests.

### Task 2: Layer `GameScene` rendering
**Files:** `src/game/GameScene.ts`
- [ ] Add `hudG` and `overlayG` graphics layers.
- [ ] Set depths for world, character y-sort base/range, FX, pointer, HUD, floating text, overlays.
- [ ] Move HUD bars and overlay panels/battle banner off world graphics.
- [ ] Ensure character/death sprite cleanup still runs on reset/shutdown.

### Task 3: Combo and multi-core feedback
**Files:** `src/game/GameScene.ts`
- [ ] In `processGesture`, aggregate good/glitch counts.
- [ ] Show `CHAIN xN` / `COMBO xN` / `PERFECT CUT` near lower combat-safe HUD.
- [ ] Show `N CORES CUT` for multiple good cores.
- [ ] Keep `GLITCH` warnings above aggregate feedback.

### Task 4: Verification and publish
**Files:** all changed files
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Commit with conventional message referencing issue scope.
- [ ] Push branch and create draft PR against `main`.
