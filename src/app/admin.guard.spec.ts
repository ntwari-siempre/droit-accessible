import { TestBed } from '@angular/core/testing';
import { GuardResult, MaybeAsync, provideRouter, UrlTree } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AuthService } from './auth.service';

/** Exécute le guard dans le contexte d'injection de TestBed. */
function runGuard(): MaybeAsync<GuardResult> {
  return TestBed.runInInjectionContext(() =>
    adminGuard({} as never, {} as never),
  );
}

describe('adminGuard', () => {
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

  it('renvoie un professionnel vers SON portail (il ne voit pas les autres)', () => {
    auth.setSession('jeton-pro', { id: 2, username: 'nadia', role: 'professional', professionalId: 7 });

    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/portail');
  });

  it('autorise un administrateur à gérer tous les professionnels', () => {
    auth.setSession('jeton-admin', { id: 1, username: 'admin', role: 'admin', professionalId: null });

    expect(runGuard()).toBe(true);
  });
});
