import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-profile-list-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Compte</p><h1>Liste des profils</h1><p>Gérez les comptes et les préférences de la plateforme.</p></article>' })
export class ProfileListPage { private readonly changeDetector = inject(ChangeDetectorRef); }
