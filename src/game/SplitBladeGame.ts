import * as Phaser from 'phaser';
import { W, H } from './constants';
import { GameScene } from './GameScene';

export function createSplitBladeGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: '#06080f',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: W,
      height: H,
    },
    input: { activePointers: 2 },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    audio: { disableWebAudio: false },
  });
}
