import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-appointment-details-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Rendez-vous</p><h1>Détail du rendez-vous</h1><p>Les informations et le suivi du rendez-vous seront affichés ici.</p></article>' })
export class AppointmentDetailsPage { private readonly changeDetector = inject(ChangeDetectorRef); }
