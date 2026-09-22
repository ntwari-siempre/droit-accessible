import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../api.service';

/** Résumé de la demande suivie par le citoyen. */
interface SuiviAppointment {
    id: number;
    status: string;
    requesterName: string;
    requestedDate: string;
    professionalName: string;
    specialty: string;
}

interface SuiviMessage {
    id: number;
    senderRole: string;
    senderName: string;
    content: string;
    createdAt: string;
}

/** Fréquence de rafraîchissement du chat (ms) : rend la messagerie dynamique. */
const REFRESH_INTERVAL_MS = 5000;

/**
 * Espace de suivi du citoyen : accessible SANS compte, via le code secret
 * remis lors de l'envoi de la demande de rendez-vous. Le chat est dynamique :
 * il se rafraîchit automatiquement pour voir les réponses du professionnel.
 */
@Component({
    selector: 'app-suivi-page',
    standalone: true,
    imports: [FormsModule, DatePipe],
    templateUrl: './suivi.page.html'
})
export class SuiviPage implements OnInit, OnDestroy {

    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly changeDetector = inject(ChangeDetectorRef);

    protected code = '';

    protected appointment: SuiviAppointment | null = null;

    protected messages: SuiviMessage[] = [];

    protected draft = '';

    protected loading = false;

    protected error = '';

    protected sendError = '';

    protected sending = false;

    private currentToken = '';

    /* Rafraîchissement automatique de la conversation (voir REFRESH_INTERVAL_MS). */
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

    ngOnInit(): void {
        /* Le code peut arriver dans l'URL : /suivi/CODE. */
        const token = this.route.snapshot.paramMap.get('token');
        if (token) {
            this.code = token;
            this.open();
        }
        this.startPolling();
    }

    ngOnDestroy(): void {
        this.stopPolling();
    }

    protected open(): void {
        const token = this.code.trim();
        if (!token || this.loading) { return; }
        this.loading = true;
        this.error = '';
        this.currentToken = token;
        this.api.getSuivi(token).subscribe({
            next: (data) => {
                const result = data as { appointment: SuiviAppointment; messages: SuiviMessage[] };
                this.appointment = result.appointment;
                this.messages = result.messages ?? [];
                this.loading = false;
                this.changeDetector.detectChanges();
            },
            error: () => {
                this.appointment = null;
                this.messages = [];
                this.loading = false;
                this.error = 'Code de suivi inconnu. Vérifiez le code reçu lors de votre demande.';
                this.changeDetector.detectChanges();
            },
        });
    }

    protected send(): void {
        const content = this.draft.trim();
        if (!content || this.sending) { return; }
        this.sending = true;
        this.sendError = '';
        this.api.sendSuiviMessage(this.currentToken, content).subscribe({
            next: (message) => {
                this.messages = [...this.messages, message as SuiviMessage];
                this.draft = '';
                this.sending = false;
                this.changeDetector.detectChanges();
            },
            error: () => {
                this.sending = false;
                this.sendError = 'Le message n’a pas pu être envoyé. Réessayez dans un instant.';
                this.changeDetector.detectChanges();
            },
        });
    }

    protected newRequest(): void {
        this.router.navigate(['/professionals']);
    }

    private startPolling(): void {
        this.stopPolling();
        this.refreshTimer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    }

    private stopPolling(): void {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /*
     * Rafraîchit la demande suivie (messages du professionnel + statut).
     * Silencieux en cas d'erreur : le code reste affiché, le cycle suivant
     * réessaiera.
     */
    private refresh(): void {
        if (!this.currentToken || this.sending || this.loading) { return; }
        this.api.getSuivi(this.currentToken).subscribe({
            next: (data) => {
                const result = data as { appointment: SuiviAppointment; messages: SuiviMessage[] };
                this.appointment = result.appointment;
                this.messages = result.messages ?? [];
                this.changeDetector.detectChanges();
            },
            error: () => { /* silencieux : le prochain cycle réessaiera */ },
        });
    }
}

