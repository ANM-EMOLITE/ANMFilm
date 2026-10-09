import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin-auth';

export const routes: Routes = [
  {
    path: '',
    title: 'Anime Stream',
    loadComponent: () => import('./features/search/search-page').then(m => m.SearchPage),
  },
  {
    path: 'anime/:id',
    title: 'Xem anime',
    loadComponent: () => import('./features/watch/watch-page').then(m => m.WatchPage),
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
