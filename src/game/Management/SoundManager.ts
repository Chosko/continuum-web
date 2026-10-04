import { SoundState, type ContentManager, type SoundEffect, type SoundEffectInstance } from '../../xna';

/**
 * Manages the game's sound effects (static class, Management/SoundManager.cs).
 */
export class SoundManager {
  /** The sound effects */
  private static soundEffects: Map<string, SoundEffect>;

  /** The sound effect instances (the ones actually played) */
  private static soundInstances: Map<string, SoundEffectInstance[]>;

  /** The content manager */
  private static content: ContentManager;

  /** Path of the sounds folder */
  private static path: string;

  /**
   * Initializes the SoundManager.
   * @param contentManager content manager used to load the sounds
   * @param soundFolderPath path of the folder containing the sounds
   */
  static initialize(contentManager: ContentManager, soundFolderPath: string): void {
    SoundManager.soundInstances = new Map<string, SoundEffectInstance[]>();
    SoundManager.soundEffects = new Map<string, SoundEffect>();
    SoundManager.content = contentManager;
    SoundManager.path = soundFolderPath;
  }

  /** Loads a sound (asset name relative to the sounds folder). */
  static loadSound(soundName: string): void {
    if (!SoundManager.soundEffects.has(soundName)) {
      SoundManager.soundEffects.set(soundName, SoundManager.content.load<SoundEffect>(SoundManager.path + soundName));
      SoundManager.soundInstances.set(soundName, []);
    }
  }

  /**
   * Plays a sound. Reuses the first stopped instance, otherwise creates a new one
   * (IsLooped is set only on creation).
   */
  static playSound(soundName: string, volume = 1, isLooped = false, _isMusic = false): void {
    const soundList = SoundManager.soundInstances.get(soundName);
    if (soundList === undefined) throw new Error(`KeyNotFoundException: sound "${soundName}" not loaded`);
    let sound: SoundEffectInstance | null = null;
    for (const s of soundList) {
      if (s.state === SoundState.Stopped) {
        sound = s;
        break;
      }
    }
    if (sound === null) {
      sound = SoundManager.soundEffects.get(soundName)!.createInstance();
      soundList.push(sound);
      sound.isLooped = isLooped;
    }
    sound.volume = volume;
    sound.play();
  }

  /** Stops a sound (only the first instance unless stopAllInstances). */
  static stopSound(soundName: string, stopAllInstances = false): void {
    const list = SoundManager.soundInstances.get(soundName);
    if (list === undefined) throw new Error(`KeyNotFoundException: sound "${soundName}" not loaded`);
    for (const s of list) {
      s.stop();
      if (!stopAllInstances) break;
    }
  }

  /** Stops every sound. */
  static stopAllSounds(): void {
    for (const list of SoundManager.soundInstances.values()) {
      for (const s of list) {
        s.stop();
      }
    }
  }
}
