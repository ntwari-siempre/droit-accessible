import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { ApiService } from './api.service';
import { BookingService } from './booking.service';
import { AuthService } from './auth.service';
import { AppointmentFormPage } from './pages/appointments/appointment-form.page';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, RouterOutlet, RouterLink, AppointmentFormPage],
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(ApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly booking = inject(BookingService);

  /** Session active ? Déléguée à AuthService (source unique de vérité). */
  protected get authenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  /** Formulaire de connexion : le guard peut l'ouvrir automatiquement. */
  protected get professionalLoginOpen(): boolean {
    return this.auth.loginPromptOpen();
  }

  protected set professionalLoginOpen(open: boolean) {
    if (open) {
      this.auth.openLoginPrompt();
    } else {
      this.auth.closeLoginPrompt();
    }
  }

  /** Rôle de l'utilisateur connecté : pilote les liens du menu. */
  protected get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  protected get isProfessional(): boolean {
    return this.auth.isProfessional();
  }

  /** Initiale affichée dans l'avatar du header. */
  protected get userInitial(): string {
    return (this.auth.currentUser()?.username ?? '?').charAt(0).toUpperCase();
  }

  protected mobileMenuOpen = false;
  protected loginError = '';
  protected loginPending = false;
  protected loginSuccess = '';
  protected showPassword = false;

  /*
   * URL courante pilotée par le Router : source unique de vérité.
   * En cliquant dans le menu, l'URL change ; en actualisant (F5),
   * le routeur recharge directement la page correspondante.
   */
  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url.split('?')[0].split('#')[0]),
    ),
    { initialValue: '' },
  );

  protected readonly loginForm = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  /** Le lien est actif si l'URL courante pointe vers cette section (ex. /professionals/3). */
  protected isActive(prefix: string): boolean {
    const url = this.currentUrl();
    return url === prefix || url.startsWith(`${prefix}/`);
  }

  /** Navigation programmatique (utilisée par le menu mobile). */
  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }

  protected login(): void {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    this.loginPending = true;
    this.loginError = '';
    this.loginSuccess = '';
    this.api.login(this.loginForm.controls.username.value, this.loginForm.controls.password.value).subscribe({
      next: (result) => {
        this.loginPending = false;
        this.auth.setSession(result.token, result.user);
        this.loginSuccess = 'Connexion réussie.';
        /* L'administrateur gère tous les professionnels ; le professionnel
           est dirigé vers son portail strictement personnel. */
        this.router.navigateByUrl(result.user.role === 'admin' ? '/admin' : '/portail');
        this.changeDetector.detectChanges();
      },
      error: (error) => {
        this.loginPending = false;
        this.loginError = error.status === 401
          ? 'Identifiant ou mot de passe incorrect.'
          : 'Le serveur est indisponible. Vérifiez que npm run server est lancé.';
        this.changeDetector.detectChanges();
      },
    });
  }

  protected logout(): void {
    this.auth.clearSession();
    this.mobileMenuOpen = false;
    this.loginForm.reset();
    this.showPassword = false;
    this.router.navigateByUrl('/home');
  }

  protected togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}
