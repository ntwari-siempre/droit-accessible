import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
@Component({ selector: 'app-message-form-page', standalone: true, imports: [ReactiveFormsModule], template: '<article class="panel"><p class="eyebrow">Messagerie</p><h1>Nouveau message</h1><p>Écrivez au demandeur ou au professionnel concerné.</p></article>' })
export class MessageFormPage { private readonly changeDetector = inject(ChangeDetectorRef); }
