import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from './api.service';
import { UserService } from './user';
import { BehaviorSubject } from 'rxjs';

const LAST_PLAYED_KEY = 'last_played_tracks';

@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private _storageReady = false;

  // single shared audio element
  private audio: HTMLAudioElement | null = null;
  private _currentPreviewUrl = new BehaviorSubject<string | null>(null);
  private _isPlaying = new BehaviorSubject<boolean>(false);
  private _progress = new BehaviorSubject<number>(0);

  // exposed observables
  currentPreviewUrl$ = this._currentPreviewUrl.asObservable();
  isPlaying$ = this._isPlaying.asObservable();
  progress$ = this._progress.asObservable();

  // internal handlers so we can remove them
  private _timeHandler: ((this: HTMLAudioElement, ev: Event) => any) | null = null;
  private _endedHandler: ((this: HTMLAudioElement, ev: Event) => any) | null = null;
  private _errorHandler: ((this: HTMLAudioElement, ev: Event) => any) | null = null;
  // candidate preview URLs (variants of host) to try if one fails
  private _previewCandidates: string[] = [];
  private _candidateIndex = 0;

  constructor(private storage: Storage, private api: ApiService, private userService: UserService) {
    this.init();
  }

  private async init() {
    try {
      await this.storage.create();
    } catch (e) {}
    this._storageReady = true;
  }

  /** Play or toggle a preview. If a different url is playing, stops it first. */
  async playPreview(previewUrl: string, track?: any): Promise<void> {
    if (!previewUrl) return;

    // Normalize Deezer preview URLs to a public cdns endpoint (avoid tokenized cdnt links that 403)
    const normalizedUrl = this.normalizePreviewUrl(previewUrl);
    try { console.info('[Playback] preview URL', { original: previewUrl, normalized: normalizedUrl }); } catch (_) {}

    // Build candidates from the original URL to maximize chance of a playable host
    this._previewCandidates = this.buildPreviewCandidates(previewUrl);
    this._candidateIndex = 0;

    // if same url, resume
    if (this._currentPreviewUrl.value === normalizedUrl && this.audio) {
      try {
        await this.audio.play();
        this._isPlaying.next(true);
      } catch (e) {
        this._isPlaying.next(false);
        throw e;
      }
      return;
    }

    // start new: stop previous
    this.stop();

    this.audio = new Audio(this._previewCandidates[0]);
    this.audio.preload = 'auto';
    try { this.audio.crossOrigin = 'anonymous'; } catch (e) {}

  // Candidates disabled: use the URL as provided by API to match mobile behavior

    this._timeHandler = () => {
      if (this.audio && this.audio.duration && !isNaN(this.audio.duration)) {
        const p = Math.round((this.audio.currentTime / this.audio.duration) * 100);
        this._progress.next(p);
      }
    };
    this._endedHandler = () => {
      this._isPlaying.next(false);
      this._progress.next(0);
      this._currentPreviewUrl.next(null);
    };
    // Keep error handler minimal; sequential fallback will be handled below
    this._errorHandler = () => {
      try {
        if (!this.audio) return;
        const err: any = (this.audio as any).error;
        const code = err?.code;
        const codeMap: any = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' };
        console.warn('[Playback] audio error', { code, label: codeMap[code], src: this.audio.currentSrc });
      } catch {}
      this._isPlaying.next(false);
    };

    this.audio.addEventListener('timeupdate', this._timeHandler);
    this.audio.addEventListener('ended', this._endedHandler);
    this.audio.addEventListener('error', this._errorHandler);

    // attempt to play candidates sequentially to avoid race conditions
    let lastError: any = null;
    for (let i = 0; i < this._previewCandidates.length; i++) {
      this._candidateIndex = i;
      const src = this._previewCandidates[i];
      try {
        if (!this.audio) {
          this.audio = new Audio(src);
          this.audio.preload = 'auto';
          try { this.audio.crossOrigin = 'anonymous'; } catch {}
          this.audio.addEventListener('timeupdate', this._timeHandler!);
          this.audio.addEventListener('ended', this._endedHandler!);
          this.audio.addEventListener('error', this._errorHandler!);
        } else {
          this.audio.src = src;
        }
        await this.audio.play();
        this._currentPreviewUrl.next(src);
        this._isPlaying.next(true);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        continue;
      }
    }
    if (lastError) {
      this._isPlaying.next(false);
      this._progress.next(0);
      this._currentPreviewUrl.next(null);
      throw lastError;
    }

    // record last played if track provided
    try { if (track) await this.addLastPlayed(track); } catch (e) { }
  }

  /** Toggle preview: pause if playing same, otherwise play the provided url */
  async togglePreview(previewUrl: string, track?: any) {
    if (!previewUrl) return;
    const normalizedUrl = this.normalizePreviewUrl(previewUrl);
    if (this.urlsMatch(this._currentPreviewUrl.value, normalizedUrl) && this._isPlaying.value && this.audio) {
      try { this.audio.pause(); } catch (e) {}
      this._isPlaying.next(false);
      return;
    }
    if (this.urlsMatch(this._currentPreviewUrl.value, normalizedUrl) && !this._isPlaying.value && this.audio) {
      try { await this.audio.play(); this._isPlaying.next(true); } catch (e) { this._isPlaying.next(false); throw e; }
      return;
    }
    // different url
    await this.playPreview(normalizedUrl, track);
  }

  pause() {
    if (this.audio) {
      try { this.audio.pause(); } catch (e) {}
      this._isPlaying.next(false);
    }
  }

  stop() {
    if (this.audio) {
      try { this.audio.pause(); } catch (e) {}
      try {
        if (this._timeHandler) this.audio.removeEventListener('timeupdate', this._timeHandler as any);
        if (this._endedHandler) this.audio.removeEventListener('ended', this._endedHandler as any);
        if (this._errorHandler) this.audio.removeEventListener('error', this._errorHandler as any);
      } catch (e) {}
      this.audio = null;
    }
    this._isPlaying.next(false);
    this._progress.next(0);
    this._currentPreviewUrl.next(null);
  }

  /** Adiciona uma faixa como última ouvida (mantém somente os últimos 10) */
  async addLastPlayed(track: any) {
    if (!this._storageReady) await this.init();
    if (!track) return;
    const list: any[] = (await this.storage.get(LAST_PLAYED_KEY)) || [];
    const idOrPreview = (track?.id !== undefined && track?.id !== null) ? track.id : track?.preview;
    const filtered = list.filter(t => {
      const existing = (t?.id !== undefined && t?.id !== null) ? t.id : t?.preview;
      return existing !== idOrPreview;
    });
    filtered.unshift(track);
    const trimmed = filtered.slice(0, 10);
    await this.storage.set(LAST_PLAYED_KEY, trimmed);
  }

  /** Retorna as últimas ouvidas */
  async getLastPlayed(): Promise<any[]> {
    if (!this._storageReady) await this.init();
    return (await this.storage.get(LAST_PLAYED_KEY)) || [];
  }

  /** Sugestões simples: por enquanto usamos as populares como fallback */
  async getSuggestions(): Promise<any[]> {
    try {
      const popular = await this.api.getPopularTracks();
      return Array.isArray(popular) ? popular.slice(0, 8) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Normalize Deezer preview URLs:
   * - Force https
   * - Convert tokenized cdnt-preview API links (which often 403) to public cdns-preview stream links
   */
  private normalizePreviewUrl(url: string): string {
    if (!url) return url;
    let out = url.trim();
    // ensure https
    out = out.replace(/^http:\/\//i, 'https://');

    try {
      const u = new URL(out);
      // Do not rewrite host: mobile devices often resolve and authorize the original host correctly.
      // Only enforce https.
      return u.toString();
    } catch {
      // if URL parsing fails, fallback to original with https enforced
      return out;
    }
  }

  // Public helper for components to check if a preview URL is the current one
  isCurrent(url: string | null | undefined): boolean {
    if (!url) return false;
    return this.urlsMatch(this._currentPreviewUrl.value, this.normalizePreviewUrl(url));
  }

  // Compare two URLs after canonicalization (normalize host variants)
  private urlsMatch(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    return this.canonicalUrl(a) === this.canonicalUrl(b);
  }

  private canonicalUrl(u: string): string {
    try {
      const x = new URL(u.replace(/^http:\/\//i, 'https://'));
      // normalize host: cdn-/cdns-/cdnt- -> cdns-
      x.hostname = x.hostname.replace(/^cdnt-/i, 'cdns-').replace(/^cdn-/i, 'cdns-');
      // drop trailing query/hash for comparison
      x.search = '';
      x.hash = '';
      return x.toString();
    } catch {
      return (u || '').replace(/^http:\/\//i, 'https://');
    }
  }

  /** Build list of alternate hosts for Deezer preview (handles cdn/cdns/cdnt variants) */
  private buildPreviewCandidates(original: string): string[] {
    if (!original) return [];
    const list: string[] = [];
    const ensureHttps = (u: string) => u.replace(/^http:\/\//i, 'https://');
    const pushUnique = (u: string) => { if (u && !list.includes(u)) list.push(u); };
    try {
      const urlObj = new URL(ensureHttps(original));
      const host = urlObj.hostname;
      const baseHosts = [host,
        host.replace(/^cdnt-/i, 'cdns-'),
        host.replace(/^cdn-/i, 'cdns-'),
        host.replace(/^cdns-/i, 'cdn-'),
        host.replace(/^cdns-/i, 'cdnt-')
      ];
      baseHosts.forEach(h => {
        if (!h || h === host) return pushUnique(urlObj.toString());
        const clone = new URL(urlObj.toString());
        clone.hostname = h;
        pushUnique(clone.toString());
      });
    } catch {
      pushUnique(ensureHttps(original));
    }

    // For legacy preview URLs served from /api/.../<hash>.mp3, add /stream/c-<hash> variants
    const streamSuffixes = ['', '-128', '-64', '-48', '-4'];
    const extra: string[] = [];
    list.forEach(candidate => {
      try {
        const parsed = new URL(candidate);
        if (!/\/api\//i.test(parsed.pathname)) return;
        const last = parsed.pathname.split('/').pop() || '';
        const match = last.match(/^([a-f0-9]+)(?:\.(mp3|aac))$/i);
        if (!match) return;
        const hash = match[1];
        const ext = (match[2] || 'mp3').toLowerCase();
        streamSuffixes.forEach(suffix => {
          const clone = new URL(parsed.toString());
          clone.pathname = `/stream/c-${hash}${suffix}.${ext}`;
          extra.push(clone.toString());
        });
      } catch { /* ignore */ }
    });
    extra.forEach(pushUnique);

    return list.length ? list : [ensureHttps(original)];
  }

}
