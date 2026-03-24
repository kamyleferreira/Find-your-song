import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

interface StoredSearch {
  q: string; // original query
  nq: string; // normalized query
  ts: number; // timestamp
  results: any[]; // subset of results (we store minimal track info)
}

const SEARCH_HISTORY_KEY = 'search_history_v1';
const MAX_HISTORY = 30; // keep last 30 searches

@Injectable({ providedIn: 'root' })
export class SearchHistoryService {
  private ready = false;

  constructor(private storage: Storage) {
    this.init();
  }

  private async init() {
    try { await this.storage.create(); } catch {}
    this.ready = true;
  }

  private normalize(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ') // collapse spaces
      .trim();
  }

  async record(query: string, results: any[]) {
    if (!query || !results || results.length === 0) return;
    if (!this.ready) await this.init();
    const history: StoredSearch[] = (await this.storage.get(SEARCH_HISTORY_KEY)) || [];
    const nq = this.normalize(query);
    // store only minimal subset of track fields to keep size small
    const compact = results.slice(0, 25).map(r => ({
      id: r?.id || r?.preview,
      title: r?.title || r?.title_short || r?.name,
      artist: r?.artist?.name || r?.artist || r?.artist_name,
      preview: r?.preview,
      album: r?.album?.title || r?.album?.name,
      cover: r?.album?.cover_medium || r?.album?.cover || r?.cover_medium || r?.cover || r?.picture
    }));
    history.unshift({ q: query, nq, ts: Date.now(), results: compact });
    const trimmed = history.slice(0, MAX_HISTORY);
    await this.storage.set(SEARCH_HISTORY_KEY, trimmed);
  }

  async getRelated(query: string): Promise<any[]> {
    if (!query) return [];
    if (!this.ready) await this.init();
    const history: StoredSearch[] = (await this.storage.get(SEARCH_HISTORY_KEY)) || [];
    if (history.length === 0) return [];
    const nq = this.normalize(query);
    if (nq.length < 3) return []; // require minimum length

    // similarity rules: substring match OR Levenshtein distance <=2 for short tokens
    const tokens = nq.split(' ').filter(t => t.length > 1);

    function lev(a: string, b: string): number {
      const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
      for (let i = 0; i <= a.length; i++) m[i][0] = i;
      for (let j = 0; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
        }
      }
      return m[a.length][b.length];
    }

    const seen = new Set<string>();
    const related: any[] = [];

    for (const entry of history) {
      for (const track of entry.results) {
        const tTitle = this.normalize(track.title || '');
        const tArtist = this.normalize(track.artist || '');
        let match = false;
        if (tTitle.includes(nq) || tArtist.includes(nq)) match = true;
        else {
          // token-level fuzzy
          for (const token of tokens) {
            if (tTitle.includes(token) || tArtist.includes(token)) { match = true; break; }
            // fuzzy: distance <=2 for tokens length >=4
            if (token.length >= 4) {
              const parts = tTitle.split(' ');
              for (const p of parts) {
                if (Math.abs(p.length - token.length) <= 2 && lev(p, token) <= 2) { match = true; break; }
              }
              if (match) break;
            }
          }
        }
        if (match) {
          const id = track.id || track.preview || tTitle + tArtist;
          if (!seen.has(id)) {
            seen.add(id);
            related.push(track);
            if (related.length >= 24) break; // limit size
          }
        }
      }
      if (related.length >= 24) break;
    }
    return related;
  }
}
