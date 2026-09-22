# Droit Accessible

Portail Angular d'information juridique et de mise en relation avec des professionnels du droit, avec API Express et PostgreSQL.

## Prerequis

- Node.js 22+
- PostgreSQL 16/17 en local, ou Docker
- Une base `droit_accessible`

## Configuration PostgreSQL locale

Copier `server/.env.example` vers `server/.env`, puis remplacer le mot de passe par celui du role PostgreSQL local :

```env
DATABASE_URL=postgres://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/droit_accessible
JWT_SECRET=une-cle-secrete-de-developpement
```

Creer la base si elle n'existe pas :

```powershell
createdb -U postgres droit_accessible
```

Le backend cree automatiquement les tables et les donnees de demonstration au premier demarrage. Le compte de demonstration est `admin` / `admin123`.

Alternative avec Docker :

```powershell
npm run db:up
```

## Lancer le projet

Terminal 1, API :

```powershell
npm run server
```

Terminal 2, Angular avec proxy `/api` :

```powershell
npm start
```

Application : `http://localhost:4200/`  
API : `http://localhost:3000/`  
Health check : `http://localhost:3000/api/health`

## Endpoints principaux

- `POST /api/auth/login`
- `GET /api/resources`
- `GET /api/professionals?search=travail`
- `POST /api/professionals`
- `POST /api/appointments` avec Bearer JWT
- `GET /api/admin/professionals` avec Bearer JWT admin
- `PATCH /api/admin/professionals/:id/status` avec Bearer JWT admin

## Déploiement gratuit en ligne (Render + Neon)

Le projet s'héberge gratuitement sur un cloud en **un seul service** :

| Élément | Hébergeur (gratuit) | Limite gratuite |
|---|---|---|
| API Express + site Angular compilé | [Render.com](https://render.com) | Service s'endort après 15 min d'inactivité (~40 s au réveil) |
| PostgreSQL | [Neon.tech](https://neon.tech) | 0,5 Go, **sans expiration**, se met en veille |

### Étapes

1. **GitHub** — pousser ce dépôt (le `.gitignore` protège déjà `server/.env` et `keyGoogle`) :

   ```powershell
   git remote add origin https://github.com/VOTRE_COMPTE/droit-accessible.git
   git push -u origin main
   ```

2. **Neon** — créer un compte, un projet (« droit-accessible »), puis copier la
   **connection string** (format `postgresql://user:pass@ep-xxx...neon.tech/neondb?sslmode=require`).
   Les tables et données de démonstration sont créées automatiquement au premier démarrage.

3. **Render** — « New + » → **Blueprint**, sélectionner le dépôt GitHub : le fichier
   `render.yaml` préconfigure le service (build Angular + démarrage Express, santé `/api/health`).
   Renseigner la variable secrète **`DATABASE_URL`** avec l'URL Neon. `JWT_SECRET` est généré
   automatiquement.

4. **Vérifier** — ouvrir l'URL `https://VOTRE-SERVICE.onrender.com` :
   - la page d'accueil Angular s'affiche ;
   - `https://VOTRE-SERVICE.onrender.com/api/health` répond `{"status":"ok","database":"connected"}` ;
   - connexion admin : `admin` / `admin123` (à changer !).

### En production, un seul processus fait tout

`server/index.ts` sert le build Angular (`dist/calvin-ui/browser`) avec un fallback SPA,
puis l'API sous `/api` : une seule URL, pas de CORS ni de proxy à configurer. En local,
conserver les deux terminaux (`npm run server` + `npm start`) comme décrit ci-dessus.

### Alternative 100 % Render

Un PostgreSQL Render gratuit est aussi possible via le Blueprint, mais il **expire 30 jours
après sa création** : Neon est recommandé pour une base durable.


## Validation

```powershell
npm run build
npx tsc --noEmit --ignoreConfig --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop server/index.ts
```
# CalvinUi

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
