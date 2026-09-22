import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../api.service';
import { Resource } from '../models';

/**
 * Page « Lire la suite » d'une fiche pratique : lecture complète de la
 * ressource chargée depuis la base de données via /api/resources/:id.
 */
@Component({
    selector: 'app-resource-details-page',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './resource-details.page.html'
})
export class ResourceDetailsPage implements OnInit {

    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly changeDetector = inject(ChangeDetectorRef);

    protected resource: Resource | null = null;
    protected loading = true;
    protected error = '';

    ngOnInit(): void {
        const id = Number(this.route.snapshot.paramMap.get('id'));
        if (!id) {
            this.loading = false;
            this.error = 'Fiche introuvable.';
            return;
        }
        this.api.getResource(id).subscribe({
            next: (data) => {
                this.resource = data as Resource;
                this.loading = false;
                this.changeDetector.detectChanges();
            },
            error: () => {
                this.loading = false;
                this.error = 'Impossible de charger cette fiche.';
                this.changeDetector.detectChanges();
            }
        });
    }

    /*
     * Corps de la fiche : la description courte de la base est enrichie d'un
     * guide pas à pas générique (documents, délais, accompagnement).
     */
    protected get paragraphs(): string[] {
        if (!this.resource) { return []; }
        return [
            this.resource.description,
            'Repère 1 — Rassemblez vos documents : contrat, courriers reçus, échanges et justificatifs datés. Un dossier complet permet de comprendre votre situation et de la faire valoir plus vite.',
            'Repère 2 — Vérifiez les délais : la plupart des recours sont encadrés par des délais précis. Agir tôt préserve vos droits et évite qu\'une situation simple ne se complique.',
            'Repère 3 — Contactez un professionnel : depuis l\'annuaire, choisissez un spécialiste de votre domaine et envoyez une demande de rendez-vous. Vous recevrez un code de suivi pour dialoguer avec lui.'
        ];
    }
}

