import { TestBed } from '@angular/core/testing';
import { GuardResult, MaybeAsync, provideRouter, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

/** Exécute le guard dans le contexte d'injection de TestBed. */
function runGuard(): MaybeAsync<GuardResult> {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as never, {} as never),
  );
}

describe('authGuard', () => {
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
  });

  it('refuse l\'accès sans session : redirection /home + formulaire de connexion', () => {
    const result = runGuard();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.loginPromptOpen()).toBe(true);
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/home');
  });

  it('autorise la navigation avec une session active', () => {
    auth.setSession('jeton-de-test', { id: 2, username: 'admin', role: 'admin', professionalId: null });

    const result = runGuard();

    expect(result).toBe(true);
    expect(auth.loginPromptOpen()).toBe(false);
  });
});
