import { MathHelper, Vector2 } from '../../xna';
import { Constants, LifeState, TimeState } from '../Utilities/Utilities';
import { PlayerState } from '../State/PlayerState';
import type { GameState } from '../State/GameState';
import type { InputManager } from '../Management/InputManager';

/** The player: movement, weapons, life regeneration, 33 ms snapshots and their rewind. */
export class Player {
  gs!: GameState;
  interpolationA: Vector2 = new Vector2();
  interpolationB: Vector2 = new Vector2();
  timeinterpolation = 0;
  deathTime = 0;

  textureIndex = 0;

  constructor();
  constructor(gs: GameState);
  constructor(gs?: GameState) {
    if (gs === undefined) return;
    this.gs = gs;
    this.interpolationA = new Vector2();
    this.interpolationB = new Vector2();
    this.deathTime = 0;
  }

  update(input: InputManager): void {
    const gs = this.gs;
    this.updatePlayerState();

    if (gs.playerTime.continuum >= 0) {
      if (gs.playerLifeState === LifeState.DEAD) {
        if (this.deathTime > gs.timeTank)
          gs.playerLifeState = LifeState.DELETING; // the player has been dead for too long: the game must end
        else {
          this.deathTime += gs.playerTime.elapsedContinuumTime;
        }
      } else {
        this.deathTime = 0;
        if (gs.damageTimer >= 0) gs.damageTimer -= gs.playerTime.elapsedContinuumTime;
        else {
          gs.playerLife += gs.playerTime.elapsedContinuumTime * Constants.PLAYER_LIFE_RISING_INCREMENT;
        }

        // (smoke update is commented out in the original: no smoke with the new graphics)

        // POSITION UPDATE
        gs.playerPosition.x = MathHelper.clamp(
          gs.playerPosition.x + input.accelerometerReadingCorrected.x * 800 * gs.playerTime.elapsedContinuumTime,
          0,
          Constants.SCREEN_WIDTH,
        );
        gs.playerPosition.y = MathHelper.clamp(
          gs.playerPosition.y - input.accelerometerReadingCorrected.y * 800 * gs.playerTime.elapsedContinuumTime,
          0,
          Constants.SCREEN_HEIGHT,
        );

        // WEAPONS UPDATE
        if (gs.toggleGun) {
          gs.playerGun.update(gs.playerPosition);
          gs.playerRocketLauncher.update(gs.playerPosition);
        }
      }

      // A new state every 33 milliseconds OF THE TIMEMACHINE
      if (gs.playerStates.count === 0 || gs.playerTime.time * 1000 - gs.playerStates.first!.value.timeStamp * 1000 >= 33)
        gs.playerStates.addFirst(
          new PlayerState(
            gs.playerPosition.x,
            gs.playerPosition.y,
            gs.playerLife,
            gs.toggleGun,
            gs.playerTime.time,
            gs.playerGun.level,
            gs.playerRocketLauncher.level,
            gs.playerGranadeCount,
          ),
        );

      // Delete the oldest state if it is older than timeTank.
      if (gs.playerTime.time - gs.playerStates.last!.value.timeStamp > gs.timeTank) gs.playerStates.removeLast();

      this.interpolationA = gs.playerPosition.clone();
      if (gs.playerStates.first !== null) {
        this.interpolationB.x = gs.playerStates.first.value.positionX;
        this.interpolationB.y = gs.playerStates.first.value.positionY;
        this.timeinterpolation = (gs.playerTime.time - gs.playerStates.first.value.timeStamp) * 1000;
      }
    } else {
      if (gs.timeTank > 0) {
        // These two lines avoid the player not being able to shoot for a few seconds after going back in time.
        gs.playerGun.update(gs.playerPosition);
        gs.playerRocketLauncher.update(gs.playerPosition);

        // (rewind smoke is commented out in the original)

        if (gs.playerStates.count > 0) {
          const first = gs.playerStates.first!;
          // Consume the state at the right moment
          if (gs.playerTime.time <= first.value.timeStamp) {
            if (first.next !== null)
              this.timeinterpolation = -(first.next.value.timeStamp - first.value.timeStamp) * 1000;

            gs.playerPosition.x = first.value.positionX;
            gs.playerPosition.y = first.value.positionY;
            gs.playerLife = first.value.life;
            gs.playerGun.level = first.value.gunLevel;
            gs.playerRocketLauncher.level = first.value.rocketLauncherLevel;
            gs.toggleGun = first.value.toggleGun;
            gs.playerGranadeCount = first.value.granades;

            gs.playerStates.removeFirst();

            if (gs.playerStates.first !== null) {
              this.interpolationA = gs.playerPosition.clone();
              this.interpolationB.x = gs.playerStates.first.value.positionX;
              this.interpolationB.y = gs.playerStates.first.value.positionY;
            }
          } else {
            if (gs.playerStates.first !== null) {
              const amount = (gs.playerTime.time * 1000 - gs.playerStates.first.value.timeStamp * 1000) / this.timeinterpolation;
              gs.playerPosition = Vector2.lerp(this.interpolationB, this.interpolationA, amount);
            }
          }
        }
      }
    }
  }

  private updatePlayerState(): void {
    const gs = this.gs;
    if (gs.playerLifeState !== LifeState.DELETING) {
      if (gs.playerLife > Constants.PLAYER_LIFE_CRITICAL_VALUE) gs.playerLifeState = LifeState.NORMAL;
      else if (gs.playerLife > 0 && gs.playerLife <= Constants.PLAYER_LIFE_CRITICAL_VALUE) gs.playerLifeState = LifeState.DAMAGED;
      else if (gs.playerLife === 0 && gs.playerLifeState !== LifeState.DEAD && (gs.playerLifeState as LifeState) !== LifeState.DELETING) {
        gs.newExplosion(gs.playerPosition.clone());
        gs.playerLifeState = LifeState.DEAD;
        gs.timeState = TimeState.FORWARD; // raw write, bypasses TimeManager.State
      }
    }
  }
}
