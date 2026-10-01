import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AppointmentRequest } from '../../api.service';

@Component({ selector: 'app-appointments-list-page', standalone: true, imports: [DatePipe, FormsModule], templateUrl: './appointments-list.page.html' })
export class AppointmentsListPage implements OnInit {
	private readonly api = inject(ApiService);
	private readonly changeDetector = inject(ChangeDetectorRef);
	/*
	 * Cette page liste les demandes REÇUES des citoyens : un professionnel ne
	 * cree pas de demande lui-meme (pas de bouton « nouvelle demande »). En
	 * revanche, il coche / decoche chaque demande pour la marquer traitee.
	 */
	protected requests: AppointmentRequest[] = [];
	protected selected?: AppointmentRequest;
	protected loading = true;
	protected error = '';
	protected toggleError = '';

	/* --- Redaction et envoi de l e-mail au demandeur --- */
	protected emailOpen = false;
	protected emailSubject = '';
	protected emailBody = '';
	protected emailSending = false;
	protected emailError = '';
	protected emailSuccess = '';
	/** Le repli mailto: signale qu aucun envoi reel n a eu lieu. */
	protected emailMailto = false;
	/** Titre du bandeau : envoi reel ou repli mailto:. */
	protected get emailTitle(): string {
		return this.emailMailto
			? 'Message prete dans votre messagerie'
			: 'E-mail envoye';
	}

	ngOnInit(): void {
		this.api.getAppointments().subscribe({
			next: (requests) => { this.requests = requests; this.loading = false; this.changeDetector.detectChanges(); },
			error: () => { this.loading = false; this.error = 'Impossible de charger les demandes. Verifiez votre session professionnelle.'; this.changeDetector.detectChanges(); },
		});
	}

	protected select(request: AppointmentRequest): void { this.selected = request; }

	/** Ouvre la modale avec un objet et un message deja rediges. */
	protected openEmail(): void {
		if (!this.selected) { return; }
		const firstName = this.selected.requesterName.split(' ')[0];
		this.emailSubject = 'Votre demande de rendez-vous';
		this.emailBody = 'Bonjour ' + firstName + ',' + '\n\nNous avons bien recu votre demande pour le ' + this.selected.requestedDate + '.' + '\n\nBien cordialement,';
		this.emailError = '';
		this.emailSuccess = '';
		this.emailMailto = false;
		this.emailOpen = true;
	}


	/** Masque le bandeau de confirmation. */
	protected clearEmailNotice(): void {
		this.emailSuccess = '';
		this.emailMailto = false;
	}
	protected closeEmail(): void {
		if (this.emailSending) { return; }
		this.emailOpen = false;
	}

	/** Repli : ouvre le logiciel de messagerie avec le message deja rdigere. */
	private sendByMailto(): void {
		const target = this.selected;
		if (!target) { return; }
		const href = 'mailto:' + encodeURIComponent(target.requesterEmail)
			+ '?subject=' + encodeURIComponent(this.emailSubject)
			+ '&body=' + encodeURIComponent(this.emailBody);
		window.location.href = href;
		this.emailOpen = false;
		this.emailMailto = true;
		this.emailSuccess = 'Le message a ete place dans votre logiciel de messagerie : il reste a cliquer sur Envoyer pour le remettre au demandeur.';
	}

	/** Envoie l e-mail ; bascule sur mailto: si aucun service d envoi n est configure. */
	protected sendEmail(): void {
		const target = this.selected;
		if (!target || this.emailSending) { return; }
		const subject = this.emailSubject.trim();
		const body = this.emailBody.trim();
		if (!subject || !body) {
			this.emailError = 'Renseignez un objet et un message.';
			return;
		}
		this.emailSending = true;
		this.emailError = '';
		this.api.sendAppointmentEmail(target.id, subject, body).subscribe({
			next: () => {
				this.emailSending = false;
				this.emailOpen = false;
				this.emailMailto = false;
				this.emailSuccess = 'Le message a bien ete envoye a ' + target.requesterEmail + '.';
				this.changeDetector.detectChanges();
			},
			error: (error) => {
				this.emailSending = false;
				/* 503 = aucun service d envoi configure : on ouvre le client mail. */
				if (error?.status === 503) { this.sendByMailto(); return; }
				this.emailError = error?.status === 403
					? 'Cette demande ne vous est pas accessible.'
					: 'L envoi a echoue. Reessayez dans un instant.';
				this.changeDetector.detectChanges();
			},
		});
	}

	/** La demande est-elle marquee comme traitee ? */
	protected isProcessed(request: AppointmentRequest): boolean {
		return request.status === 'processed';
	}

	/** Coche / decoche la demande comme traitee (persiste cote API). */
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
				this.toggleError = 'Le statut n a pas pu etre enregistre. Reessayez dans un instant.';
				this.changeDetector.detectChanges();
			},
		});
	}
}

