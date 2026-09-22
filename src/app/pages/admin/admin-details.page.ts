import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-admin-details-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Administration</p><h1>Détail d’un professionnel</h1><p>Examinez et validez les informations d’un profil.</p></article>' })
export class AdminDetailsPage { private readonly changeDetector = inject(ChangeDetectorRef); }
