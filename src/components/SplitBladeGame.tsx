'use client';

import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';

export default function SplitBladeGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;

    void import('../game/SplitBladeGame').then(({ createSplitBladeGame }) => {
      if (cancelled || !mountRef.current) return;
      game = createSplitBladeGame(mountRef.current);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={mountRef} className="gameMount" />;
}
