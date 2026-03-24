import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { ApiService } from 'src/app/core/services/api.service';
import { PlaybackService } from 'src/app/core/services/playback.service';
import { SearchHistoryService } from 'src/app/core/services/search-history.service';
import { Subscription } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { FavoritesService } from 'src/app/core/services/favorites.service';
import { Router } from '@angular/router';


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule]
})
export class HomePage implements OnInit, OnDestroy {

  // nomes usados no template
  searchQuery: string = '';
  musicList: any[] = [];
  relatedFound: any[] = []; // resultados de buscas anteriores relacionados à consulta atual
  mergedResults: any[] = []; // quando juntamos poucos resultados atuais + relacionados
  loading = false;
  // audio player state (synced with PlaybackService)
  currentPreviewUrl: string | null = null;
  isPlaying = false;
  playProgress: number = 0; // 0..100
  progressRadius = 24;
  progressCircumference = 2 * Math.PI * this.progressRadius;
  favoritesSet: Set<string> = new Set();
  private _subs: Subscription[] = [];
  // Unified fallback icon (favicon.png removed to stop 404 flood)
  private readonly FALLBACK_ICON = '/assets/icon/song.PNG';
  // debounce timer for search input
  private _searchTimer: any = null;
  // token to ensure only latest search result is applied
  private _searchToken = 0;

  constructor(
    private musicService: ApiService,
    private toastCtrl: ToastController,
    private router: Router,
    private playback: PlaybackService,
    private favoritesService: FavoritesService,
    private cd: ChangeDetectorRef,
    private searchHistory: SearchHistoryService
  ) {}

  async ngOnInit() {
    await Promise.all([this.loadPopularTracks(), this.initFavorites()]);

    // subscribe to playback state so Home UI stays in sync
    this._subs.push(this.playback.currentPreviewUrl$.subscribe(u => { this.currentPreviewUrl = u; try { this.cd.detectChanges(); } catch (e) {} }));
    this._subs.push(this.playback.isPlaying$.subscribe(v => { this.isPlaying = v; try { this.cd.detectChanges(); } catch (e) {} }));
    this._subs.push(this.playback.progress$.subscribe(p => { this.playProgress = p; try { this.cd.detectChanges(); } catch (e) {} }));
  }

  async loadPopularTracks() {
    // guard against re-entrancy / repeated mounts calling this too often
    if ((this as any)._loadingPopular) return;
    (this as any)._loadingPopular = true;
    this.loading = true;
    // Note: removed the global loading overlay as requested (no blocking message after splash)

    try {
      const res = await this.musicService.getPopularTracks();
      this.musicList = res;
    } catch (error) {
      // erro tratado abaixo com toast
      const toast = await this.toastCtrl.create({
        message: 'Erro ao carregar músicas populares.',
        duration: 2000,
        color: 'danger'
      });
      toast.present();
    } finally {
      this.loading = false;
      (this as any)._loadingPopular = false;
      // no overlay to dismiss
    }
  }

  /**
   * Debounced search handler called by the template on each input.
   * Uses a short timer to avoid firing a request per keystroke, and
   * keeps a token so only the latest response is applied.
   */
  searchMusic(immediate = false) {
    // clear any pending timer
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }

    // if input is empty, reset to popular tracks
    if (!this.searchQuery.trim()) {
      // call without waiting
      this.loadPopularTracks();
      return;
    }

    const token = ++this._searchToken;

    const run = async () => {
      this.loading = true;
      try {
        const res = await this.musicService.searchTracks(this.searchQuery);
        // apply only if this is still the latest search
        if (token === this._searchToken) {
          this.musicList = res;
          // registra busca se houve resultados
          try { if (res && res.length) await this.searchHistory.record(this.searchQuery, res); } catch {}
          // busca relacionados de histórico
          try { this.relatedFound = await this.searchHistory.getRelated(this.searchQuery); } catch { this.relatedFound = []; }
          this.prepareMerged();
        }
      } catch (error) {
        const toast = await this.toastCtrl.create({
          message: 'Erro na pesquisa.',
          duration: 2000,
          color: 'danger'
        });
        toast.present();
      } finally {
        if (token === this._searchToken) this.loading = false;
      }
    };

