import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth';
import {IonicModule, ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})

export class LoginPage {
  email: string = '';
  password: string = '';
  showPassword = false;
  

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  // Alternar visibilidade da senha
  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  getPasswordToggleIcon(): string {
    return this.showPassword ? 'eye-off-outline' : 'eye-outline';
  }

  // Ação de login
  async onLogin() {
    if (!this.email || !this.password) {
      this.presentToast('Preencha todos os campos.');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Entrando...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      await this.authService.login(this.email, this.password);
      await loading.dismiss();
      const toast = await this.toastCtrl.create({
        message: 'Login realizado com sucesso!',
        duration: 2000,
        color: 'success',
      });
  await toast.present();
  // after successful login, go to home so the user sees suggestions and last-played
  this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (error: any) {
      await loading.dismiss();
      const toast = await this.toastCtrl.create({
        message: error.message || 'Erro ao fazer login.',
        duration: 2500,
        color: 'danger',
      });
      await toast.present();
    }
  }

  // Recuperar senha
  async forgotPassword() {
    if (!this.email) {
      this.presentToast('Informe seu email para recuperar a senha.');
      return;
    }

    try {
      await this.authService.resetPassword(this.email);
      this.presentToast('Email de redefinição de senha enviado.');
    } catch (error) {
      this.presentToast('Erro ao enviar email de redefinição.');
      console.error(error);
    }
  }

  // Voltar para tela anterior
  goBack() {
    this.router.navigate(['/login']);
  }

  // Exibir mensagens curtas
  private async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
    });
    await toast.present();
  }
}
