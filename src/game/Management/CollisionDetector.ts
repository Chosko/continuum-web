import { MathHelper } from '../../xna';
import { Asteroid } from '../Elements/Asteroid';
import { Bullet } from '../Elements/Bullet';
import { Enemy } from '../Elements/Enemy';
import { Chip } from '../Elements/ExplosionParticle';
import { PowerUp } from '../Elements/PowerUp';
import { Tachyon } from '../Elements/Tachyon';
import type { TimeTraveler } from '../Elements/TimeTraveler';
import type { GameState } from '../State/GameState';
import { Constants, LifeState, PowerUpType, Utility } from '../Utilities/Utilities';

/** Sweep-and-prune collision detection and collision responses. */
export class CollisionDetector {
  private gs: GameState;

  constructor(gameState: GameState) {
    this.gs = gameState;
  }

  update(): void {
    const gs = this.gs;
    // Collisions are checked only when not travelling back in time
    if (gs.playerTime.continuum > 0) {
      let i = 0;
      let j = 0;
      gs.collisions.sort();
      for (i = 0; i < gs.collisions.aliveCount && gs.collisions.getElementAt(i) != null; i++) {
        const ei = gs.collisions.getElementAt(i);
        if (this.tryPlayerCollision(ei)) {
          // player collisions
          if (ei instanceof Asteroid) {
            // player vs asteroid
            const temp = Math.trunc(gs.playerLife);
            gs.playerHasCollided(ei.life, 1, 2);
            ei.hasCollided(temp, gs.playerPosition.clone());
          } else if (ei instanceof Enemy) {
            // player vs enemy
            const temp = Math.trunc(gs.playerLife);
            gs.playerHasCollided(ei.life, 1, 1);
            ei.hasCollided(temp, null);
          } else if (ei instanceof Bullet) {
            // player vs bullet: only enemy bullets damage the player
            if (!ei.isPlayerBullet) {
              gs.playerHasCollided(ei.damage, 0, 1);
              ei.hasCollided(0, null);
            }
          } else if (ei instanceof Tachyon) {
            // player vs tachyon
            if (gs.timeTank <= Constants.MAX_TIME_TANK_VALUE) {
              gs.timeTank = MathHelper.clamp(gs.timeTank + Constants.TACHYON_TIME_VALUE, 0, Constants.MAX_TIME_TANK_VALUE);
              ei.hasCollided(0, null);
            }
          } else if (ei instanceof PowerUp) {
            // player vs power-up
            const p = ei;
            switch (p.type) {
              case PowerUpType.GUN:
                gs.playerGun.upgrade(1);
                break;
              case PowerUpType.ROCKET:
                gs.playerRocketLauncher.upgrade(1);
                break;
              case PowerUpType.GRANADE:
                gs.playerGranadeCount += 1;
                break;
              default:
                throw new Error('NotImplementedException: PowerUp non ancora implementato per il CollisionDetector');
            }
            p.hasCollided(0, null);
          }
        }
        j = i + 1;
        // collisions between TimeTravelers
        while (j < gs.collisions.aliveCount && gs.collisions.getElementAt(j).top <= gs.collisions.getElementAt(i).bottom) {
          const a = gs.collisions.getElementAt(i);
          const b = gs.collisions.getElementAt(j);
          if (this.tryCollision(a, b)) {
            if (a instanceof Asteroid) {
              /* asteroid vs asteroid: commented out in the original */
              if (b instanceof Enemy) {
                // asteroid vs enemy
                const temp = a.life;
                a.hasCollided(b.life, b.currentPosition.clone());
                b.hasCollided(temp, null);
              } else if (b instanceof Bullet) {
                // asteroid vs bullet
                a.hasCollided(b.damage, b.currentPosition.clone());
                b.hasCollided(0, null);
              } else if (b instanceof Chip) {
                // asteroid vs explosion particle
                b.hasCollided(a.life, null);
                a.hasCollided(b.damage, b.currentPosition.clone());
              }
            } else if (a instanceof Enemy) {
              if (b instanceof Asteroid) {
                // enemy vs asteroid
                const temp = a.life;
                a.hasCollided(b.life, null);
                b.hasCollided(temp, b.currentPosition.clone());
              } else if (b instanceof Bullet) {
                // enemy vs bullet: only player bullets damage enemies
                if (b.isPlayerBullet) {
                  a.hasCollided(b.damage, null);
                  b.hasCollided(0, null);
                }
              } else if (b instanceof Chip) {
                // enemy vs explosion particle
                b.hasCollided(a.life, null);
                a.hasCollided(b.damage, null);
              }
            } else if (a instanceof Chip) {
              if (b instanceof Asteroid) {
                // chip vs asteroid
                a.hasCollided(b.life, null);
                b.hasCollided(a.damage, b.currentPosition.clone());
              } else if (b instanceof Enemy) {
                // chip vs enemy
                a.hasCollided(b.life, null);
                b.hasCollided(a.damage, null);
              }
            } else if (a instanceof Bullet) {
              if (b instanceof Asteroid) {
                // bullet vs asteroid
                a.hasCollided(0, null);
                b.hasCollided(a.damage, b.currentPosition.clone());
              } else if (b instanceof Enemy) {
                // bullet vs enemy
                if (a.isPlayerBullet) {
                  a.hasCollided(0, null);
                  b.hasCollided(a.damage, null);
                }
              }
              // bullet vs bullet: commented out in the original
            }
          }
          j++;
        }
      }
    }
  }

  tryCollision(a: TimeTraveler, b: TimeTraveler): boolean {
    if (
      a.lifeState === LifeState.DEAD ||
      b.lifeState === LifeState.DEAD ||
      a.lifeState === LifeState.DELETING ||
      b.lifeState === LifeState.DELETING
    )
      return false;
    const A = Utility.newRectangleFromCenterPosition(a.currentPosition, a.width, a.height);
    const B = Utility.newRectangleFromCenterPosition(b.currentPosition, b.width, b.height);
    return A.intersects(B);
  }

  tryPlayerCollision(b: TimeTraveler): boolean {
    if (b.lifeState === LifeState.DEAD || b.lifeState === LifeState.DELETING) return false;
    const A = Utility.newRectangleFromCenterPosition(this.gs.playerPosition, this.gs.playerWidth, this.gs.playerHeight);
    const B = Utility.newRectangleFromCenterPosition(b.currentPosition, b.width, b.height);
    if (A.intersects(B)) return true;
    else return false;
  }
}
