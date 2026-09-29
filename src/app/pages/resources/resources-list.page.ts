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
  protected selectedCategory = 'Tout';
  protected categories: string[] = ['Tout'];
  protected resources: Resource[] = [];

  ngOnInit(): void {
    this.api.getResources().subscribe({ next: (items) => { this.resources = items as Resource[]; this.categories = ['Tout', ...new Set(this.resources.map((item) => item.category))]; this.changeDetector.detectChanges(); }, error: () => this.changeDetector.detectChanges() });
  }
  /** Filtre par categorie (pastilles) : 'Tout' re-affiche la liste complete. */
  protected selectCategory(category: string): void { this.selectedCategory = category; }
  protected get filtered(): Resource[] {
    let items = this.selectedCategory === 'Tout' ? this.resources : this.resources.filter((item) => item.category === this.selectedCategory);
    const search = this.search.toLowerCase().trim();
    if (search) { items = items.filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(search)); }
    return items;
  }

  /** « Lire la suite » : ouvre la fiche complète dans son composant dédié. */
  protected open(resource: Resource): void {
    this.router.navigate(['/resources', resource.id]);
  }

}

