import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/*
 * Garde de l'espace d'administration : réservé au rôle « admin ».
 * - Non connecté : formulaire de connexion + retour à l'accueil.
 * - Professionnel connecté : renvoyé vers SON portail — il ne peut ni voir
 *   ni gérer les autres professionnels (conflit marketing évité).
 * - Administrateur : navigation autorisée.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated() || !auth.currentUser()) {
    auth.openLoginPrompt();
    return router.createUrlTree(['/home']);
  }

  if (!auth.isAdmin()) {
    return router.createUrlTree(['/portail']);
  }

  return true;
};
