import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, AppointmentRequest } from '../../api.service';

/** Profil du professionnel connecté (GET /api/professionals/me). */
interface MyProfile {
    id: number;
    name: string;
    email: string;
    specialty: string;
    city: string;
    registration: string;
    bio: string;
    status: string;
    createdAt?: string;
}

interface MyNotification {
    id: number;
    title: string;
    message: string;
    readAt?: string | null;
    createdAt: string;
}

@Component({
    selector: 'app-portail-page',
    standalone: true,
    imports: [DatePipe],
    templateUrl: './portail.page.html'
})
export class PortailPage implements OnInit {

    private readonly api = inject(ApiService);
    private readonly changeDetector = inject(ChangeDetectorRef);

    protected profile: MyProfile | null = null;

    protected requests: AppointmentRequest[] = [];

    protected notifications: MyNotification[] = [];

    protected loading = true;

    protected error = '';

    private pendingLoads = 3;

    ngOnInit(): void {
        this.loading = true;
        this.error = '';

        /*
         * Profil personnel du professionnel connecté.
         */
        this.api.getMyProfile().subscribe({

            next: (profile) => {

                this.profile = profile as MyProfile;

                this.loadDone();
            },

            error: (error) => {

                this.error = error?.status === 404
                    ? 'Aucun profil professionnel n’est relié à votre compte. Contactez l’administrateur.'
                    : 'Impossible de charger votre profil. Vérifiez votre session.';

                this.loadDone();
            }

        });

        /*
         * Demandes adressées à CE professionnel uniquement :
         * le filtrage est effectué par l'API (rôle + profil lié).
         */
        this.api.getAppointments().subscribe({

            next: (requests) => {

                this.requests = requests;

                this.loadDone();
            },

            error: () => this.loadDone()

        });

        /*
         * Notifications liées à CE professionnel uniquement.
         */
        this.api.getNotifications().subscribe({

            next: (notifications) => {

                this.notifications = notifications as MyNotification[];

                this.loadDone();
            },

            error: () => this.loadDone()

        });
    }

    protected getStatusLabel(status: string): string {

        switch (status?.toLowerCase()) {

            case 'approved':
            case 'active':
                return 'Visible dans l’annuaire';

            case 'pending':
                return 'En attente de validation';

            case 'rejected':
                return 'Refusé';

            case 'suspended':
                return 'Suspendu';

            default:
                return status || 'Inconnu';
        }
    }

    protected get pendingRequestsCount(): number {

        return this.requests.filter(
            request => request.status?.toLowerCase() === 'pending'
        ).length;
    }

    private loadDone(): void {

        this.pendingLoads--;

        if (this.pendingLoads <= 0) {

            this.loading = false;
        }

        this.changeDetector.detectChanges();
    }
}
