import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { UserService } from '../../core/services/user';
import { AuthService } from '../../core/services/auth';
import { Subscription } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss']
})
export class ProfilePage implements OnInit, OnDestroy {
  name = '';
  bio = '';
  photo?: File;
  photoPreview?: string;
  userData: any;
  userSub?: Subscription;
  favoritesCount = 0;
  recentCount = 0;
  editingName = false;
  editingBio = false;

  constructor(
    private userService: UserService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    // Inicial carrega (caso necessário)
    this.userData = await this.userService.getUserData();
    if (this.userData) {
      this.name = this.userData.name || '';
      this.bio = this.userData.bio || '';
      this.updateCounts(this.userData);
    }
    // Assina updates reativos do Firestore para o usuário autenticado
    this.userSub = this.userService.observeUserData().subscribe((data) => {
      this.userData = data;
      // Atualiza os campos do formulário apenas quando não está editando
      if (data) {
        if (!this.editingName && typeof data.name === 'string') this.name = data.name;
        if (!this.editingBio && typeof data.bio === 'string') this.bio = data.bio;
      }
      this.updateCounts(this.userData);
    });
  }

  async saveProfile() {
    try {
      const updated = await this.userService.updateUser(this.name, this.bio, this.photo);
      const photoURL = updated?.photoURL || this.userData?.photoURL;
      
      this.userData = { ...(this.userData || {}), photoURL, name: this.name, bio: this.bio };
      this.photo = undefined;
      this.revokePreview();
      this.editingName = false;
      this.editingBio = false;
      const toast = await this.toastCtrl.create({ message: 'Perfil salvo com sucesso.', duration: 1700, color: 'success' });
      await toast.present();
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível salvar. Verifique sua conexão e permissões.';
      const toast = await this.toastCtrl.create({ message: msg, duration: 2200, color: 'danger' });
      await toast.present();
    }
  }

//Acesso a câmera para tirar foto de perfil
async openCamera() {
  const image = await Camera.getPhoto({
    quality: 90,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera
  });

  if (!image || !image.base64String) return;

  const blob = this.base64ToBlob(image.base64String, `image/${image.format}`);
  this.photo = new File([blob], `photo.${image.format}`, { type: `image/${image.format}` });
  this.revokePreview(); // limpa preview antigo
  this.photoPreview = URL.createObjectURL(this.photo);
}

private base64ToBlob(base64: string, type: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type });
}


  onFileChange(event: any) {
    const file: File | undefined = event.target?.files?.[0];
    if (file) {
      this.photo = file;
      this.revokePreview();
      this.photoPreview = URL.createObjectURL(file);
    }
    if (event?.target) {
      event.target.value = '';
    }
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.revokePreview();
  }

  private updateCounts(data: any) {
    this.favoritesCount = Array.isArray(data?.favorites) ? data.favorites.length : (typeof data?.favorites === 'object' && data?.favorites ? Object.keys(data.favorites).length : 0);
    this.recentCount = Array.isArray(data?.recent) ? data.recent.length : (typeof data?.recent === 'object' && data?.recent ? Object.keys(data.recent).length : 0);
  }

  // Inline edit helpers
  startEdit(field: 'name' | 'bio') {
    if (field === 'name') this.editingName = true;
    if (field === 'bio') this.editingBio = true;
  }

  stopEdit(field: 'name' | 'bio') {
    if (field === 'name') this.editingName = false;
    if (field === 'bio') this.editingBio = false;
  }

  async logout() {
    try {
      await this.authService.logout();
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível sair agora.';
      const toast = await this.toastCtrl.create({ message: msg, duration: 2200, color: 'danger' });
      toast.present();
    }
  }

  private revokePreview() {
    if (this.photoPreview) {
      URL.revokeObjectURL(this.photoPreview);
      this.photoPreview = undefined;
    }
  }

  async confirmDeleteAccount() {
    const alert = await this.alertCtrl.create({
      header: 'Excluir conta',
      message: 'Tem certeza? Todos os seus dados serão removidos e esta ação não pode ser desfeita.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => this.deleteAccount()
        }
      ]
    });
    await alert.present();
  }

  private async deleteAccount() {
    try {
      await this.userService.deleteAccountData();
      await this.authService.deleteAccount();
      const toast = await this.toastCtrl.create({
        message: 'Conta excluída com sucesso.',
        duration: 2200,
        color: 'success'
      });
      await toast.present();
    } catch (err: any) {
      const message = err?.message || 'Não foi possível excluir sua conta agora.';
      const toast = await this.toastCtrl.create({ message, duration: 2400, color: 'danger' });
      await toast.present();
    }
  }
}
