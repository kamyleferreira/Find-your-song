import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  // usar proxy em desenvolvimento: /api -> https://api.deezer.com
  private apiURL = '/api';
  private readonly useJsonpOnly = Capacitor.isNativePlatform();
  // keep a small set of message keys we've already logged in detail to avoid flooding the console
  private _loggedDebugMessages = new Set<string>();
  // track in-flight requests by URL so duplicate concurrent calls are deduplicated
  private _inFlightRequests = new Map<string, Promise<any>>();
  // simple short-term cache and rate-limit per URL to defend against floods
  private _cacheTextResponses = new Map<string, { ts: number; text: string }>();
  private _lastRequestTs = new Map<string, number>();
  private readonly _MIN_INTERVAL_MS = 1500; // minimum time between requests to same URL
  private readonly _CACHE_TTL_MS = 5000; // keep response cached for a short time
  // additional global/host rate limits to avoid bursts across different URLs
  private _lastGlobalTs = 0;
  private _lastHostTs = new Map<string, number>();
  private readonly _GLOBAL_MIN_INTERVAL_MS = 250; // min gap between ANY two HTTP calls
  private readonly _HOST_MIN_INTERVAL_MS = 500;   // min gap between calls to same host
  // cache popular tracks for a longer duration to avoid repeated chart requests
  private _popularCache: { ts: number; data: any[] } | null = null;
  private readonly _POPULAR_CACHE_MS = 30_000; // 30s

  constructor(private http: HttpClient) {}

  private debugOnce(key: string, ...args: any[]) {
    try {
      if (this._loggedDebugMessages.has(key)) return;
      this._loggedDebugMessages.add(key);
      console.debug(...args);
    } catch (e) {
      // ignore
    }
  }

  async getPopularTracks(): Promise<any[]> {
    const LIMIT = 100; // number of popular tracks to request
    try {
      if (this.useJsonpOnly) {
        const jp = await this.requestJsonp(`https://api.deezer.com/chart/0/tracks?limit=${LIMIT}&output=jsonp`);
        const data = Array.isArray(jp?.data) ? jp.data : (Array.isArray(jp) ? jp : []);
        const norm = (data || []).map((t: any) => this.sanitizeTrack(t));
        this._popularCache = { ts: Date.now(), data: norm };
        return norm;
      }
      // return cached popular tracks if recent to avoid frequent chart calls
      if (this._popularCache && (Date.now() - this._popularCache.ts) < this._POPULAR_CACHE_MS) {
        return this._popularCache.data;
      }
      // algumas respostas do proxy/deezer podem vir em texto/JSONP; buscar como text e depois parsear
        // Request more items from the Deezer chart
        const url = `${this.apiURL}/chart/0/tracks?limit=${LIMIT}`;
  const text: any = await this.requestText(url);
      // tentar parsear JSON direto
      let res: any = null;
      try {
        res = JSON.parse(text);
      } catch (e) {
        // tentar extrair objeto JSON dentro de callback JSONP
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const inside = text.slice(firstBrace, lastBrace + 1);
          try {
            res = JSON.parse(inside);
          } catch (e2) {
            // detailed debug information (only log once per session to avoid flooding)
            this.debugOnce('getPopularTracks:failed-parse', 'ApiService.getPopularTracks: failed to parse JSON from text response (first 1000 chars):', text.slice(0, 1000));
            // fallback to JSONP if parsing failed
            try { res = await this.requestJsonp(`https://api.deezer.com/chart/0/tracks?limit=${LIMIT}&output=jsonp`); }
            catch (jpErr) { throw e2; }
          }
        } else {
          this.debugOnce('getPopularTracks:unexpected-nonjson', 'ApiService.getPopularTracks: unexpected non-JSON response (first 1000 chars):', text.slice(0, 1000));
          // fallback to JSONP when proxy returns HTML or other non-JSON
          try { res = await this.requestJsonp(`https://api.deezer.com/chart/0/tracks?limit=${LIMIT}&output=jsonp`); }
          catch (jpErr) { throw e; }
        }
      }
      // normaliza a resposta para sempre retornar um array de faixas
      if (!res || Object.keys(res).length === 0) {
        // fallback to JSONP if proxy is missing or returning empty
        const jp = await this.requestJsonp('https://api.deezer.com/chart/0/tracks?output=jsonp');
        res = jp || res;
      }
      const normalizeList = (arr: any[]): any[] => (arr || []).map(t => this.sanitizeTrack(t));
      if (Array.isArray(res)) return normalizeList(res);
      if (res.data && Array.isArray(res.data)) return normalizeList(res.data);
      if (res.tracks && res.tracks.data && Array.isArray(res.tracks.data)) return normalizeList(res.tracks.data);
      for (const key of Object.keys(res)) {
        if (Array.isArray(res[key])) return res[key];
      }
      const out: any[] = [];
      // if we got here, normalize above didn't return; double-check res.data
      if (res && res.data && Array.isArray(res.data)) out.push(...res.data);
      const norm = normalizeList(out);
      // cache normalized result
      this._popularCache = { ts: Date.now(), data: norm };
      return norm;
    } catch (err) {
      // log detalhado de erro para debugging
      try {
        // HttpErrorResponse or other
  const maybeStatus = (err as any)?.status;
  const maybeMessage = (err as any)?.message || err;
  // surface only concise error; keep detailed body in debug logs
  console.error('ApiService.getPopularTracks error - status:', maybeStatus, 'message:', maybeMessage);
        // se houver um corpo de erro, tente imprimir um trecho
        if ((err as any)?.error) {
          try {
            const errBody = typeof (err as any).error === 'string' ? (err as any).error : JSON.stringify((err as any).error);
            this.debugOnce('getPopularTracks:error-body', 'ApiService.getPopularTracks error body (first 1000 chars):', errBody?.slice?.(0, 1000));
          } catch (e) {
            this.debugOnce('getPopularTracks:error-stringify', 'ApiService.getPopularTracks error (could not stringify error body)', e);
          }
        }
      } catch (logErr) {
  this.debugOnce('getPopularTracks:logging-failed', 'ApiService.getPopularTracks error (logging failed)', logErr, err);
      }
      // As a final fallback try JSONP once here if not already attempted
      try {
        const jp = await this.requestJsonp(`https://api.deezer.com/chart/0/tracks?limit=${LIMIT}&output=jsonp`);
        const data = Array.isArray(jp?.data) ? jp.data : (Array.isArray(jp) ? jp : []);
        const norm = (data || []).map((t: any) => this.sanitizeTrack(t));
        this._popularCache = { ts: Date.now(), data: norm };
        return norm;
      } catch (e2) {
        // To avoid continuous retry storms when the chart endpoint is failing,
        // cache an empty result briefly so callers won't repeatedly hammer the endpoint.
        try { this._popularCache = { ts: Date.now(), data: [] }; } catch (e3) {}
        return [];
      }
    }
  }

  async searchTracks(query: string): Promise<any[]> {
    try {
      if (this.useJsonpOnly) {
        const jp = await this.requestJsonp(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&output=jsonp`);
        const list = Array.isArray(jp?.data) ? jp.data : (Array.isArray(jp) ? jp : []);
        return (list || []).map((t: any) => this.sanitizeTrack(t));
      }
      const url = `${this.apiURL}/search?q=${encodeURIComponent(query)}`;
  const text: any = await this.requestText(url);
      let res: any = null;
      try {
        res = JSON.parse(text);
      } catch (e) {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const inside = text.slice(firstBrace, lastBrace + 1);
          try { res = JSON.parse(inside); } catch (e2) { this.debugOnce('searchTracks:failed-parse','ApiService.searchTracks: failed to parse response', text.slice(0,500)); throw e2; }
        } else { 
          this.debugOnce('searchTracks:unexpected-nonjson','ApiService.searchTracks: unexpected non-JSON response', text.slice(0,500));
          // try JSONP fallback (no CORS)
          try {
            const jp = await this.requestJsonp(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&output=jsonp`);
            res = jp;
          } catch (e3) { throw e; }
        }
      }
      const list = res?.data || [];
      return (list || []).map((t: any) => this.sanitizeTrack(t));
    } catch (err) {
      console.error('ApiService.searchTracks error', err);
      return [];
    }
  }

  /** Recupera uma faixa individual pelo ID (usada para preencher preview ausente em favoritos) */
  async getTrack(id: string | number): Promise<any | null> {
    if (id === undefined || id === null) return null;
    try {
      if (this.useJsonpOnly) {
        try {
          const jp = await this.requestJsonp(`https://api.deezer.com/track/${id}?output=jsonp`);
          return this.sanitizeTrack(jp);
        } catch (e) {
          console.warn('ApiService.getTrack jsonp error', e);
          return null;
        }
      }
      const url = `${this.apiURL}/track/${id}`;
      const text: any = await this.requestText(url);
      let res: any = null;
      try { res = JSON.parse(text); } catch {
        // tentar extrair JSON interno
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try { res = JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch {}
        }
        if (!res) {
          // fallback JSONP
          try { res = await this.requestJsonp(`https://api.deezer.com/track/${id}?output=jsonp`); } catch {}
        }
      }
      if (!res) return null;
      return this.sanitizeTrack(res);
    } catch (e) {
      console.warn('ApiService.getTrack error', e);
      return null;
    }
  }

  // Ensure preview urls are playable (https and public preview host)
  private sanitizeTrack(track: any) {
    if (!track) return track;
    try {
      const out = { ...track };
      if (out.preview && typeof out.preview === 'string') {
        out.preview = this.normalizePreviewUrl(out.preview);
      }
      return out;
    } catch { return track; }
  }

  private normalizePreviewUrl(url: string): string {
    if (!url) return url;
    let u = url.trim();
    // force https
    u = u.replace(/^http:\/\//i, 'https://');
    try {
      const parsed = new URL(u);
      // normalize host: cdnt-*/cdn-* -> cdns-*
      const host = parsed.hostname.replace(/^cdnt-/i, 'cdns-').replace(/^cdn-/i, 'cdns-');
      parsed.hostname = host;
      return parsed.toString();
    } catch { return u; }
  }

  // JSONP helper (uses Angular's JSONP support)
  private requestJsonp(url: string): Promise<any> {
    // defer import to avoid adding jsonp to normal path if not used
    // Angular HttpClient supports jsonp via http.jsonp
    return new Promise(async (resolve, reject) => {
      try {
        // Since this service already has HttpClient injected, we can cast to any to access jsonp
        const anyHttp: any = this.http as any;
        if (!anyHttp.jsonp) {
          // if jsonp not available, reject
          return reject(new Error('JSONP not available'));
        }
        const obs = anyHttp.jsonp(url, 'callback');
        const data = await firstValueFrom(obs);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Simple deduping wrapper for HTTP GET text responses.
   * If the same URL is requested while a previous request is in-flight,
   * returns the existing Promise instead of issuing a new HTTP call.
   */
  private requestText(url: string): Promise<string> {
    // canonicalize search URLs to coalesce near-identical queries
    try {
      if (url.includes('/search?q=')) {
        const u = new URL(url, (window as any)?.location?.origin || 'https://local');
        const raw = u.searchParams.get('q') || '';
        const canon = raw.trim().replace(/\s+/g, ' ');
        u.searchParams.set('q', canon);
        url = u.toString().replace((window as any)?.location?.origin || 'https://local', '');
      }
    } catch { /* ignore */ }
    // record one-time initiator stack for this URL to help diagnose floods
    try {
      const stack = new Error().stack || '';
      // keep only first 1000 chars to avoid huge logs
      this.debugOnce(`initiator:${url}`, 'ApiService.requestText initiator stack (first 1000 chars):', stack.slice(0, 1000));
    } catch (e) {}

    // reuse in-flight
    const existing = this._inFlightRequests.get(url);
    if (existing) return existing;
    const now = Date.now();

    // return cached recent response if within TTL
    const cached = this._cacheTextResponses.get(url);
    if (cached && now - cached.ts < this._CACHE_TTL_MS) {
      return Promise.resolve(cached.text);
    }

    // enforce a minimal interval between requests to the same URL
    const last = this._lastRequestTs.get(url) || 0;
    if (now - last < this._MIN_INTERVAL_MS) {
      // If there is no in-flight and the caller is hammering, return cached text if available,
      // otherwise return an empty JSON object string to avoid network storm and keep callers safe.
      if (cached) return Promise.resolve(cached.text);
      return Promise.resolve('{}');
    }

    this._lastRequestTs.set(url, now);

    const p = (async () => {
      // Apply global/host rate limiting gates
      await this.gateForRateLimit(url);
      return firstValueFrom(this.http.get(url, { responseType: 'text' as 'json' }));
    })()
      .then(r => {
        const text = r as unknown as string;
        this._inFlightRequests.delete(url);
        try { this._cacheTextResponses.set(url, { ts: Date.now(), text }); } catch (e) {}
        return text;
      })
      .catch(e => {
        this._inFlightRequests.delete(url);
        throw e;
      });

    this._inFlightRequests.set(url, p);
    return p;
  }

  private async gateForRateLimit(url: string) {
    const now = Date.now();
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    // Global gate
    const sinceGlobal = now - this._lastGlobalTs;
    if (sinceGlobal < this._GLOBAL_MIN_INTERVAL_MS) {
      await delay(this._GLOBAL_MIN_INTERVAL_MS - sinceGlobal);
    }
    // Host gate
    let host = '';
    try {
      const u = new URL(url, (window as any)?.location?.origin || 'https://local');
      host = u.hostname || '';
    } catch { /* local/relative */ }
    if (host) {
      const last = this._lastHostTs.get(host) || 0;
      const sinceHost = Date.now() - last;
      if (sinceHost < this._HOST_MIN_INTERVAL_MS) {
        await delay(this._HOST_MIN_INTERVAL_MS - sinceHost);
      }
      this._lastHostTs.set(host, Date.now());
    }
    this._lastGlobalTs = Date.now();
  }
}
