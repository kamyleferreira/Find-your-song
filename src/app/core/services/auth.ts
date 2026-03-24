import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  deleteUser,
  User 
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private auth = getAuth(
    getApps().length ? getApps()[0] : initializeApp(environment.firebase)
  );
  private currentUser: User | null = null;
  /** Reactive stream of the authenticated user (null when logged out) */
  readonly currentUser$ = new BehaviorSubject<User | null>(null);

  constructor(private router: Router) {
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      this.currentUser$.next(user);
    });
  }

  /** 🔹 Cadastrar novo usuário */
  async register(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
  this.currentUser = userCredential.user;
  this.currentUser$.next(this.currentUser);
      return userCredential.user;
    } catch (error: any) {
      throw this.formatError(error.code);
    }
  }

  /** 🔹 Fazer login */
  async login(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
  this.currentUser = userCredential.user;
  this.currentUser$.next(this.currentUser);
      return userCredential.user;
    } catch (error: any) {
      throw this.formatError(error.code);
    }
  }

  /** 🔹 Resetar senha (para “Esqueceu a senha?”) */
  async resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(this.auth, email);
      return true;
    } catch (error: any) {
      throw this.formatError(error.code);
    }
  }

  /** 🔹 Fazer logout */
  async logout() {
    await signOut(this.auth);
    this.currentUser = null;
    this.currentUser$.next(null);
    this.router.navigate(['/login']);
  }

  /** 🔹 Excluir conta autenticada */
  async deleteAccount() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Nenhum usuário autenticado.');
    try {
      await deleteUser(user);
      this.currentUser = null;
      this.currentUser$.next(null);
      await this.router.navigate(['/register']);
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login' || err?.message?.includes('CREDENTIAL_TOO_OLD')) {
        await this.logout();
        throw new Error('Por segurança, faça login novamente para excluir sua conta.');
      }
      throw err;
    }
  }

  /** 🔹 Verifica se há usuário logado */
  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  /** 🔹 Retorna usuário atual */
  getUser(): User | null {
    return this.currentUser;
  }

  /** 🔹 Tratamento de erros do Firebase */
  private formatError(code: string): string {
    const messages: Record<string, string> = {
      'auth/invalid-email': 'Email inválido.',
      'auth/user-disabled': 'Usuário desativado.',
      'auth/user-not-found': 'Usuário não encontrado.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/email-already-in-use': 'Email já está em uso.',
      'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
      'auth/missing-email': 'Informe um email válido.'
    };
    return messages[code] || 'Erro desconhecido.';
  }
}
