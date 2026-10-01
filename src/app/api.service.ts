import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    role: string;
    /** Identifiant du profil professionnel relié au compte (null pour l'admin). */
    professionalId: number | null;
  };
}

export interface ProfessionalPayload {
  name: string;
  email: string;
  specialty: string;
  city: string;
  registration: string;
  bio: string;
  /** Identifiants du portail personnel du professionnel. */
  username: string;
  password: string;
}

export interface AppointmentRequest {
  id: number;
  professionalId: number;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  requestedDate: string;
  message: string;
  status: string;
  createdAt: string;
  professionalName: string;
  specialty: string;
  /** Email du professionnel (pour repondre a sa place). */
  professionalEmail?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private readonly http = inject(HttpClient);

  private readonly baseUrl =
    window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000/api'
      : '/api';

  // =========================
  // AUTHENTIFICATION
  // =========================

  login(
    username: string,
    password: string
  ): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.baseUrl}/auth/login`,
      {
        username,
        password
      }
    );
  }

  /** Compteurs du tableau de bord, calculés côté base de données. */
  getStats(): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/stats`);
  }

  // =========================
  // RESSOURCES
  // =========================

  getResources(): Observable<unknown[]> {
    return this.http.get<unknown[]>(
      `${this.baseUrl}/resources`
    );
  }

  /** Fiche complète d'une ressource (page « Lire la suite »). */
  getResource(id: number): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/resources/${id}`);
  }

  // =========================
  // PROFESSIONNELS
  // =========================

  getProfessionals(search = ''): Observable<unknown[]> {
    return this.http.get<unknown[]>(
      `${this.baseUrl}/professionals`,
      {
        params: search
          ? { search }
          : {}
      }
    );
  }

  registerProfessional(
    payload: ProfessionalPayload
  ): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/professionals`,
      payload
    );
  }

  /** Profil du professionnel connecté : strictement le sien. */
  getMyProfile(): Observable<unknown> {
    return this.http.get(
      `${this.baseUrl}/professionals/me`,
      {
        headers: this.authHeaders()
      }
    );
  }


  updateProfessional(
    id: number,
    payload: {
      name: string;
      email: string;
      specialty: string;
      city: string;
      registration: string;
      bio: string;
      status: string;
    },
    credentials?: {
      username?: string;
      password?: string;
    }
  ): Observable<unknown> {
    return this.http.put(
      `${this.baseUrl}/admin/professionals/${id}`,
      credentials ? { ...payload, credentials } : payload,
      {
        headers: this.authHeaders()
      }
    );
  }

  // =========================
  // RENDEZ-VOUS / DEMANDES
  // =========================

  createAppointment(
    payload: {
      professionalId: number;
      requesterName: string;
      requesterEmail: string;
      requesterPhone: string;
      requestedDate: string;
      message: string;
    }
  ): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/appointments`,
      payload
    );
  }

  getAppointments(): Observable<AppointmentRequest[]> {
    return this.http.get<AppointmentRequest[]>(
      `${this.baseUrl}/appointments`,
      {
        headers: this.authHeaders()
      }
    );
  }

  getAppointment(
    id: number
  ): Observable<AppointmentRequest> {
    return this.http.get<AppointmentRequest>(
      `${this.baseUrl}/appointments/${id}`,
      {
        headers: this.authHeaders()
      }
    );
  }

  // =========================
  // ADMINISTRATION
  // =========================

  getAdminProfessionals(): Observable<unknown[]> {
    return this.http.get<unknown[]>(
      `${this.baseUrl}/admin/professionals`,
      {
        headers: this.authHeaders()
      }
    );
  }

  /**
   * Envoie un e-mail au demandeur d'une demande (professionnel ou admin).
   * 503 = SMTP non configure : l'appelant bascule sur un mailto:.
   */
  sendAppointmentEmail(
    id: number,
    subject: string,
    body: string
  ): Observable<unknown> {
    return this.http.post(
      `${ this.baseUrl }/appointments/${ id }/email`,
      { subject, body },
      { headers: this.authHeaders() }
    );
  }

  // =========================
  // NOTIFICATIONS
  // =========================

  getNotifications(): Observable<unknown[]> {
    return this.http.get<unknown[]>(
      `${this.baseUrl}/notifications`,
      {
        headers: this.authHeaders()
      }
    );
  }

  /** Coche / décoche une demande comme traitée (professionnel ou admin). */
  updateAppointmentStatus(
    id: number,
    status: 'pending' | 'processed'
  ): Observable<unknown> {
    return this.http.patch(
      `${this.baseUrl}/appointments/${id}/status`,
      { status },
      {
        headers: this.authHeaders()
      }
    );
  }


  // =========================
  // SUIVI PUBLIC (sans compte)
  // =========================

  /** Suivi d'une demande via le code secret remis au citoyen. */
  getSuivi(
    token: string
  ): Observable<unknown> {
    return this.http.get(
      `${this.baseUrl}/suivi/${encodeURIComponent(token)}`
    );
  }


  // =========================
  // AUTH HEADERS
  // =========================

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem(
      'droit_accessible_token'
    );

    return token
      ? new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
      : new HttpHeaders();
  }
}
