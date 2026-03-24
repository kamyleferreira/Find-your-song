import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { UserService } from './user';
import { AuthService } from './auth';

const FAVORITES_KEY = 'favorite_tracks';

type StoredFavorite = {
  id?: string | number | null;
  preview?: string | null;
  title?: string;
  artist?: string;
  cover?: string;
  [key: string]: unknown;
};

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private ready = false;
  private reconciledUserId: string | null = null;

  constructor(
    private storage: Storage,
    private userService: UserService,
    private authService: AuthService
  ) {
    this.init();
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.syncLocalToRemote(user.uid).catch(() => {});
      }
    });
  }

  private async init() {
    try { await this.storage.create(); } catch {}
    this.ready = true;
  }

  async getFavorites(): Promise<any[]> {
    if (!this.ready) await this.init();
    const stored = await this.storage.get(FAVORITES_KEY) as StoredFavorite[] | undefined;
    const localList: StoredFavorite[] = Array.isArray(stored) ? stored.filter((item: StoredFavorite) => this.hasValidKey(item)) : [];
    const user = this.authService.getUser();
    if (user) {
      const remote = await this.userService.getFavoritesList() as StoredFavorite[];
      const merged = this.mergeFavorites(localList, remote);
      await this.storage.set(FAVORITES_KEY, merged);
      return merged.map(item => this.cloneTrack(item));
    }
    await this.storage.set(FAVORITES_KEY, localList);
    return localList.map(item => this.cloneTrack(item));
  }

  async addFavorite(track: any) {
    if (!track) return;
    if (!this.ready) await this.init();
    const stored = (await this.storage.get(FAVORITES_KEY)) as StoredFavorite[] | undefined;
    const list: StoredFavorite[] = Array.isArray(stored) ? stored.filter((item: StoredFavorite) => this.hasValidKey(item)) : [];
    const key = this.keyOf(track);
    if (!key) return;
    if (!list.find(t => this.keyOf(t) === key)) {
      list.unshift(this.cloneTrack(track) as StoredFavorite);
      await this.storage.set(FAVORITES_KEY, list);
      try { await this.userService.addFavorite(track); } catch {}
    }
  }

  async removeFavorite(trackId: any) {
    if (!this.ready) await this.init();
    const stored = (await this.storage.get(FAVORITES_KEY)) as StoredFavorite[] | undefined;
    const list: StoredFavorite[] = Array.isArray(stored) ? stored.filter((item: StoredFavorite) => this.hasValidKey(item)) : [];
    const filtered = list.filter((t: StoredFavorite) => this.keyOf(t) !== String(trackId));
    await this.storage.set(FAVORITES_KEY, filtered);
    try { await this.userService.removeFavorite(trackId); } catch {}
  }

  async isFavorite(trackId: any): Promise<boolean> {
    if (!this.ready) await this.init();
    const list: any[] = (await this.storage.get(FAVORITES_KEY)) || [];
    const key = String(trackId);
    return list.some(t => this.keyOf(t) === key);
  }

  private keyOf(t: StoredFavorite): string {
    const id = t?.id;
    const preview = t?.preview;
    if (id !== undefined && id !== null && String(id).trim() !== '') {
      return String(id);
    }
    if (preview !== undefined && preview !== null && String(preview).trim() !== '') {
      return String(preview);
    }
    return '';
  }

  private hasValidKey(t: StoredFavorite): boolean {
    return !!this.keyOf(t);
  }

  private mergeFavorites(local: StoredFavorite[], remote: StoredFavorite[]): StoredFavorite[] {
    const map = new Map<string, StoredFavorite>();
    for (const item of local) {
      const key = this.keyOf(item);
      if (key) map.set(key, this.cloneTrack(item) as StoredFavorite);
    }
    for (const item of remote) {
      const key = this.keyOf(item);
      if (key && !map.has(key)) {
        map.set(key, this.cloneTrack(item) as StoredFavorite);
      } else if (key) {
        map.set(key, this.cloneTrack(item) as StoredFavorite);
      }
    }
    return Array.from(map.values());
  }

  private async syncLocalToRemote(userId: string) {
    if (!this.ready) await this.init();
    if (this.reconciledUserId === userId) return;
    const stored = await this.storage.get(FAVORITES_KEY) as StoredFavorite[] | undefined;
    const localList: StoredFavorite[] = Array.isArray(stored) ? stored.filter((item: StoredFavorite) => this.hasValidKey(item)) : [];
    if (!localList.length) {
      this.reconciledUserId = userId;
      return;
    }
    for (const item of localList) {
      try { await this.userService.addFavorite(item); } catch {}
    }
    await this.storage.set(FAVORITES_KEY, localList);
    this.reconciledUserId = userId;
  }

  private cloneTrack<T>(track: T): T {
    try { return track ? JSON.parse(JSON.stringify(track)) : track; } catch { return track; }
  }
}
