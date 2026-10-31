import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

/** Añade el token solo a las rutas privadas de la API propia; nunca a GitHub ni al índice estático. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!auth.enabled() || !req.url.startsWith(auth.api('/api/v1/me'))) return next(req);
  return from(auth.token()).pipe(switchMap((token) => next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)));
};
