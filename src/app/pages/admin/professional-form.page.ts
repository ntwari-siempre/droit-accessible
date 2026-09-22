import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../api.service';

@Component({ selector: 'app-professional-form-page', standalone: true, imports: [ReactiveFormsModule], templateUrl: './professional-form.page.html' })
export class ProfessionalFormPage {
  private readonly api = inject(ApiService); private readonly builder = inject(FormBuilder); private readonly changeDetector = inject(ChangeDetectorRef);
  protected pending = false; protected error = ''; protected success = '';
  protected readonly form = this.builder.nonNullable.group({ name: ['', Validators.required], email: ['', [Validators.required, Validators.email]], specialty: ['Droit de la famille', Validators.required], city: ['', Validators.required], registration: ['', Validators.required], bio: [''], username: ['', [Validators.required, Validators.minLength(3)]], password: ['', [Validators.required, Validators.minLength(6)]] });
  protected submit(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.pending = true; this.error = ''; this.api.registerProfessional(this.form.getRawValue()).subscribe({ next: () => { this.pending = false; this.success = 'Compte créé. Connectez-vous avec vos identifiants pour accéder à votre portail.'; this.form.reset({ specialty: 'Droit de la famille', name: '', email: '', city: '', registration: '', bio: '', username: '', password: '' }); this.changeDetector.detectChanges(); }, error: (error) => { this.pending = false; this.error = error?.error?.message || 'Impossible d’enregistrer ce profil. Vérifiez le serveur.'; this.changeDetector.detectChanges(); } }); }
}
