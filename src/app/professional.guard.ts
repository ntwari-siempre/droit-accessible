import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/*
 * Garde du portail personnel : réservé au rôle « professional ».
 * - Non connecté : formulaire de connexion + retour à l'accueil.
 * - Administrateur connecté : renvoyé vers son espace d'administration.
 * - Professionnel connecté : navigation autorisée (données strictement
 *   personnelles, filtrées côté API).
 */
export const professionalGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated() || !auth.currentUser()) {
    auth.openLoginPrompt();
    return router.createUrlTree(['/home']);
  }

  if (!auth.isProfessional()) {
    return router.createUrlTree(['/admin']);
  }

  return true;
};
