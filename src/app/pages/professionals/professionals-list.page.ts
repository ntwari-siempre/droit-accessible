import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { BookingService } from '../../booking.service';
import { Professional } from '../models';

@Component({ selector: 'app-professionals-list-page', standalone: true, imports: [FormsModule], templateUrl: './professionals-list.page.html' })
export class ProfessionalsListPage implements OnInit {
  private readonly api = inject(ApiService); private readonly router = inject(Router); private readonly booking = inject(BookingService); private readonly changeDetector = inject(ChangeDetectorRef); protected search = ''; protected professionals: Professional[] = [];
  ngOnInit(): void { this.api.getProfessionals().subscribe({ next: (items) => { this.professionals = items as Professional[]; this.changeDetector.detectChanges(); }, error: () => this.changeDetector.detectChanges() }); }
  protected book(professionalId: number): void { this.booking.open(professionalId); }
  protected details(professional: Professional): void { if (!professional.id) { return; } this.router.navigate(['/professionals', professional.id]); }
  protected get filtered(): Professional[] { const search = this.search.toLowerCase().trim(); return search ? this.professionals.filter((item) => `${item.name} ${item.specialty} ${item.city}`.toLowerCase().includes(search)) : this.professionals; }
}
