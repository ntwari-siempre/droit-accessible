import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
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

/**
 * Espace de suivi du citoyen : accessible SANS compte, via le code secret
 * remis lors de l'envoi de la demande de rendez-vous. Il affiche le statut
 * de la demande et le professionnel qui la traite.
 */
@Component({
    selector: 'app-suivi-page',
    standalone: true,
    imports: [FormsModule, DatePipe],
    templateUrl: './suivi.page.html'
})
export class SuiviPage implements OnInit {

    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly changeDetector = inject(ChangeDetectorRef);

    protected code = '';

    protected appointment: SuiviAppointment | null = null;

    protected loading = false;

    protected error = '';

    ngOnInit(): void {
        /* Le code peut arriver dans l'URL : /suivi/CODE. */
        const token = this.route.snapshot.paramMap.get('token');
        if (token) {
            this.code = token;
            this.open();
        }
    }

    protected open(): void {
        const token = this.code.trim();
        if (!token || this.loading) { return; }
        this.loading = true;
        this.error = '';
        this.api.getSuivi(token).subscribe({
            next: (data) => {
                const result = data as { appointment: SuiviAppointment };
                this.appointment = result.appointment;
                this.loading = false;
                this.changeDetector.detectChanges();
            },
            error: () => {
                this.appointment = null;
                this.loading = false;
                this.error = 'Code de suivi inconnu. Vérifiez le code reçu lors de votre demande.';
                this.changeDetector.detectChanges();
            },
        });
    }

    protected newRequest(): void {
        this.router.navigate(['/professionals']);
    }
}