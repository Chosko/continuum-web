import { TimeSpan } from '../../xna';
import { Constants } from '../Utilities/Utilities';

/**
 * Deviation D1: the IsolatedStorage file "scores.xml" (XmlSerializer Score[]) becomes the
 * localStorage key "continuum.scores" holding a JSON array of objects with the same 8 property
 * names as the XML elements (Name, totalHours, totalMinutes, totalSeconds, totalMilliseconds,
 * Day, Month, Year). "File exists" == key present.
 */
const SCORES_KEY = 'continuum.scores';
const memoryStore = new Map<string, string>();

interface SerializedScore {
  Name: string;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  totalMilliseconds: number;
  Day: number;
  Month: number;
  Year: number;
}

function storageRead(): string | null {
  try {
    const v = window.localStorage.getItem(SCORES_KEY);
    if (v !== null) return v;
  } catch {
    /* storage unavailable: fall back to memory */
  }
  return memoryStore.has(SCORES_KEY) ? memoryStore.get(SCORES_KEY)! : null;
}

function storageWrite(text: string): void {
  memoryStore.set(SCORES_KEY, text);
  try {
    window.localStorage.setItem(SCORES_KEY, text);
  } catch {
    /* ignore */
  }
}

function storageDelete(): void {
  memoryStore.delete(SCORES_KEY);
  try {
    window.localStorage.removeItem(SCORES_KEY);
  } catch {
    /* ignore */
  }
}

export class Score {
  /** Name of the player who achieved the score. */
  name = '';
  /** Hours played. */
  totalHours = 0;
  /** Minutes played. */
  totalMinutes = 0;
  /** Seconds played. */
  totalSeconds = 0;
  /** Milliseconds played. */
  totalMilliseconds = 0;
  /** Day the score was achieved. */
  day = 0;
  /** Month the score was achieved. */
  month = 0;
  /** Year the score was achieved. */
  year = 0;

  /**
   * C# overloads: Score() (empty, for serialization), Score(ts) (name "PROSTATA"), Score(ts, Name).
   * @param ts time survived during the game
   */
  constructor(ts?: TimeSpan, name?: string) {
    if (ts === undefined) return;
    this.totalHours = Math.trunc(ts.totalHours);
    this.totalMinutes = ts.minutes;
    this.totalSeconds = ts.seconds;
    this.totalMilliseconds = ts.milliseconds;

    const now = new Date();
    this.day = now.getDate();
    this.month = now.getMonth() + 1;
    this.year = now.getFullYear();
    this.name = name === undefined ? 'PROSTATA' : name;
  }

  toString(): string {
    return (
      this.name + ' ' + this.totalHours.toString() + ':' + this.totalMinutes.toString() + ':' +
      this.totalSeconds.toString() + ' ' + this.day.toString() + '/' + this.month.toString() + '/' +
      this.year.toString()
    );
  }

  /** Compares scores to sort the list: descending by time (longest first). */
  compareTo(obj: unknown): number {
    if (!(obj instanceof Score)) return -1;
    const myS = obj;
    return new TimeSpan(0, myS.totalHours, myS.totalMinutes, myS.totalSeconds, myS.totalMilliseconds).compareTo(
      new TimeSpan(0, this.totalHours, this.totalMinutes, this.totalSeconds, this.totalMilliseconds),
    );
  }

  /** XmlSerializer equivalent (C# property names). */
  private static serialize(scores: Score[]): string {
    const data: SerializedScore[] = scores.map((s) => ({
      Name: s.name,
      totalHours: s.totalHours,
      totalMinutes: s.totalMinutes,
      totalSeconds: s.totalSeconds,
      totalMilliseconds: s.totalMilliseconds,
      Day: s.day,
      Month: s.month,
      Year: s.year,
    }));
    return JSON.stringify(data);
  }

  private static deserialize(text: string): Score[] {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = [];
    }
    if (!Array.isArray(data)) return [];
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);
    return data.map((d: Partial<SerializedScore>) => {
      const s = new Score();
      s.name = typeof d?.Name === 'string' ? d.Name : '';
      s.totalHours = num(d?.totalHours);
      s.totalMinutes = num(d?.totalMinutes);
      s.totalSeconds = num(d?.totalSeconds);
      s.totalMilliseconds = num(d?.totalMilliseconds);
      s.day = num(d?.Day);
      s.month = num(d?.Month);
      s.year = num(d?.Year);
      return s;
    });
  }

  /** IsolatedStorageFile.FileExists("scores.xml") */
  static scoresFileExists(): boolean {
    return storageRead() !== null;
  }

  static readScores(): Score[] | null {
    let scores: Score[] | null = null;
    const text = storageRead();
    if (text !== null) {
      // Read the existing scores
      scores = Score.deserialize(text);
    }
    return scores;
  }

  static writeScores(time: number, name: string): Score[] {
    let scores: Score[];
    const text = storageRead();
    if (text !== null) {
      // Read the existing scores
      scores = Score.deserialize(text);

      // Delete the file to avoid write problems
      storageDelete();

      let tmp: Score[] = scores.slice();
      tmp.push(new Score(TimeSpan.fromSeconds(time), name));

      tmp.sort((a, b) => a.compareTo(b));

      if (tmp.length > Constants.MAX_SCORES) {
        tmp = tmp.slice(0, tmp.length - 1);
      }

      storageWrite(Score.serialize(tmp));
    } else {
      scores = [new Score(TimeSpan.fromSeconds(time), name)];
      storageWrite(Score.serialize(scores));
    }
    return scores;
  }
}
