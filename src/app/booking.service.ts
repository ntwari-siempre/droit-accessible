import { Injectable, signal } from '@angular/core';

/**
 * État partagé de la modale de prise de rendez-vous.
 * Les pages l'ouvrent, le composant racine l'affiche au-dessus du routeur.
 */
@Injectable({
  providedIn: 'root'
})
export class BookingService {

  /** Modale visible ? */
  readonly isOpen = signal(false);

  /** Identifiant du professionnel ciblé par la demande. */
  readonly professionalId = signal(1);

  open(professionalId = 1): void {
    this.professionalId.set(professionalId);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
