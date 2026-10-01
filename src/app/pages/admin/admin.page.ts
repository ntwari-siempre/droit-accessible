import {
    ChangeDetectorRef,
    Component,
    inject,
    OnInit
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ProfessionalFormPage } from './professional-form.page';
import { ApiService } from '../../api.service';

interface Professional {
    id: number;
    name: string;
    email: string;
    specialty: string;
    city: string;
    registration: string;
    bio: string;
    status: string;
    createdAt?: string;
    userId?: number | null;
    portalUsername?: string;
}

@Component({
    selector: 'app-admin-page',
    standalone: true,
    imports: [
        FormsModule,
        ProfessionalFormPage
    ],
    templateUrl: './admin.page.html'
})
export class AdminPage implements OnInit {

    private readonly api = inject(ApiService);
    private readonly changeDetector = inject(ChangeDetectorRef);

    protected tab: 'overview' | 'professionals' = 'overview';

    protected professionals: Professional[] = [];

    protected selectedProfessional: Professional | null = null;

    /*
     * Identifiants du portail (optionnels) : laissés vides, ils ne sont pas
     * modifiés ; renseignés, ils créent ou mettent à jour le compte de
     * connexion du professionnel.
     */
    protected portalUsername = '';

    protected portalPassword = '';

    protected editingProfessional = false;

    protected loading = false;

    protected saving = false;

    protected errorMessage = '';

    protected successMessage = '';

    ngOnInit(): void {
        this.loadProfessionals();
    }

    /**
     * Charger les professionnels depuis l'API
     */
    protected loadProfessionals(): void {

        this.loading = true;
        this.errorMessage = '';

        this.api.getAdminProfessionals().subscribe({

            next: (data) => {

                this.professionals = data as Professional[];

                this.loading = false;

                this.changeDetector.detectChanges();
            },

            error: (error) => {

                console.error(
                    'Erreur lors du chargement des professionnels :',
                    error
                );

                this.professionals = [];

                this.errorMessage =
                    'Impossible de charger les professionnels.';

                this.loading = false;

                this.changeDetector.detectChanges();
            }


        });
        this.changeDetector.detectChanges();
    }


    /**
     * Ouvrir le modal de modification
     */
    protected editProfessional(
        professional: Professional
    ): void {

        /*
         * On crée une copie afin de ne pas modifier directement
         * la ligne du tableau avant d'avoir enregistré.
         */
        this.selectedProfessional = {
            ...professional
        };

        this.editingProfessional = true;

        this.errorMessage = '';

        this.successMessage = '';

        this.portalUsername = '';

        this.portalPassword = '';

        this.changeDetector.detectChanges();
    }


    /**
     * Fermer le modal
     */
    protected cancelEdit(): void {

        if (this.saving) {
            return;
        }

        this.selectedProfessional = null;

        this.editingProfessional = false;

        this.errorMessage = '';

        this.changeDetector.detectChanges();
    }


    /**
     * Enregistrer les modifications
     */
    protected saveProfessional(): void {

        if (!this.selectedProfessional || this.saving) {
            return;
        }

        this.saving = true;

        this.errorMessage = '';

        this.successMessage = '';


        /*
         * PUT /api/admin/professionals/:id
         */
        /*
         * Identifiants du portail : envoyés seulement s'ils sont renseignés
         * (identifiant seul = renommage ; mot de passe seul = réinitialisation ;
         * les deux sur un profil sans compte = création du compte).
         */
        const credentials: { username?: string; password?: string } = {};

        const portalUsername = this.portalUsername.trim();

        if (portalUsername) {
            credentials.username = portalUsername;
        }

        if (this.portalPassword) {
            credentials.password = this.portalPassword;
        }

        this.api.updateProfessional(
            this.selectedProfessional.id,
            {
                name: this.selectedProfessional.name,
                email: this.selectedProfessional.email,
                specialty: this.selectedProfessional.specialty,
                city: this.selectedProfessional.city,
                registration: this.selectedProfessional.registration,
                bio: this.selectedProfessional.bio,
                status: this.selectedProfessional.status
            },
            Object.keys(credentials).length > 0 ? credentials : undefined
        ).subscribe({

            next: (updated) => {

                const professional =
                    updated as Professional;


                /*
                 * Remplacer le professionnel modifié
                 * dans le tableau.
                 */
                const index =
                    this.professionals.findIndex(
                        p => p.id === professional.id
                    );


                if (index !== -1) {

                    this.professionals[index] =
                        professional;

                }


                /*
                 * Fermer le modal et réinitialiser les identifiants du portail.
                 */
                this.selectedProfessional = null;

                this.editingProfessional = false;

                this.saving = false;

                this.portalUsername = '';

                this.portalPassword = '';


                /*
                 * Message de succès (peut venir du serveur, ex. compte créé).
                 */
                this.successMessage =
                    (updated as { message?: string }).message ||
                    'Le profil a été mis à jour avec succès.';


                this.changeDetector.detectChanges();
            },


            error: (error) => {

                console.error(
                    'Erreur lors de la modification :',
                    error
                );

                this.errorMessage =
                    error?.error?.message ||
                    'Impossible de modifier le profil.';

                this.saving = false;

                this.changeDetector.detectChanges();
            }

        });
    }


    /**
     * Ouvrir l'onglet Professionnels
     */
    protected selectProfessionalsTab(): void {

        this.tab = 'professionals';

        this.loadProfessionals();
    }


    /**
     * Nombre de professionnels actifs
     */
    protected get activeProfessionalsCount(): number {

        return this.professionals.filter(
            professional =>
                professional.status?.toLowerCase() === 'approved' ||
                professional.status?.toLowerCase() === 'active'
        ).length;
    }


    /**
     * Nombre de professionnels en attente
     */
    protected get pendingProfessionalsCount(): number {

        return this.professionals.filter(
            professional =>
                professional.status?.toLowerCase() === 'pending'
        ).length;
    }


    /**
     * Nombre de profils vérifiés
     */
    protected get verifiedProfessionalsCount(): number {

        return this.professionals.filter(
            professional =>
                professional.status?.toLowerCase() === 'approved'
        ).length;
    }


    /**
     * Libellé du statut
     */
    protected getStatusLabel(status: string): string {

        switch (status?.toLowerCase()) {

            case 'approved':
                return 'Visible';

            case 'active':
                return 'Visible';

            case 'pending':
                return 'En attente';

            case 'rejected':
                return 'Refusé';

            case 'suspended':
                return 'Suspendu';

            default:
                return status || 'Inconnu';
        }
    }


    /**
     * Ancienne méthode conservée pour compatibilité.
     */
    protected getStatusClass(status: string): string {

        switch (status?.toLowerCase()) {

            case 'approved':
            case 'active':
                return 'active-status';

            case 'pending':
                return 'pending-status';

            case 'rejected':
            case 'suspended':
                return 'inactive-status';

            default:
                return '';
        }
    }

}

