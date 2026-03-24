import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController, ModalController } from '@ionic/angular';
import { FavoritesService } from '../../core/services/favorites.service';
import { PlaybackService } from '../../core/services/playback.service';
import { ApiService } from '../../core/services/api.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';


interface FavoriteView {
  key: string;
  preview: string | null;
  title: string;
  artist: string;
  cover: string;
  usePlaceholder: boolean;
  raw: any;
}

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.page.html',
  styleUrls: ['./favorites.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class FavoritesPage implements OnInit, OnDestroy {
  favorites: any[] = [];
  favoritesView: FavoriteView[] = [];
  favoritesSet = new Set<string>();
  currentPreviewUrl: string | null = null;
  isPlaying = false;
  playProgress = 0;
  private subs: Subscription[] = [];
  private readonly FALLBACK_ICON = '/assets/icon/song.PNG';

  constructor(
    private favoritesService: FavoritesService,
    private toastCtrl: ToastController,
    private playback: PlaybackService,
    private modalCtrl: ModalController,
    private router: Router,
    private cd: ChangeDetectorRef,
    private api: ApiService
  ) {}

  async ngOnInit() { await this.init(); }
  async ionViewWillEnter() { await this.init(); }

  private async init() {
    await this.loadFavorites();
    if (this.subs.length === 0) {
      this.subs.push(this.playback.currentPreviewUrl$.subscribe(u => { this.currentPreviewUrl = u; try { this.cd.detectChanges(); } catch {} }));
      this.subs.push(this.playback.isPlaying$.subscribe(p => { this.isPlaying = p; try { this.cd.detectChanges(); } catch {} }));
      this.subs.push(this.playback.progress$.subscribe(pr => { this.playProgress = pr; }));
    }
  }

  private async loadFavorites() {
    const raw = await this.favoritesService.getFavorites();
    this.favorites = Array.isArray(raw) ? raw.filter(Boolean) : [];
    this.refreshView();
  }

  async toggleFavorite(item: any) {
    const track = item?.raw ?? item;
    const key = this.getFavoriteKey(track);
    if (!key) {
      const t = await this.toastCtrl.create({ message: 'Não foi possível identificar a faixa.', duration: 1400 });
      t.present();
      return;
    }

    if (this.favoritesSet.has(key)) {
      await this.favoritesService.removeFavorite(key);
      this.favorites = this.favorites.filter(f => this.getFavoriteKey(f) !== key);
      this.refreshView();
      const t = await this.toastCtrl.create({ message: 'Removido dos favoritos', duration: 1400 });
      t.present();
    } else {
      await this.favoritesService.addFavorite(track);
      this.favorites.unshift(track);
      this.refreshView();
      const t = await this.toastCtrl.create({ message: 'Adicionado aos favoritos', duration: 1400 });
      t.present();
    }
  }

  async playPreview(item: any) {
    const track = item?.raw ?? item;
    if (!track) {
      const t = await this.toastCtrl.create({ message: 'Prévia indisponível', duration: 1500 });
      t.present();
      return;
    }

    let url = track?.preview;
    let refreshed = false;
    if (!url && track?.id) {
      try {
        const full = await this.api.getTrack(track.id);
        if (full?.preview) {
          track.preview = full.preview;
          url = full.preview;
          if (item && typeof item === 'object' && 'preview' in item) {
            item.preview = full.preview;
          }
          refreshed = true;
        }
      } catch {}
    }

    if (!url) {
      const t = await this.toastCtrl.create({ message: 'Prévia indisponível', duration: 1500 });
      t.present();
      return;
    }

    if (refreshed) {
      // ensure UI reflects updated keys/previews
      this.refreshView();
    }

    try {
      await this.playback.togglePreview(url, track);
    } catch (e: any) {
      const t = await this.toastCtrl.create({ message: 'Erro ao tocar: ' + (e?.message || e), duration: 1800 });
      t.present();
    }
  }


  navigateTo(path: string) { this.router.navigate([path]); }

  onImgError(ev: any, view?: FavoriteView) {
    try { ev.target.src = this.FALLBACK_ICON; } catch {}
    if (view) {
      view.usePlaceholder = true;
      view.cover = this.FALLBACK_ICON;
    }
  }

  getCover(item: any) {
    const source = item?.raw ?? item;
    if (!source) return this.FALLBACK_ICON;
    return (
      source?.album?.cover_medium ||
      source?.album?.cover ||
      source?.cover_medium ||
      source?.cover ||
      source?.picture ||
      this.FALLBACK_ICON
    );
  }

  getTitle(item: any) {
    const source = item?.raw ?? item;
    if (!source) return '—';
    return source?.title || source?.name || source?.title_short || 'Preview';
  }

  getArtist(item: any) {
    const source = item?.raw ?? item;
    if (!source) return '—';
    return source?.artist?.name || source?.artist || source?.artist_name || '—';
  }

  getPlayIcon(view: FavoriteView): string {
    return this.isPlaying && this.isCurrent(view?.preview) ? 'pause' : 'play';
  }

  getFavoriteToggleIcon(view: FavoriteView): string {
    const key = view?.key || this.getFavoriteKey(view);
    if (!key) return 'heart-outline';
    return this.favoritesSet.has(key) ? 'heart' : 'heart-outline';
  }

  getFavoriteKey(item: any): string {
    const source = item?.raw ?? item;
    if (!source) return '';
    const id = source?.id;
    if (id !== undefined && id !== null && String(id).trim() !== '') return String(id);
    const preview = source?.preview;
    if (preview && String(preview).trim() !== '') return String(preview);
    return '';
  }

  isFallback(item: any): boolean {
    const source = item?.raw ?? item;
    if (!source) return true;
    return !(
      source?.album?.cover_medium ||
      source?.album?.cover ||
      source?.cover_medium ||
      source?.cover ||
      source?.picture
    );
  }

  isCurrent(preview: any): boolean {
    if (!preview) return false;
    try { return this.playback.isCurrent(typeof preview === 'string' ? preview : preview?.preview); } catch { return false; }
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];
  }

  private refreshView() {
    const list = (this.favorites || []).filter(Boolean);
    this.favoritesSet = new Set(list.map(f => this.getFavoriteKey(f)).filter(k => k));
    this.favoritesView = list.map(track => this.toView(track));
  }

  private toView(track: any): FavoriteView {
    const coverMissing = this.isFallback(track);
    return {
      key: this.getFavoriteKey(track),
      preview: track?.preview || null,
      title: this.getTitle(track),
      artist: this.getArtist(track),
      cover: coverMissing ? this.FALLBACK_ICON : this.getCover(track),
      usePlaceholder: coverMissing,
      raw: track
    };
  }
}
