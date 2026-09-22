import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Garde des routes réservées aux utilisateurs connectés (ex. /admin).
 *
 * - Session active : navigation autorisée.
 * - Sans session : accès refusé — le formulaire de connexion s'ouvre
 *   automatiquement et l'utilisateur est ramené à l'accueil. Une fois
 *   connecté, il est dirigé vers /admin (voir App.login()).
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  /* Accès refusé : formulaire de connexion + retour à l'accueil. */
  auth.openLoginPrompt();
  return router.createUrlTree(['/home']);
};
