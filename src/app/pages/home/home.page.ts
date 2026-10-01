import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { BookingService } from '../../booking.service';
import { Professional } from '../models';

/** Statistiques du tableau de bord, comptées côté base de données. */
interface PlatformStats {
    professionals: number;
    resources: number;
    appointments: number;
    cities: number;
}

@Component({ selector: 'app-home-page', standalone: true, imports: [FormsModule], templateUrl: './home.page.html' })
export class HomePage implements OnInit {
	private readonly api = inject(ApiService);
	private readonly router = inject(Router);
	private readonly booking = inject(BookingService);
	private readonly changeDetector = inject(ChangeDetectorRef);
	protected goResources(): void { this.router.navigate(['/resources']); }
	protected goProfessionals(): void { this.router.navigate(['/professionals']); }

	protected book(professionalId: number): void { this.booking.open(professionalId); }
	protected professionals: Professional[] = [];
	protected search = '';
	protected specialty = 'Toutes les spécialités';
	protected loading = true;
	/* Compteurs du tableau de bord, alimentés par l'endpoint /api/stats (COUNT SQL). */
	public referencedProfessionals = 0;
	public resourcesCount = 0;
	public citiesCount = 0;
	public appointmentsCount = 0;

	private currentDate = new Date();

	ngOnInit(): void {
		/* Statistiques de la base : source unique de vérité du tableau de bord. */
		this.api.getStats().subscribe({
			next: (stats) => {
				const result = stats as PlatformStats;
				this.referencedProfessionals = result.professionals;
				this.resourcesCount = result.resources;
				this.citiesCount = result.cities;
				this.appointmentsCount = result.appointments;
				this.changeDetector.detectChanges();
			},
			error: () => this.changeDetector.detectChanges()
			
		});
		this.api.getProfessionals().subscribe({
			next: (items) => {
				this.professionals = items as Professional[];
				this.loading = false;
				this.changeDetector.detectChanges();
			},
			error: () => { this.loading = false; this.changeDetector.detectChanges(); }
		});

		this.changeDetector.detectChanges();
	}

	protected get specialties(): string[] {
		return ['Toutes les spécialités', ...new Set(this.professionals.map((item) => item.specialty))];
		this.changeDetector.detectChanges();
	}

	protected get filteredProfessionals(): Professional[] {
		const search = this.search.toLowerCase().trim();
		return this.professionals.filter((professional) => {
			const matchesSearch = !search || `${professional.name} ${professional.specialty} ${professional.city}`.toLowerCase().includes(search);
			const matchesSpecialty = this.specialty === 'Toutes les spécialités' || professional.specialty === this.specialty;
			return matchesSearch && matchesSpecialty;
		});

		this.changeDetector.detectChanges();
	}


	get formattedDate(): string {
		const date = new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(this.currentDate);

		return date.charAt(0).toUpperCase() + date.slice(1);
	}
}
