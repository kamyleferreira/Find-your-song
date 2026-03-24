import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { UserService } from '../../core/services/user';
import { Subscription } from 'rxjs';
import { PlaybackService } from '../../core/services/playback.service';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-recent',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
  templateUrl: './recent.page.html',
  styleUrls: ['./recent.page.scss']
})
export class RecentPage implements OnInit, OnDestroy {
  userData: any;
  recentList: any[] = [];
  sub?: Subscription;
  currentPreviewUrl: string | null = null;
  isPlaying = false;
  searchQuery: string = '';

  // Use existing icon to avoid 404 loops (favicon.png missing)
  private readonly FALLBACK_ICON = '/assets/icon/song.PNG';

  constructor(private userService: UserService, private playback: PlaybackService, private toastCtrl: ToastController, private cd: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.sub = this.userService.observeUserData().subscribe((data) => {
      this.userData = data;
      const r = data?.recent;
      if (Array.isArray(r)) {
        this.recentList = r;
      } else if (r && typeof r === 'object') {
        const values = Object.values(r);
        // Se o objeto for um mapa de IDs -> boolean, renderiza as chaves como títulos
        if (values.every(v => typeof v !== 'object')) {
          this.recentList = Object.keys(r).map(k => ({ title: k }));
        } else {
          this.recentList = values as any[];
        }
      } else if (data?.recentList && Array.isArray(data.recentList)) {
        // fallback para outro nome de campo comum
        this.recentList = data.recentList;
      } else {
        this.recentList = [];
      }
    });

    // sync playback UI state
    this.playback.currentPreviewUrl$.subscribe(u => { this.currentPreviewUrl = u; try { this.cd.detectChanges(); } catch {} });
    this.playback.isPlaying$.subscribe(v => { this.isPlaying = v; try { this.cd.detectChanges(); } catch {} });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async playPreview(track: any) {
    const url = track?.preview;
    if (!url) { const t = await this.toastCtrl.create({ message: 'Prévia indisponível', duration: 1500 }); t.present(); return; }
    try { await this.playback.togglePreview(url, track); } catch (e: any) { const t = await this.toastCtrl.create({ message: 'Erro ao tocar: ' + (e?.message || e), duration: 1800 }); t.present(); }
  }

  getCover(item: any) {
    if (!item) return this.FALLBACK_ICON;
    const c = item?.cover || item?.album?.cover_medium || item?.album?.cover || item?.cover_medium || item?.cover || item?.picture;
    return c && typeof c === 'string' && c.trim() ? c : this.FALLBACK_ICON;
  }

  onImgError(ev: any) { try { if (ev?.target?.src !== this.FALLBACK_ICON) ev.target.src = this.FALLBACK_ICON; } catch {} }
  getTitle(item: any) { if (!item) return '—'; return item?.title || item?.name || item?.title_short || 'Preview'; }
  getArtist(item: any) { if (!item) return '—'; return item?.artist?.name || item?.artist || item?.artist_name || ''; }

  // Consistent with Home: decide if an item is the current playing source
  isCurrent(preview: any): boolean {
    if (!preview) return false;
    try { return this.playback.isCurrent(typeof preview === 'string' ? preview : preview?.preview); } catch { return false; }
  }

  getPlayIcon(preview: any): string {
    return this.isPlaying && this.isCurrent(preview) ? 'pause' : 'play';
  }

  navigateTo(path: string) { this.router.navigate([path]); }

  // Filter list by search query (title or artist)
  get viewList(): any[] {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) return this.recentList;
    try {
      return (this.recentList || []).filter((t: any) => {
        const title = (this.getTitle(t) || '').toLowerCase();
        const artist = (this.getArtist(t) || '').toLowerCase();
        return title.includes(q) || artist.includes(q);
      });
    } catch { return this.recentList || []; }
  }
}
