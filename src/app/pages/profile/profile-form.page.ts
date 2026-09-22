import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
@Component({ selector: 'app-profile-form-page', standalone: true, imports: [ReactiveFormsModule], template: '<article class="panel"><p class="eyebrow">Compte</p><h1>Modifier le profil</h1><p>Modifiez les informations du compte connecté.</p></article>' })
export class ProfileFormPage { private readonly changeDetector = inject(ChangeDetectorRef); }
