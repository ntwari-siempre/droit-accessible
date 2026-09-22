import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-message-details-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Messagerie</p><h1>Détail de la conversation</h1><p>Le fil de discussion sera affiché ici.</p></article>' })
export class MessageDetailsPage { private readonly changeDetector = inject(ChangeDetectorRef); }
