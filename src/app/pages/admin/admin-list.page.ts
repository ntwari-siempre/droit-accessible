import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-admin-list-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Administration</p><h1>Liste des professionnels</h1><p>Gérez les profils inscrits et leur statut de visibilité.</p></article>' })
export class AdminListPage { private readonly changeDetector = inject(ChangeDetectorRef); }
