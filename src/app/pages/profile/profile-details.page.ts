import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-profile-details-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Compte</p><h1>Détail du profil</h1><p>Consultez les informations détaillées du compte.</p></article>' })
export class ProfileDetailsPage { private readonly changeDetector = inject(ChangeDetectorRef); }
