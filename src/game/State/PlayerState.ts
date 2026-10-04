/** Player snapshot (C# struct: use clone() when copying). */
export class PlayerState {
  life: number;
  positionX: number;
  positionY: number;
  toggleGun: boolean;
  timeStamp: number;
  gunLevel: number;
  rocketLauncherLevel: number;
  granades: number;

  constructor(
    positionX = 0,
    positionY = 0,
    life = 0,
    toggleGun = false,
    timeStamp = 0,
    gunLevel = 0,
    rocketLauncherLevel = 0,
    granades = 0,
  ) {
    this.life = life;
    this.positionX = positionX;
    this.positionY = positionY;
    this.toggleGun = toggleGun;
    this.timeStamp = timeStamp;
    this.gunLevel = gunLevel;
    this.rocketLauncherLevel = rocketLauncherLevel;
    this.granades = granades;
  }

  clone(): PlayerState {
    return new PlayerState(
      this.positionX,
      this.positionY,
      this.life,
      this.toggleGun,
      this.timeStamp,
      this.gunLevel,
      this.rocketLauncherLevel,
      this.granades,
    );
  }
}
