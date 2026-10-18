import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin-auth';
import { userGuard } from './core/auth/user-auth';

export const routes: Routes = [
  {
    path: '',
    title: 'AnimeEmolite',
    loadComponent: () => import('./features/search/search-page').then(m => m.SearchPage),
  },
  {
    path: 'anime/:id',
    title: 'AnimeEmolite',
    loadComponent: () => import('./features/watch/watch-page').then(m => m.WatchPage),
  },
  {
    path: 'login',
    title: 'Đăng nhập',
    loadComponent: () => import('./features/account/login/user-login').then(m => m.UserLogin),
  },
  {
    path: 'register',
    title: 'Đăng ký',
    loadComponent: () => import('./features/account/register/user-register').then(m => m.UserRegister),
  },
  {
    path: 'account',
    title: 'Tài khoản',
    canActivate: [userGuard],
    loadComponent: () => import('./features/account/account-page').then(m => m.AccountPage),
  },
  {
    path: 'admin/login',
    title: 'Đăng nhập quản trị',
    loadComponent: () => import('./features/admin/login/admin-login').then(m => m.AdminLogin),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/layout/admin-layout').then(m => m.AdminLayout),
    children: [
      {
        path: '',
        title: 'Quản trị · Tổng quan',
        loadComponent: () => import('./features/admin/dashboard/admin-dashboard').then(m => m.AdminDashboard),
      },
      {
        path: 'anime',
        title: 'Quản trị · Phim',
        loadComponent: () => import('./features/admin/anime/admin-anime').then(m => m.AdminAnimeList),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
