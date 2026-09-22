import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
@Component({ selector: 'app-resource-form-page', standalone: true, imports: [ReactiveFormsModule], template: '<section class="panel"><p class="eyebrow">Ressources</p><h1>Nouvelle fiche juridique</h1><p>Formulaire réservé à la rédaction et à la publication d’une ressource.</p></section>' })
export class ResourceFormPage { private readonly changeDetector = inject(ChangeDetectorRef); }
