import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'NORTE · Empleos', loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage) },
  { path: 'vacante/:id', title: 'NORTE · Vacante', loadComponent: () => import('./features/search/job-page').then((m) => m.JobPage) },
  { path: 'perfil', title: 'NORTE · Tu perfil', loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage) },
  { path: 'postulaciones', title: 'NORTE · Postulaciones', loadComponent: () => import('./features/applications/applications-page').then((m) => m.ApplicationsPage) },
  { path: 'cuenta', title: 'NORTE · Cuenta', loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage) },
  { path: 'privacidad', title: 'NORTE · Privacidad', loadComponent: () => import('./features/legal/privacy-page').then((m) => m.PrivacyPage) },
  { path: 'fuentes', title: 'NORTE · Fuentes y licencias', loadComponent: () => import('./features/legal/sources-page').then((m) => m.SourcesPage) },
  { path: '**', redirectTo: '' },
];
