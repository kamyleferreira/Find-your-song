import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'splash', pathMatch: 'full' },


{ path: 'splash', loadComponent: () => import('./pages/splash/splash.page').then(m => m.SplashPage) },


  {
  
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage),
    canActivate: [AuthGuard]
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage)
  },

  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage)
  },

  

  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage),
    canActivate: [AuthGuard]
  },

  {
    path: 'favorites',
    loadComponent: () => import('./pages/favorites/favorites.page').then(m => m.FavoritesPage),
    canActivate: [AuthGuard]
  },

  {
    path: 'recent',
    loadComponent: () => import('./pages/recent/recent.page').then(m => m.RecentPage),
    canActivate: [AuthGuard]
  },

 


  // wildcard - rota de fallback correta
  { path: '**', redirectTo: 'home' }
];
