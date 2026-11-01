import { inject } from '@angular/core';
import { Router, type CanMatchFn, type Routes } from '@angular/router';
import { ProfileService } from './core/profile.service';

/** Lo primero al entrar es el ingreso guiado (CV, datos, ubicación, modalidades); se puede saltar. */
const firstVisit: CanMatchFn = () => {
  const profiles = inject(ProfileService);
  return profiles.profile().onboarded || profiles.hasProfile() ? true : inject(Router).parseUrl('/bienvenida');
};

export const routes: Routes = [
  // pathMatch 'full': el guard solo se evalúa en «/»; con prefijo coincidiría con toda URL y redirigiría sin fin.
  { path: '', pathMatch: 'full', title: 'NORTE · Empleos para ti', canMatch: [firstVisit], loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage) },
  { path: 'bienvenida', title: 'NORTE · Empecemos', loadComponent: () => import('./features/onboarding/onboarding-page').then((m) => m.OnboardingPage) },
  { path: 'vacante/:id', title: 'NORTE · Vacante', loadComponent: () => import('./features/search/job-page').then((m) => m.JobPage) },
  { path: 'perfil', title: 'NORTE · Tu perfil', loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage) },
  { path: 'postulaciones', title: 'NORTE · Postulaciones', loadComponent: () => import('./features/applications/applications-page').then((m) => m.ApplicationsPage) },
  { path: 'observatorio', title: 'NORTE · Observatorio', loadComponent: () => import('./features/observatory/observatory-page').then((m) => m.ObservatoryPage) },
  { path: 'observatorio/informe/:month', title: 'NORTE · Informe mensual', loadComponent: () => import('./features/observatory/report-page').then((m) => m.ReportPage) },
  { path: 'cuenta', title: 'NORTE · Cuenta', loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage) },
  { path: 'privacidad', title: 'NORTE · Privacidad', loadComponent: () => import('./features/legal/privacy-page').then((m) => m.PrivacyPage) },
  { path: 'fuentes', title: 'NORTE · Fuentes y licencias', loadComponent: () => import('./features/legal/sources-page').then((m) => m.SourcesPage) },
  { path: '**', redirectTo: '' },
];
