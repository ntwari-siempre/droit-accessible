import { TestBed } from '@angular/core/testing';
import { GuardResult, MaybeAsync, provideRouter, UrlTree } from '@angular/router';
import { professionalGuard } from './professional.guard';
import { AuthService } from './auth.service';

/** Exécute le guard dans le contexte d'injection de TestBed. */
function runGuard(): MaybeAsync<GuardResult> {
  return TestBed.runInInjectionContext(() =>
    professionalGuard({} as never, {} as never),
  );
}

describe('professionalGuard', () => {
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

  it('renvoie un administrateur vers son espace d\'administration', () => {
    auth.setSession('jeton-admin', { id: 1, username: 'admin', role: 'admin', professionalId: null });

    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/admin');
  });

  it('autorise un professionnel sur son portail personnel', () => {
    auth.setSession('jeton-pro', { id: 2, username: 'nadia', role: 'professional', professionalId: 7 });

    expect(runGuard()).toBe(true);
  });
});
