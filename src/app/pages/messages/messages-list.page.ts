import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-messages-list-page', standalone: true, template: '<article class="panel"><p class="eyebrow">Messagerie</p><h1>Liste des conversations</h1><p>Retrouvez les échanges avec les demandeurs de justice.</p></article>' })
export class MessagesListPage { private readonly changeDetector = inject(ChangeDetectorRef); }
