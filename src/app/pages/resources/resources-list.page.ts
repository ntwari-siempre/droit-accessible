import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { Resource } from '../models';

@Component({ selector: 'app-resources-list-page', standalone: true, imports: [FormsModule], templateUrl: './resources-list.page.html' })
export class ResourcesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected search = '';
  protected resources: Resource[] = [];

  ngOnInit(): void { this.api.getResources().subscribe({ next: (items) => { this.resources = items as Resource[]; this.changeDetector.detectChanges(); }, error: () => this.changeDetector.detectChanges() }); }
  protected get filtered(): Resource[] { const search = this.search.toLowerCase().trim(); return search ? this.resources.filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(search)) : this.resources; }

  /** « Lire la suite » : ouvre la fiche complète dans son composant dédié. */
  protected open(resource: Resource): void {
    this.router.navigate(['/resources', resource.id]);
  }

}

