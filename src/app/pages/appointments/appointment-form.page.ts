import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../api.service';
import { BookingService } from '../../booking.service';

@Component({ selector: 'app-appointment-form-page', standalone: true, imports: [ReactiveFormsModule], templateUrl: './appointment-form.page.html' })
export class AppointmentFormPage {
  private readonly api = inject(ApiService); private readonly changeDetector = inject(ChangeDetectorRef); private readonly builder = inject(FormBuilder); private readonly booking = inject(BookingService);
  protected pending = false; protected error = ''; protected sent = false;
  /** Code de suivi remis au citoyen après l'envoi (accède à la conversation). */
  protected trackingCode = '';
  protected readonly form = this.builder.nonNullable.group({ name: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone: ['', Validators.required], date: ['2026-10-01', Validators.required], message: [''] });
  protected close(): void { this.booking.close(); }
  protected submit(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.pending = true; this.error = ''; const value = this.form.getRawValue(); this.api.createAppointment({ professionalId: this.booking.professionalId(), requesterName: value.name, requesterEmail: value.email, requesterPhone: value.phone, requestedDate: value.date, message: value.message }).subscribe({ next: (result) => { this.pending = false; this.sent = true; this.trackingCode = (result as { accessToken?: string }).accessToken ?? ''; this.changeDetector.detectChanges(); }, error: () => { this.pending = false; this.error = 'La demande n’a pas pu être envoyée. Réessayez dans un instant.'; this.changeDetector.detectChanges(); } }); }
}
