import { ChangeDetectorRef, Component, inject } from '@angular/core';
@Component({ selector: 'app-profile-page', standalone: true, templateUrl: './profile.page.html' })
export class ProfilePage { private readonly changeDetector = inject(ChangeDetectorRef); }
