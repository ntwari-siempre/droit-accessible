import { Routes } from '@angular/router';

import { adminGuard } from './admin.guard';
import { professionalGuard } from './professional.guard';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'home' },
	{ path: 'home', loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage) },
	{ path: 'resources', loadComponent: () => import('./pages/resources/resources-list.page').then((m) => m.ResourcesListPage) },
	{ path: 'resources/new', loadComponent: () => import('./pages/resources/resource-form.page').then((m) => m.ResourceFormPage) },
	{ path: 'resources/:id', loadComponent: () => import('./pages/resources/resource-details.page').then((m) => m.ResourceDetailsPage) },
	{ path: 'professionals', loadComponent: () => import('./pages/professionals/professionals-list.page').then((m) => m.ProfessionalsListPage) },
	{ path: 'professionals/new', loadComponent: () => import('./pages/professionals/professional-form.page').then((m) => m.ProfessionalFormRoutePage) },
	{ path: 'professionals/:id', loadComponent: () => import('./pages/professionals/professional-details.page').then((m) => m.ProfessionalDetailsPage) },
	{ path: 'appointments', loadComponent: () => import('./pages/appointments/appointments-list.page').then((m) => m.AppointmentsListPage) },
	{ path: 'appointments/new', loadComponent: () => import('./pages/appointments/appointment-form.page').then((m) => m.AppointmentFormPage) },
	{ path: 'appointments/:id', loadComponent: () => import('./pages/appointments/appointment-details.page').then((m) => m.AppointmentDetailsPage) },
	{ path: 'messages', loadComponent: () => import('./pages/messages/messages.page').then((m) => m.MessagesPage) },
	{ path: 'messages/new', loadComponent: () => import('./pages/messages/message-form.page').then((m) => m.MessageFormPage) },
	{ path: 'messages/:id', loadComponent: () => import('./pages/messages/message-details.page').then((m) => m.MessageDetailsPage) },
	/*
	 * Espace réservé à l'administrateur : seul ce rôle voit et gère tous
	 * les professionnels. Un professionnel connecté est renvoyé vers son
	 * portail personnel (il ne voit pas les autres profils).
	 */
	{
		path: 'admin',
		canActivate: [adminGuard],
		children: [
			{ path: '', loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage) },
			{ path: 'professionals', loadComponent: () => import('./pages/admin/admin-list.page').then((m) => m.AdminListPage) },
			{ path: 'professionals/:id', loadComponent: () => import('./pages/admin/admin-details.page').then((m) => m.AdminDetailsPage) },
		],
	},
	/*
	 * Portail strictement personnel d'un professionnel : son profil, ses
	 * demandes de rendez-vous et ses notifications (filtrées côté API).
	 */
	{
		path: 'portail',
		canActivate: [professionalGuard],
		loadComponent: () => import('./pages/portail/portail.page').then((m) => m.PortailPage),
	},
	/* Suivi public du citoyen : sans compte, via le code de la demande. */
	{ path: 'suivi', loadComponent: () => import('./pages/suivi/suivi.page').then((m) => m.SuiviPage) },
	{ path: 'suivi/:token', loadComponent: () => import('./pages/suivi/suivi.page').then((m) => m.SuiviPage) },
	{ path: 'profile', loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage) },
	{ path: 'profile/edit', loadComponent: () => import('./pages/profile/profile-form.page').then((m) => m.ProfileFormPage) },
	{ path: 'profile/:id', loadComponent: () => import('./pages/profile/profile-details.page').then((m) => m.ProfileDetailsPage) },
	{ path: '**', redirectTo: 'home' },
];

