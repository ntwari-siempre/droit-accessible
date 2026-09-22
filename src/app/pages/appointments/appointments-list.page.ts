import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, AppointmentRequest } from '../../api.service';
@Component({ selector: 'app-appointments-list-page', standalone: true, imports: [DatePipe], templateUrl: './appointments-list.page.html' })
export class AppointmentsListPage implements OnInit {
	private readonly api = inject(ApiService);
	private readonly changeDetector = inject(ChangeDetectorRef);
	/*
	 * Cette page liste les demandes REÇUES des citoyens : un professionnel ne
	 * crée pas de demande lui-même (pas de bouton « nouvelle demande »). En
	 * revanche, il coche / décoche chaque demande pour la marquer traitée.
	 */
	protected requests: AppointmentRequest[] = [];
	protected selected?: AppointmentRequest;
	protected loading = true;
	protected error = '';
	protected toggleError = '';

	ngOnInit(): void {
		this.api.getAppointments().subscribe({
			next: (requests) => { this.requests = requests; this.loading = false; this.changeDetector.detectChanges(); },
			error: () => { this.loading = false; this.error = 'Impossible de charger les demandes. Vérifiez votre session professionnelle.'; this.changeDetector.detectChanges(); },
		});
	}

	protected select(request: AppointmentRequest): void { this.selected = request; }

	/** La demande est-elle marquée comme traitée ? */
	protected isProcessed(request: AppointmentRequest): boolean {
		return request.status === 'processed';
	}

	/** Coche / décoche la demande comme traitée (persisté côté API). */
	protected toggleProcessed(request: AppointmentRequest, event: Event): void {
		event.stopPropagation();
		if (this.toggleError) { this.toggleError = ''; }
		const next: 'pending' | 'processed' = request.status === 'processed' ? 'pending' : 'processed';
		this.api.updateAppointmentStatus(request.id, next).subscribe({
			next: () => {
				request.status = next;
				this.changeDetector.detectChanges();
			},
			error: () => {
				this.toggleError = 'Le statut n’a pas pu être enregistré. Réessayez dans un instant.';
				this.changeDetector.detectChanges();
			},
		});
	}
}

