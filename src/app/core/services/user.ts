import { Injectable } from '@angular/core';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { initializeApp, getApps } from 'firebase/app';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';
import { updateProfile } from 'firebase/auth';
import { Observable, switchMap } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';


@Injectable({
  providedIn: 'root'
})
export class UserService {
  // reuse existing Firebase app if already initialized (prevents duplicate-app errors)
  private app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
  private db = getFirestore(this.app);
  // Allow overriding the Storage bucket via environment.storage.filesBucket (e.g., 'gs://findyoursong-bucket')
  private storage = getStorage(this.app, (environment as any)?.storage?.filesBucket);

  constructor(private authService: AuthService) {}

  // 🔹 Inicializa o documento do usuário ao criar a conta
  async initializeUserProfile(profile: { name: string; fullName?: string; email?: string }) {
    const user = this.authService.getUser();
    if (!user) throw new Error('Usuário não logado');

    const userRef = doc(this.db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const base = snap.exists() ? {} : { createdAt: new Date().toISOString(), bio: '' };

    const payload: Record<string, any> = {
      name: profile.name,
      ...(profile.fullName ? { fullName: profile.fullName } : {}),
      ...(profile.email ? { email: profile.email } : (user.email ? { email: user.email } : {}))
    };

    await setDoc(userRef, { ...base, ...payload }, { merge: true });
  }

  // 🔹 Atualiza nome, bio e foto
  async updateUser(name: string, bio: string, file?: File) {
  const user = this.authService.getUser();
  if (!user) throw new Error('Usuário não logado');




    const userRef = doc(this.db, 'users', user.uid);
    // Fetch current data so we can delete old photo if replacing
    let currentPhoto: string | undefined;
    
    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        currentPhoto = data?.photoURL;
       
      }
    } catch {}

    let photoURL: string | undefined;
    
    

     if (file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'uckshzzp');

    const url = `https://api.cloudinary.com/v1_1/dijzrtnho/image/upload`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!data.secure_url) {
        throw new Error('Falha ao enviar imagem ao Cloudinary');
      }

      photoURL = data.secure_url;

      // 🔹 Atualiza também o profile auth se quiser
      try {
        await updateProfile(user, { photoURL });
      } catch {}
    } catch (error) {
      console.error('Erro no upload para Cloudinary:', error);
      throw error;
    }
  }

  // 🔹 Salva no Firestore
  await setDoc(
    userRef,
    { name, bio, ...(photoURL && { photoURL }) },
    { merge: true }
  );

  return { name, bio, photoURL };
}

  // 🔹 Busca dados do usuário
  async getUserData() {
    const user = this.authService.getUser();
    if (!user) throw new Error('Usuário não logado');

    const userRef = doc(this.db, 'users', user.uid);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      return null;
    }
  }

  // 🔹 Observa em tempo real os dados do usuário autenticado
  observeUserData(): Observable<any | null> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        return new Observable<any | null>((subscriber) => {
          if (!user) {
            subscriber.next(null);
            subscriber.complete();
            return;
          }
          const userRef = doc(this.db, 'users', user.uid);
          // Registrar listener do Firestore
          const unsubscribe = onSnapshot(userRef, (snap) => {
            subscriber.next(snap.exists() ? snap.data() : null);
          }, (err) => subscriber.error(err));

          // Cleanup ao desfazer a inscrição
          return () => unsubscribe();
        });
      })
    );
  }

  async deleteAccountData() {
    const user = this.authService.getUser();
    if (!user) throw new Error('Usuário não logado');
    const userRef = doc(this.db, 'users', user.uid);
    await deleteDoc(userRef).catch(() => {});
  }

  async getFavoritesList(): Promise<any[]> {
    const user = this.authService.getUser();
    if (!user) return [];
    const userRef = doc(this.db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return [];
    const data = snap.data() as any;
    const source = data?.favorites;
    const list = this.extractFavorites(data);
    const originalCount = Array.isArray(source)
      ? source.length
      : (source && typeof source === 'object' ? Object.values(source).length : 0);
    if (originalCount && originalCount !== list.length) {
      try { await setDoc(userRef, { favorites: list }, { merge: true }); } catch {}
    }
    return list;
  }

  // 🔹 Normaliza um objeto de faixa para salvar no Firestore
  private sanitizeTrack(track: any) {
    if (!track) return null;
    const cover = track?.album?.cover_medium || track?.cover_medium || track?.cover || track?.picture || '/assets/icon/song.PNG';
    const id = (track.id !== undefined && track.id !== null && String(track.id).trim() !== '') ? String(track.id) : null;
    const preview = track.preview && String(track.preview).trim() !== '' ? String(track.preview) : null;
    if (!id && !preview) return null;
    return {
      id,
      title: track.title || track.name || track.title_short || 'Preview',
      artist: track?.artist?.name || track.artist || track.artist_name || '',
      preview,
      cover
    };
  }

  // 🔹 Adiciona um favorito (e mantém no máximo 100)
  async addFavorite(track: any) {
    const user = this.authService.getUser();
    if (!user) return;
    const t = this.sanitizeTrack(track);
    if (!t) return;
    const userRef = doc(this.db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() as any : {};
    const list: any[] = this.extractFavorites(data);
    const withoutDup = list.filter((x: any) => (x?.id ?? x?.preview) !== (t.id ?? t.preview));
    withoutDup.unshift(t);
    const trimmed = withoutDup.slice(0, 100);
    await setDoc(userRef, { favorites: trimmed }, { merge: true });
  }

  // 🔹 Remove um favorito pelo id (ou preview)
  async removeFavorite(idOrPreview: any) {
    const user = this.authService.getUser();
    if (!user) return;
    const userRef = doc(this.db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() as any : {};
    const list: any[] = this.extractFavorites(data);
    const filtered = list.filter((x: any) => (x?.id ?? x?.preview) !== idOrPreview);
    await setDoc(userRef, { favorites: filtered }, { merge: true });
  }

  // 🔹 Adiciona uma música aos "últimos ouvidos" (mantém no máximo 20)
  async addRecent(track: any) {
    const user = this.authService.getUser();
    if (!user) return;
    const t = this.sanitizeTrack(track);
    if (!t) return;
    const userRef = doc(this.db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() as any : {};
    const list: any[] = Array.isArray(data?.recent) ? data.recent : (data?.recent && typeof data?.recent === 'object' ? Object.values(data.recent) : []);
    const idOrPreview = t.id ?? t.preview;
    const filtered = list.filter((x: any) => (x?.id ?? x?.preview) !== idOrPreview);
    filtered.unshift(t);
    const trimmed = filtered.slice(0, 20);
    await setDoc(userRef, { recent: trimmed }, { merge: true });
  }

  private extractFavorites(data: any): any[] {
    const source = data?.favorites;
    let list: any[] = Array.isArray(source) ? source : (source && typeof source === 'object' ? Object.values(source) : []);
    list = list
      .map(item => this.sanitizeTrack(item))
      .filter((item): item is NonNullable<typeof item> => !!item);
    return list;
  }

  // Concede acesso á câmera e galeria
// 🔹 Abre câmera e retorna uma foto como File, pronta para enviar ao Cloudinary




}

