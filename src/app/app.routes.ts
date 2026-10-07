import { Routes } from '@angular/router';

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
  { path: '**', redirectTo: '' },
];
