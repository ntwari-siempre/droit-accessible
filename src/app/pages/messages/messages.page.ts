import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AppointmentRequest } from '../../api.service';
import { AuthService } from '../../auth.service';

/** Message de la conversation d'une demande. */
interface ChatMessage {
    id: number;
    senderRole: string;
    senderName: string;
    content: string;
    createdAt: string;
}

/** Fréquence de rafraîchissement du chat (ms) : rend la messagerie dynamique. */
const REFRESH_INTERVAL_MS = 5000;

@Component({ selector: 'app-messages-page', standalone: true, imports: [FormsModule, DatePipe], templateUrl: './messages.page.html' })
export class MessagesPage implements OnInit, OnDestroy {

    private readonly api = inject(ApiService);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private readonly auth = inject(AuthService);

    /* Demandes = conversations disponibles (une conversation par demande). */
    protected requests: AppointmentRequest[] = [];
    protected selected: AppointmentRequest | null = null;
    protected messages: ChatMessage[] = [];
    protected draft = '';
    protected loading = true;
    protected error = '';
    protected sendError = '';
    protected sending = false;

    /* L'administrateur voit toutes les conversations ; le professionnel, les siennes. */
    protected get isAdmin(): boolean {
        return this.auth.isAdmin();
    }

    /*
     * Chat dynamique : le judiciaire répond depuis son code de suivi (sans
     * compte). Un rafraîchissement automatique garde la conversation à jour
     * ici, sans recharger la page.
     */
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

    ngOnInit(): void {
        this.api.getAppointments().subscribe({
            next: (requests) => {
                this.requests = requests;
                this.selected = requests[0] ?? null;
                this.loading = false;
                if (this.selected) {
                    this.loadMessages();
                }
                this.changeDetector.detectChanges();
            },
            error: () => {
                this.loading = false;
                this.error = 'Impossible de charger vos conversations. Vérifiez votre session.';
                this.changeDetector.detectChanges();
            },
        });
        this.startPolling();
    }

    ngOnDestroy(): void {
        this.stopPolling();
    }

    protected select(request: AppointmentRequest): void {
        this.selected = request;
        this.messages = [];
        this.sendError = '';
        this.loadMessages();
    }

    private loadMessages(): void {
        if (!this.selected) { return; }
        const conversationId = this.selected.id;
        this.api.getAppointmentMessages(conversationId).subscribe({
            next: (messages) => {
                /* La sélection peut avoir changé pendant la requête. */
                if (!this.selected || this.selected.id !== conversationId) { return; }
                this.messages = messages as ChatMessage[];
                this.changeDetector.detectChanges();
            },
            error: () => {
                this.sendError = 'Impossible de charger la conversation.';
                this.changeDetector.detectChanges();
            },
        });
    }

    protected send(): void {
        const content = this.draft.trim();
        if (!content || !this.selected || this.sending) { return; }
        this.sending = true;
        this.sendError = '';
        this.api.sendAppointmentMessage(this.selected.id, content).subscribe({
            next: (message) => {
                this.messages = [...this.messages, message as ChatMessage];
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

    protected trackMessage(_index: number, message: ChatMessage): number {
        return message.id;
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
     * Rafraîchit la conversation ouverte ainsi que la liste (nouvelles
     * demandes, changement de statut). Silencieux en cas d'erreur : le cycle
     * suivant réessaiera.
     */
    private refresh(): void {
        if (this.sending) { return; }
        const conversationId = this.selected?.id ?? null;
        this.api.getAppointments().subscribe({
            next: (requests) => {
                this.requests = requests;
                const current = requests.find((request) => request.id === conversationId) ?? requests[0] ?? null;
                const changed = this.selected?.id !== current?.id;
                this.selected = current;
                if (changed) {
                    this.messages = [];
                }
                this.loadMessages();
                this.changeDetector.detectChanges();
            },
            error: () => { /* silencieux : le prochain cycle réessaiera */ },
        });
    }
}