    if (immediate) {
      run();
    } else {
      // debounce 400ms
      this._searchTimer = setTimeout(run, 400);
    }
  }

  // simples preview player (toca um preview de 30s do Deezer)
  // accepts either a preview URL string or a track object { preview, id, title, artist }
  async playPreview(item: any) {
    const previewUrl = typeof item === 'string' ? item : item?.preview;
    if (!previewUrl) {
      const t = await this.toastCtrl.create({ message: 'Prévia indisponível para esta faixa', duration: 1600 });
      t.present();
      return;
    }
    try {
      const track = typeof item === 'string' ? { id: previewUrl, preview: previewUrl } : item;
      await this.playback.togglePreview(previewUrl, track);
      // recents list moved to dedicated page; no refresh here
    } catch (err: any) {
      console.error('Erro ao tocar preview', err);
      const t = await this.toastCtrl.create({ message: 'Não foi possível tocar a prévia: ' + (err?.message || err), duration: 2000 });
      t.present();
    }
  }

 
  private async loadSuggestions() {
    // suggestions removed from UI; keep method if needed later
    return;
  }

  private async initFavorites() {
    const favs = await this.favoritesService.getFavorites();
    this.favoritesSet = new Set((favs || []).map((f: any) => this.normalizeFavoriteKey(f)).filter((v: string) => !!v));
  }

  async addToFavorites(track: any) {
    try {
      const key = this.normalizeFavoriteKey(track);
      if (!key) return;
      const isFav = this.favoritesSet.has(key);
      if (isFav) {
        await this.favoritesService.removeFavorite(key);
        this.favoritesSet.delete(key);
      } else {
        await this.favoritesService.addFavorite(track);
        this.favoritesSet.add(key);
      }
    } catch (e) {
      console.error('Erro ao adicionar favorito', e);
    }
  }

  getDashOffset(preview: any) {
    const c = this.progressCircumference;
    if (this.isCurrent(preview)) {
      return c * (1 - (this.playProgress / 100));
    }
    return c;
  }

  // lastPlayed moved to Recent page

  navigateTo(path: string) {
    this.router.navigate([path]);
  }

  ngOnDestroy(): void {
    // unsubscribe playback listeners
    this._subs.forEach(s => s.unsubscribe());
    this._subs = [];
  }

  onImgError(event: any) {
    try {
      event.target.src = this.FALLBACK_ICON;
    } catch (e) {
      // ignore
    }
  }

  // Helpers for robust fallbacks when API fields vary or are missing
  getCover(item: any) {
    if (!item) return this.FALLBACK_ICON;
    return (
      item?.album?.cover_medium ||
      item?.album?.cover ||
      item?.cover_medium ||
      item?.cover ||
      item?.picture ||
      this.FALLBACK_ICON
    );
  }

  // true when the card should show the placeholder instead of an image
  isFallback(item: any): boolean {
    if (!item) return true;
    return !(
      item?.album?.cover_medium ||
      item?.album?.cover ||
      item?.cover_medium ||
      item?.cover ||
      item?.picture
    );
  }

  getTitle(item: any) {
    if (!item) return '—';
    return item?.title || item?.name || item?.track || item?.title_short || 'Preview';
  }

  getArtist(item: any) {
    if (!item) return '—';
    return item?.artist?.name || item?.artist || item?.artist_name || item?.performer || '—';
  }

  getPlayIcon(preview: any): string {
    return this.isPlaying && this.isCurrent(preview) ? 'pause' : 'play';
  }

  getFavoriteIcon(item: any): string {
    const key = this.normalizeFavoriteKey(item);
    return key && this.favoritesSet.has(key) ? 'heart' : 'heart-outline';
  }

  private normalizeFavoriteKey(source: any): string {
    if (source === null || source === undefined) return '';
    if (typeof source === 'string' || typeof source === 'number') return String(source);
    if (source?.id !== undefined && source?.id !== null) return String(source.id);
    if (source?.preview) return String(source.preview);
    if (source?.raw) return this.normalizeFavoriteKey(source.raw);
    return '';
  }

  // true if provided preview corresponds to the currently playing source, considering normalized hosts
  isCurrent(preview: any): boolean {
    if (!preview) return false;
    try { return this.playback.isCurrent(typeof preview === 'string' ? preview : preview?.preview); } catch { return false; }
  }

  // controla exibição da seção "Últimos encontrados"
  showRelatedFound(): boolean {
    if (!this.searchQuery || this.searchQuery.trim().length < 3) return false;
    if (!this.relatedFound || this.relatedFound.length === 0) return false;
    // se todos os related já estão nos resultados atuais, não mostra duplicado
    const currentIds = new Set((this.musicList || []).map(r => r?.id || r?.preview));
    return this.relatedFound.some(r => !currentIds.has(r?.id || r?.preview));
  }

  // Prepara junção quando poucos resultados (<=3) ou nenhum
  private prepareMerged() {
    this.mergedResults = [];
    if (!this.searchQuery || this.searchQuery.trim().length < 3) return;
    const count = this.musicList.length;
    if ((count === 0 && this.relatedFound.length) || (count > 0 && count <= 3 && this.relatedFound.length)) {
      // juntar mantendo ordem: resultados atuais primeiro, depois relacionados não duplicados
      const seen = new Set<string>();
      for (const r of this.musicList) { const id = r?.id || r?.preview; if (id && !seen.has(id)) { seen.add(id); this.mergedResults.push({ item: r, fromHistory: false }); } }
      for (const r of this.relatedFound) { const id = r?.id || r?.preview; if (id && !seen.has(id)) { seen.add(id); this.mergedResults.push({ item: r, fromHistory: true }); if (this.mergedResults.length >= 24) break; } }
    }
  }

  useMerged(): boolean { return this.mergedResults.length > 0; }

  getResultsHeading(): string {
    const q = this.searchQuery.trim();
    if (!q) return 'Populares';
    if (this.useMerged() && this.musicList.length === 0) return `Baseado em buscas anteriores`; // sem resultados atuais
    const count = this.musicList.length;
    if (count === 0) return `Nenhum resultado para "${q}"`;
    return `Resultados para "${q}" (${count})`;
  }

  clearSearch() {
    this.searchQuery = '';
    this.musicList = [];
    this.relatedFound = [];
    this.mergedResults = [];
    this._searchToken++; // invalida buscas pendentes
    this.loadPopularTracks();
  }
}