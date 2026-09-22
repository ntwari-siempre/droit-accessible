import { computed, Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'droit_accessible_token';
const USER_KEY = 'droit_accessible_user';

/** Utilisateur connecté : identité + rôle + lien vers son profil professionnel. */
export interface AuthUser {
  id: number;
  username: string;
  role: string;
  professionalId: number | null;
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    const user = JSON.parse(raw) as AuthUser;
    return user && typeof user.role === 'string' ? user : null;
  } catch {
    return null;
  }
}

/**
 * Source unique de vérité de l'authentification côté client.
 *
 * La session complète (jeton + identité) est conservée dans le localStorage :
 * elle survit à un rechargement de page (F5) et alimente à la fois le header
 * (App) et les gardes de routes (authGuard, adminGuard, professionalGuard).
 * Une session incomplète (jeton sans identité, ex. ancienne version) est
 * effacée au démarrage : l'utilisateur doit se reconnecter.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  /** Session courante : initialisée depuis le stockage local au démarrage. */
  private readonly isAuthenticatedSignal = signal<boolean>(false);

  /** Identité de l'utilisateur connecté (id, username, role, professionalId). */
  private readonly currentUserSignal = signal<AuthUser | null>(null);

  /** Formulaire de connexion : peut être ouvert automatiquement par un guard. */
  private readonly loginPromptSignal = signal<boolean>(false);

  /** Session active ? (lecture seule : App et guards) */
  readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();

  /** Utilisateur connecté (lecture seule : App et guards). */
  readonly currentUser = this.currentUserSignal.asReadonly();

  /** Formulaire de connexion affiché ? */
  readonly loginPromptOpen = this.loginPromptSignal.asReadonly();

  /** Rôle « admin » : seul ce rôle voit et gère tous les professionnels. */
  readonly isAdmin = computed(() => this.currentUserSignal()?.role === 'admin');

  /** Rôle « professional » : portail strictement personnel. */
  readonly isProfessional = computed(() => this.currentUserSignal()?.role === 'professional');

  constructor() {
    const token = readStoredToken();
    const user = readStoredUser();
    if (token && user) {
      this.isAuthenticatedSignal.set(true);
      this.currentUserSignal.set(user);
    } else if (token || user) {
      this.clearSession();
    }
  }

  /** Jeton JWT courant (null si déconnecté). */
  get token(): string | null {
    return readStoredToken();
  }

  /** Ouvre la session après une connexion réussie. */
  setSession(token: string, user: AuthUser): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* stockage indisponible : la session reste active en mémoire */
    }
    this.isAuthenticatedSignal.set(true);
    this.currentUserSignal.set(user);
    this.loginPromptSignal.set(false);
  }

  /** Ferme la session : déconnexion manuelle ou 401 renvoyé par l'API. */
  clearSession(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* stockage indisponible */
    }
    this.isAuthenticatedSignal.set(false);
    this.currentUserSignal.set(null);
  }

  /** Demande l'affichage du formulaire de connexion (utilisé par les guards). */
  openLoginPrompt(): void {
    this.loginPromptSignal.set(true);
  }

  /** Ferme le formulaire de connexion. */
  closeLoginPrompt(): void {
    this.loginPromptSignal.set(false);
  }
}
