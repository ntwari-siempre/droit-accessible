import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { BookingService } from '../../booking.service';
import { Professional } from '../models';

@Component({ selector: 'app-professionals-list-page', standalone: true, imports: [FormsModule], templateUrl: './professionals-list.page.html' })
export class ProfessionalsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly booking = inject(BookingService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected search = '';
  protected loading = true;
  protected filtersOpen = true;
  protected specialty = 'Toutes les spécialités';
  protected sort = 'pertinence';
  protected filterVisio = false;
  protected filterOffice = false;
  protected filterWeek = false;
  protected specialties: string[] = ['Toutes les spécialités'];
  protected professionals: Professional[] = [];

  ngOnInit(): void {
    this.api.getProfessionals().subscribe({
      next: (items) => {
        this.professionals = items as Professional[];
        this.specialties = ['Toutes les spécialités', ...new Set(this.professionals.map((item) => item.specialty))];
        this.loading = false;
        this.changeDetector.detectChanges();
      },
      error: () => { this.loading = false; this.changeDetector.detectChanges(); }
    });
  }

  protected toggleFilters(): void { this.filtersOpen = !this.filtersOpen; }

  protected resetFilters(): void {
    this.specialty = 'Toutes les spécialités';
    this.sort = 'pertinence';
    this.filterVisio = false;
    this.filterOffice = false;
    this.filterWeek = false;
  }

  protected book(professionalId: number): void { this.booking.open(professionalId); }
  protected details(professional: Professional): void { if (!professional.id) { return; } this.router.navigate(['/professionals', professional.id]); }

  protected get filtered(): Professional[] {
    let items = this.professionals;
    if (this.specialty !== 'Toutes les spécialités') { items = items.filter((item) => item.specialty === this.specialty); }
    if (this.filterVisio || this.filterOffice) {
      const modes = (item: Professional): string => (item.modes ?? '').toLowerCase();
      items = items.filter((item) => (this.filterVisio && modes(item).includes('visio')) || (this.filterOffice && modes(item).includes('cabinet')));
    }
    if (this.filterWeek) { items = items.filter((item) => item.available.toLowerCase().includes('semaine')); }
    const search = this.search.toLowerCase().trim();
    if (search) { items = items.filter((item) => `${item.name} ${item.specialty} ${item.city}`.toLowerCase().includes(search)); }
    if (this.sort === 'rating') { items = [...items].sort((a, b) => parseFloat(b.rating.replace(',', '.')) - parseFloat(a.rating.replace(',', '.'))); }
    else if (this.sort === 'name') { items = [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr')); }
    else if (this.sort === 'city') { items = [...items].sort((a, b) => a.city.localeCompare(b.city, 'fr')); }
    return items;
  }
}

