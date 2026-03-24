import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private router: Router, private authService: AuthService) {}

  async canActivate(): Promise<boolean> {
    const auth = getAuth();
    
    return new Promise((resolve) => {
      onAuthStateChanged(auth, (user: User | null) => {
        if (user) {
          // usuário logado → libera o acesso
          resolve(true);
        } else {
          // não logado → redireciona pro login
          this.router.navigate(['/login']);
          resolve(false);
        }
      });
    });
  }
}
