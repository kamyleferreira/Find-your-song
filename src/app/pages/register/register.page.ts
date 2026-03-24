import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';

import { AuthService } from '../../core/services/auth';
import { UserService } from '../../core/services/user';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule]
})
export class RegisterPage implements OnInit {

  form = {
    nickname: '',
    fullName: '',
    email: '',
    password: '',
    confirm: ''
  };

  isSubmitting = false;

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  ngOnInit() {}

  async onSubmit() {
    if (this.isSubmitting) return;

    const nickname = this.form.nickname.trim();
    const fullName = this.form.fullName.trim();
    const email = this.form.email.trim().toLowerCase();
    const password = this.form.password;
    const confirm = this.form.confirm;

    // -----------------------------
    // VALIDAÇÕES
    // -----------------------------
    if (!nickname || !email || !password || !confirm) {
      await this.presentToast('Preencha todos os campos.', 'danger');
      return;
    }

    if (password.length < 6) {
      await this.presentToast('A senha precisa de pelo menos 6 caracteres.', 'danger');
      return;
    }

    const complexity = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
    if (!complexity.test(password)) {
      await this.presentToast('A senha deve conter ao menos 1 letra maiúscula, 1 número e 1 caractere especial.', 'danger');
      return;
    }

    if (password !== confirm) {
      await this.presentToast('As senhas não coincidem.', 'danger');
      return;
    }

    // -----------------------------
    // PROCESSO DE CADASTRO
    // -----------------------------
    this.isSubmitting = true;

    const loading = await this.loadingCtrl.create({
      message: 'Criando conta...'
    });

    await loading.present();

    try {
      // 1. Cria o usuário no Firebase Auth
      const user = await this.authService.register(email, password);

      // 2. Inicializa o perfil no Firestore
      await this.userService.initializeUserProfile({
        name: nickname,
        fullName: fullName || nickname,
        email
      });

      await loading.dismiss();
      await this.presentToast('Conta criada com sucesso!', 'success');

      // 3. Redireciona para login
      this.router.navigateByUrl('/login', { replaceUrl: true });

    } catch (err: any) {
      await loading.dismiss();

      const msg =
        err?.code === 'auth/email-already-in-use'
          ? 'Este e-mail já está em uso.'
          : err?.message || 'Erro ao criar conta.';

      await this.presentToast(msg, 'danger');
    } finally {
      this.isSubmitting = false;
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
