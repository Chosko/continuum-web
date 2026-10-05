import type { BackgroundTexture } from '../Elements/BackgroundTexture';
import type { GameState } from '../State/GameState';
import { ElementRecord } from '../Utilities/ElementRecord';
import { LinkedList } from '../Utilities/LinkedList';
import { LifeState, type RewindMethod } from '../Utilities/Utilities';

/** Background layer slots, replacement logic and its own rewind journal. */
export class BackgroundManager {
  private gs: GameState;
  /** C# BackgroundLevels { get; private set; } */
  backgroundLevels: (BackgroundTexture | null)[];
  private elementRecords: LinkedList<ElementRecord>;

  constructor(gameState: GameState, numberOfLevels: number) {
    this.gs = gameState;
    this.backgroundLevels = new Array<BackgroundTexture | null>(numberOfLevels).fill(null);
    this.elementRecords = new LinkedList<ElementRecord>();
  }

  update(): void {
    const gs = this.gs;
    if (!gs.pause) {
      const temp: BackgroundTexture[] = [];

      // C# 4 foreach: `x` is ONE variable shared by the whole loop, so the rewind lambda below sees
      // the last background enumerated in this update() call. `loopX` reproduces that capture.
      let loopX: BackgroundTexture | undefined;
      for (const x of gs.backgrounds) {
        loopX = x;
        x.update();

        if (gs.levelTime.continuum > 0) {
          const targetLevel = this.backgroundLevels[x.level];
          const hasTransition = x.transitionTextureIndex !== null;

          if (targetLevel !== x) {
            if (targetLevel !== null && targetLevel !== undefined && targetLevel.lifeState !== LifeState.DEAD) {
              if (targetLevel.lifeState !== LifeState.BEINGREPLACED && x.startTime >= targetLevel.startTime) {
                if (hasTransition) targetLevel.replacing(x.transitionTextureIndex!);
                else targetLevel.replacing(x.textureIndex);
              }
            } else {
              this.addElementRecord(
                (value) => (this.backgroundLevels[loopX!.level] = value as BackgroundTexture | null),
                this.backgroundLevels[x.level] ?? null,
              );
              this.backgroundLevels[x.level] = x;
              x.start();
              x.update();
            }
          }
        }

        if (x.lifeState === LifeState.DELETING) {
          temp.push(x);
        }
      }

      for (let i = 0; i < temp.length; i++) {
        gs.backgrounds.remove(temp[i]);
      }

      if (this.elementRecords.last !== null && gs.levelTime.time - this.elementRecords.last.value.time > gs.timeTank)
        this.elementRecords.removeLast();

      while (this.elementRecords.first !== null && this.elementRecords.first.value.time > gs.levelTime.time) {
        this.elementRecords.first.value.rewind();
        this.elementRecords.removeFirst();
      }
    }
  }

  addElementRecord(rewind: RewindMethod, value: unknown): void {
    this.elementRecords.addFirst(new ElementRecord(this.gs.levelTime.time, rewind, value));
  }
}
