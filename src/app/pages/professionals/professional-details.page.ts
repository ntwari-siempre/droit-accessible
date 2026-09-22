import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { BookingService } from '../../booking.service';
import { Professional } from '../models';

@Component({ selector: 'app-professional-details-page', standalone: true, templateUrl: './professional-details.page.html' })
export class ProfessionalDetailsPage implements OnInit {
  private readonly api = inject(ApiService); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); private readonly booking = inject(BookingService); private readonly changeDetector = inject(ChangeDetectorRef);
  protected loading = true;
  protected professional = signal<Professional | undefined>(undefined);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getProfessionals().subscribe({
      next: (items) => { this.professional.set((items as Professional[]).find((item) => item.id === id)); this.loading = false; this.changeDetector.detectChanges(); },
      error: () => { this.loading = false; this.changeDetector.detectChanges(); },
    });
  }

  protected back(): void { this.router.navigate(['/professionals']); }
  protected book(): void { this.booking.open(this.professional()?.id ?? 1); }
}
