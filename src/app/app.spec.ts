import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { ApiService } from './api.service';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: ApiService,
          useValue: {
            getProfessionals: () => of([]),
            getResources: () => of([]),
            getNotifications: () => of([]),
            getStats: () => of({ professionals: 0, resources: 0, appointments: 0, cities: 0 }),
            login: () => of({ token: 'test-token', user: { id: 1, username: 'admin', role: 'admin' } }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the brand in the header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header')?.textContent).toContain('Droit Accessible');
  });
});
