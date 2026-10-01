# 🛠️ Manuel de maintenance — Droit Accessible

Guide pratique pour comprendre le projet, savoir **où intervenir** et **comment
maintenir** chaque fonctionnalité. À lire avant toute modification.

---

## 1. Vue d'ensemble

```
Navigateur (visiteurs, professionnels, admin)
        │
        ▼
Render.com — UN SEUL SERVICE Node (gratuit)
  ├── Express (server/index.ts)  →  API sous /api
  └── Fichiers Angular compilés  →  site (dist/calvin-ui/browser)
        │
        ▼
Neon.tech — PostgreSQL gratuit (tables créées automatiquement au 1er démarrage)
```

- En **production** : un seul processus fait tout (site + API), zéro CORS.
- En **local** : `npm run server` (API : 3000) + `npm start` (Angular : 4200).

---

## 2. Cartographie des fichiers — où intervenir

### Backend (`server/index.ts` — TOUT l'API)

| Zone (repère dans le fichier) | Rôle | Quand le modifier |
|---|---|---|
| `const schema` | Création des tables : `users`, `professionals`, `resources`, `appointments`, `notifications` | Ajouter un champ/une table |
| `initializeDatabase()` | Seed auto : admin `admin/admin123`, 4 fiches, 3 professionnels de démo, codes de suivi | Changer les données de démo |
| `GET /api/health` | Sonde de santé (utilisée par Render) | Rarement |
| `POST /api/auth/login` | Connexion (JWT 8 h, rôles `admin` / `professional`) | Durée de session, règles |
| `GET /api/stats` | **Compteurs du Dashboard** (COUNT SQL : pros, fiches, demandes, villes) | Ajouter une statistique |
| `GET /api/resources` + `GET /api/resources/:id` | Liste des fiches + **page « Lire la suite »** | Contenu des fiches |
| `GET/POST /api/professionals` | Annuaire public + inscription d'un pro | Règles de visibilité |
| `GET /api/professionals/me` | Profil du pro connecté (portail) | — |
| `GET/PUT /api/admin/professionals...` | Gestion admin + création des identifiants de portail | — |
| `POST /api/appointments` | Demande de RDV → génère le **code de suivi** (`access_token`) + notification | Formulaire demandeur |
| _(supprimé : messagerie)_ | La messagerie a été retirée du projet (page, API et table `chat_messages`) | — |
| `GET /api/suivi/:token` | **Statut de la demande** du justiciable SANS compte (via son code) | — |
| `GET /api/notifications`, `PATCH .../status` | Notifications + demande traitée/rouverte | — |
| Bloc `Servir le frontend Angular en production` | Statique + fallback SPA (fin du fichier) | Hébergement |

### Frontend (`src/app/`)

| Fichier | Rôle | Maintenance typique |
|---|---|---|
| `api.service.ts` | Toutes les méthodes HTTP + types partagés | Ajouter un appel d'API |
| `auth.service.ts` | Session (localStorage), rôles admin/pro | Durée de session côté client |
| `app.routes.ts` | Toutes les URLs du site | Ajouter une page |
| `app.html` / `app.css` | Squelette + styles globaux (header, panneaux…) | Design |
| `pages/home/` | **Dashboard public** (4 compteurs via `/api/stats`) | Nouvelle statistique |
| `pages/resources/resources-list.*` | Liste des fiches + bouton **« Lire la suite »** (→ `/resources/:id`) | Grille, recherche |
| `pages/resources/resource-details.*` | **Page de lecture complète** d'une fiche | Contenu enrichi par fiche |
| _(supprimé : messagerie)_ | La page Messagerie a été retirée (avec la table `chat_messages`) | — |
| `pages/suivi/suivi.*` | **Espace du justiciable sans compte** — code de suivi + statut de la demande | — |
| `pages/portail/` | Espace perso du professionnel | — |
| `pages/admin/` | Gestion des professionnels + création de comptes portail | — |
| `pages/professionals/`, `pages/appointments/`, `pages/profile/` | Annuaire, demandes, profils | — |
| `pages/models.ts` | Interfaces `Resource`, `Professional` | Nouveaux champs |

### Configuration & déploiement

| Fichier | Rôle |
|---|---|
| `render.yaml` | Blueprint Render : build `npm install --include=dev && npm run build`, démarrage `npm run server`, santé `/api/health`, `JWT_SECRET` auto |
| `.gitignore` | **Exclut `server/.env` et `keyGoogle`** (secrets) — ne pas versionner |
| `server/.env` (local, NON versionné) | `DATABASE_URL`, `JWT_SECRET`, `PORT`, `FRONTEND_URL` |
| Variables Render (dashboard) | `DATABASE_URL` (Neon) + `JWT_SECRET` (généré) |
| `docker-compose.yml` | PostgreSQL local (`npm run db:up`) |

---

## 3. Tâches de maintenance courantes

### a) Déployer une modification
```powershell
npm run build          # vérifier que ça compile
git add -A ; git commit -m "Description du changement"
git push               # Render redéploie AUTOMATIQUEMENT (~3-5 min)
```

### b) Changer le mot de passe admin
```powershell
# 1) Générer le hash (remplacer NOUVEAU_MOT_DE_PASSE) :
node -e "console.log(require('bcryptjs').hashSync('NOUVEAU_MOT_DE_PASSE',10))"
# 2) Neon → onglet SQL Editor → exécuter :
#    UPDATE users SET password_hash='LE_HASH_ICI' WHERE username='admin';
```

### c) Ajouter / modifier une fiche pratique
Neon → **SQL Editor** :
```sql
INSERT INTO resources (category, title, description, read_time, color)
VALUES ('Logement', 'Titre de la fiche', 'Résumé affiché dans la liste.', '6 min', 'mint');
```
La fiche apparaît aussitôt (liste + « Lire la suite »). Couleurs valides : `coral`, `mint`, `yellow`, `blue`.

### d) Créer un professionnel
Via le site : compte **admin** → onglet « Professionnels » → formulaire. Il est créé avec ses identifiants de portail (username + mot de passe).


### e) Rafraîchir le statut d'une demande
La page `/suivi` charge le statut au clic sur « Ouvrir ma demande » (plus de polling automatique).

### f) Rotation du secret JWT
Render → Environment → `JWT_SECRET` → *Generate new value* → Save (déconnecte toutes les sessions).

### g) Sauvegarder la base
Neon → projet → **Branches/Backup**, ou export local :
```powershell
$env:PGPASSWORD="MOT_DE_PASSE_NEON"
pg_dump --host=ep-xxx.neon.tech --username=neondb_owner --dbname=neondb --no-owner > backup.sql
```

---

## 4. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| **404 sur `https://xxx.onrender.com`** | Aucun service Live à cette URL (déploiement non créé/échoué, ou nom différent avec suffixe) | Render → vérifier le **nom du service** et l'**URL exacte** affichée en haut de la page |
| 502 / « Service Unavailable » | Service réveillé mais app plantée | Render → **Logs** → lire l'erreur de démarrage |
| Première visite très lente (~40 s) | Plan gratuit : le service **s'endort après 15 min** d'inactivité | Normal — recharger la page |
| `/api/health` → `{"database":"unavailable"}` | `DATABASE_URL` absente/erronée sur Render | Render → Environment → recoller l'URL Neon (`?sslmode=require` inclus) |
| « Impossible de charger vos conversations » | Service en réveil (cold start) ou session expirée (8 h) | Attendre ~40 s, se reconnecter |
| Build Render échoue sur `ng` introuvable | Dépendances dev manquantes | Le `render.yaml` utilise déjà `--include=dev` — ne pas le retirer |

---

## 5. Checklist sécurité

- [ ] Mot de passe `admin123` **changé** (voir 3.b)
- [ ] `JWT_SECRET` différent de la valeur de développement (généré par Render ✅)
- [ ] `server/.env` jamais commité (protégé par `.gitignore` ✅)
- [ ] URL Neon jamais écrite dans le code ni partagée
- [ ] `keyGoogle` jamais commité (protégé ✅)

---

---

## 6. Référence API complète

### Tableau des endpoints

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Publique | Sonde de santé (status + base de données) |
| `POST` | `/api/auth/login` | Publique | Connexion (JWT 8 h, rôles `admin` / `professional`) |
| `GET` | `/api/stats` | Publique | Compteurs du dashboard (COUNT SQL) |
| `GET` | `/api/resources` | Publique | Liste des fiches pratiques |
| `GET` | `/api/resources/:id` | Publique | Détail d'une fiche |
| `GET` | `/api/professionals` | Publique | Annuaire public (filtres : `search`, `specialty`) |
| `POST` | `/api/professionals` | Publique | Inscription d'un professionnel (crée un compte portail) |
| `GET` | `/api/professionals/me` | `professional` | Profil du professionnel connecté |
| `GET` | `/api/admin/professionals` | `admin` | Liste complète des professionnels |
| `PUT` | `/api/admin/professionals/:id` | `admin` | Modification d'un professionnel + identifiants de portail |
| `PATCH` | `/api/admin/professionals/:id/status` | `admin` | Activer/désactiver un professionnel |
| `POST` | `/api/appointments` | `professional` | Créer une demande de RDV (→ code de suivi + notification) |
| `GET` | `/api/appointments` | `professional` | Liste des demandes du professionnel |
| `GET` | `/api/appointments/:id` | `professional` / `admin` | Détail d'une demande (scopé au pro) |
| _(supprimé)_ | — | — | Messagerie retirée du projet |
| `GET` | `/api/suivi/:token` | Publique (via code) | Statut de la demande |
| `GET` | `/api/notifications` | `professional` | Notifications non lues du professionnel |
| `PATCH` | `/api/notifications/:id/status` | `professional` | Marquer notification comme lue |
| `PATCH` | `/api/appointments/:id/status` | `professional` / `admin` | Traiter/rouvrir une demande |
*Fichier généré le 22/09/2026 — à mettre à jour à chaque évolution structurelle du projet.*


### Exemples de requêtes

```powershell
# Connexion admin
curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"admin123"}'

# Récupérer les stats du dashboard
curl http://localhost:3000/api/stats

# Rechercher un professionnel
curl "http://localhost:3000/api/professionals?search=travail"

# Créer une demande (avec JWT dans le header)
curl -X POST http://localhost:3000/api/appointments `
  -H "Authorization: Bearer <JWT>" `
  -H "Content-Type: application/json" `
  -d '{"professionalId":1,"requesterName":"Jean Dupont","requestedDate":"2026-10-01","message":"Besoin de conseil"}'
```

---

## 7. Référence du schéma de base de données

### Table `users`

| Colonne | Type | Défaut | Description |
|---|---|---|---|
| `id` | SERIAL PK | — | Identifiant unique |
| `username` | VARCHAR(80) UNIQUE | — | Identifiant de connexion |
| `password_hash` | TEXT | — | Hash bcrypt (10 rounds) |
| `role` | VARCHAR(30) | `'professional'` | `admin` ou `professional` |
| `created_at` | TIMESTAMPTZ | `NOW()` | Date de création |

### Table `professionals`

| Colonne | Type | Défaut | Description |
|---|---|---|---|
| `id` | SERIAL PK | — | Identifiant unique |
| `user_id` | INTEGER FK → `users(id)` | — | Lien vers le compte utilisateur |
| `name` | VARCHAR(160) | — | Nom du professionnel |
| `email` | VARCHAR(180) | — | Email professionnel |
| `role` | VARCHAR(160) | `'Professionnel du droit'` | Intitulé du rôle |
| `specialty` | VARCHAR(120) | — | Spécialité (ex. Droit du travail) |
| `city` | VARCHAR(120) | — | Ville d'exercice |
| `registration` | VARCHAR(120) | — | Numéro d'inscription (BAR-...) |
| `bio` | TEXT | `''` | Biographie |
| `status` | VARCHAR(30) | `'pending'` | `pending` / `approved` / `suspended` |
| `rating` | NUMERIC(2,1) | `5.0` | Note (0.0 – 5.0) |
| `availability` | VARCHAR(120) | `'Disponible cette semaine'` | Disponibilité |
| `created_at` | TIMESTAMPTZ | `NOW()` | Date de création |

### Table `resources` (fiches pratiques)

| Colonne | Type | Défaut | Description |
|---|---|---|---|
| `id` | SERIAL PK | — | Identifiant unique |
| `category` | VARCHAR(120) | — | Catégorie (Logement, Travail, Famille…) |
| `title` | VARCHAR(180) | — | Titre de la fiche |
| `description` | TEXT | — | Résumé affiché dans la liste |
| `read_time` | VARCHAR(30) | — | Durée de lecture estimée |
| `color` | VARCHAR(30) | `'blue'` | Couleur d'accent : `coral`, `mint`, `yellow`, `blue` |
| `created_at` | TIMESTAMPTZ | `NOW()` | Date de création |

### Table `appointments` (demandes de RDV)

| Colonne | Type | Défaut | Description |
|---|---|---|---|
| `id` | SERIAL PK | — | Identifiant unique |
| `professional_id` | INTEGER FK → `professionals(id)` | — | Professionnel concerné |
| `requester_name` | VARCHAR(160) | — | Nom du demandeur |
| `requester_email` | VARCHAR(180) | `''` | Email du demandeur (ajouté par migration) |
| `requester_phone` | VARCHAR(40) | `''` | Téléphone du demandeur (ajouté par migration) |
| `requested_date` | DATE | — | Date souhaitée du RDV |
| `message` | TEXT | `''` | Message du demandeur |
| `status` | VARCHAR(30) | `'pending'` | `pending` / `processed` |
| `access_token` | VARCHAR(64) UNIQUE | — | Code de suivi pour le justiciable |
| `created_at` | TIMESTAMPTZ | `NOW()` | Date de création |

### Table `notifications`

| Colonne | Type | Défaut | Description |
|---|---|---|---|
| `id` | SERIAL PK | — | Identifiant unique |
---

## 8. Procédures de test et vérification

### a) Vérifier que le projet compile

```powershell
npm run build
```

En cas d'erreur, vérifier que les types Angular et TypeScript sont cohérents :

```powershell
npx tsc --noEmit --ignoreConfig --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop server/index.ts
```

### b) Vérifier la santé de l'API

```powershell
npm run api:health
# Attendu : {"status":"ok","database":"connected"}
```

### c) Lancer les tests unitaires

```powershell
ng test
```

### d) Vérifier la connectivité PostgreSQL locale

```powershell
# Avec Docker
docker exec -it droit-accessible-postgres psql -U postgres -d droit_accessible -c "SELECT COUNT(*) FROM professionals;"

# Avec psql direct
$env:PGPASSWORD="postgres"
psql -h localhost -U postgres -d droit_accessible -c "\dt"
```

### e) Vérifier les endpoints avec curl

```powershell
# Sans authentification
curl http://localhost:3000/api/health
curl http://localhost:3000/api/resources
curl http://localhost:3000/api/professionals

# Avec authentification (JWT)
$token = (curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"admin123"}').content | ConvertFrom-Json | Select-Object -ExpandProperty token

curl http://localhost:3000/api/admin/professionals -H "Authorization: Bearer $token"
```
| `professional_id` | INTEGER FK CASCADE | — | Propriétaire de la notification |
| `appointment_id` | INTEGER FK CASCADE | — | Demande associée |
| `title` | VARCHAR(180) | — | Titre |
| `message` | TEXT | — | Contenu |
| `read_at` | TIMESTAMPTZ | NULL | Rempli quand lu |
| `created_at` | TIMESTAMPTZ | `NOW()` | Date de création |

### Table `chat_messages` — supprimée

La table a été retirée du schéma et supprimée de la base (`DROP TABLE IF EXISTS`). Aucune conversation ne peut plus être échangée.

---

## 8. Procédures de test et vérification

### a) Vérifier que le projet compile

```powershell
npm run build
```

En cas d'erreur, vérifier que les types Angular et TypeScript sont cohérents :

```powershell
npx tsc --noEmit --ignoreConfig --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop server/index.ts
```

### b) Vérifier la santé de l'API

```powershell
npm run api:health
# Attendu : {"status":"ok","database":"connected"}
```

### c) Lancer les tests unitaires

```powershell
ng test
```

### d) Vérifier la connectivité PostgreSQL locale

```powershell
# Avec Docker
docker exec -it droit-accessible-postgres psql -U postgres -d droit_accessible -c "SELECT COUNT(*) FROM professionals;"

# Avec psql direct
$env:PGPASSWORD="postgres"
psql -h localhost -U postgres -d droit_accessible -c "\dt"
```

### e) Vérifier les endpoints avec curl

```powershell
# Sans authentification
curl http://localhost:3000/api/health
curl http://localhost:3000/api/resources
curl http://localhost:3000/api/professionals

# Avec authentification (JWT)
$token = (curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"admin123"}').content | ConvertFrom-Json | Select-Object -ExpandProperty token

curl http://localhost:3000/api/admin/professionals -H "Authorization: Bearer $token"
```

---

## 9. Restauration et migration de la base de données

### Restaurer depuis un backup

```powershell
# 1. S'assurer que le serveur PostgreSQL est en cours (Docker ou local)
npm run db:up

# 2. Restaurer
$env:PGPASSWORD="postgres"
psql -h localhost -U postgres -d droit_accessible -f backup.sql
```

### Migration de schéma sécurisée

Le schéma est créé automatiquement au démarrage via `initializeDatabase()`. Pour ajouter une colonne ou une table :

1. **Via SQL directement** (Neon ou PostgreSQL local) :
   ```sql
   -- Ajouter une colonne
   ALTER TABLE professionals ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NOT NULL DEFAULT '';

   -- Ajouter une table
   CREATE TABLE IF NOT EXISTS feedback (
     id SERIAL PRIMARY KEY,
     name VARCHAR(160) NOT NULL,
     email VARCHAR(180) NOT NULL,
     message TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

2. **Mettre à jour `initializeDatabase()`** dans `server/index.ts` pour que le schéma soit recréé correctement en cas de recréation complète.

3. **Vérifier** les données existantes ne sont pas impactées (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` est sûr).
---

## 10. Monitoring et observabilité

### Health check structuré

```powershell
# Vérification complète
curl http://localhost:3000/api/health
# Réponse attendue :
# {
#   "status": "ok",
#   "database": "connected"
# }
```

### Structure des logs du serveur

| Type | Exemple | Cause |
|---|---|---|
| Démarrage | `API Droit Accessible: http://localhost:3000` | Démarrage normal |
| Erreur DB | `Impossible de démarrer PostgreSQL` | `DATABASE_URL` manquante/erronée |
| Erreur 500 | `Error: ...` (log au moment d'un crash) | Bug applicatif |
| Erreur 401 | `Session invalide ou expirée` | JWT expiré ou absent |

### Render → Monitoring

- **Logs** : Service → onglet Logs (en temps réel)
- **Metrics** : Service → onglet Metrics (CPU, RAM, requests) — plan gratuit limité
- **Health** : Vérifié automatiquement toutes les 15 minutes via `/api/health`

### Vérifications régulières recommandées

- [ ] Hebdomadaire : Vérifier les logs Render (erreurs)
- [ ] Mensuelle : Vérifier l'utilisation disque Neon (0,5 Go max)
- [ ] Mensuelle : Sauvegarder la base de données
---

## 14. Articles publiés par les professionnels

### Description

Les professionnels peuvent publier des articles (codes pénaux, droits et devoirs, jurisprudence, etc.) pour informer les justiciables et le public. Ces publications sont accessibles sans authentification mais seuls les professionnels connectés peuvent rédiger et publier.

### Schéma de la table `articles`

```sql
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) UNIQUE NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT 'droit_penal',
  tags TEXT[] NOT NULL DEFAULT '{}',
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Endpoints API

| Méthode | Route | Auth | Description |
### Exemples de requêtes

```powershell
# Lister les articles publiés (public)
curl http://localhost:3000/api/articles?published=true&category=droit_penal

# Détail d'un article
curl http://localhost:3000/api/articles/le-code-penal-defaut

# Créer un article (authentification requise)
curl -X POST http://localhost:3000/api/articles `
  -H "Authorization: Bearer <JWT>" `
  -H "Content-Type: application/json" `
  -d '{
    "title": "Les droits du suspect selon l'article 15",
    "slug": "les-droits-du-suspect-article-15",
    "excerpt": "Résumé des droits fondamentaux...",
    "content": "Contenu détaillé de l'article...",
    "category": "droit_penal",
    "tags": ["procédure", "droits-fondamentaux"]
  }'

# Publier un article
curl -X PATCH http://localhost:3000/api/articles/1/publish `
  -H "Authorization: Bearer <JWT>"
```

### Procédure de publication

1. Le professionnel se connecte à son portail
2. Il accède à la section **« Articles »** du menu
3. Il rédige son article (titre, résumé, contenu, catégorie, tags)
4. Il sauvegarde en tant que **brouillon** ou clique sur **« Publier »**
5. L'article apparaît immédiatement dans la liste publique
6. Le public peut le lire sans connexion

### Catégories disponibles

---

## 15. Messagerie — supprimée

La messagerie a été entièrement retirée du projet : page `/messages`, entrées de menu,
routes Angular, méthodes `ApiService`, endpoints `GET/POST /api/appointments/:id/messages`,
`POST /api/suivi/:token` et table `chat_messages`.

La page `/suivi` affiche d.sormais uniquement le **statut** de la demande (plus de conversation).


## 16. Bouton « Contacter par e-mail » (professionnel -> demandeur)

### Ce qui est implemente

Page **Mes rendez-vous** (`pages/appointments/`) : le bouton ouvre une modale de
redaction (objet + message pre-remplis avec le nom et la date de la demande).
L envoi passe par `POST /api/appointments/:id/email` :

| Etape | Fichier | Detail |
|---|---|---|
| Modale + logique | `pages/appointments/appointments-list.page.*` | `openEmail()`, `sendEmail()`, `sendByMailto()` |
| Appel HTTP | `api.service.ts` | `sendAppointmentEmail(id, subject, body)` |
| Endpoint | `server/index.ts` | `POST /api/appointments/:id/email` |
| Transport | `server/index.ts` | `nodemailer`, cree seulement si SMTP est configure |

Regle d acces identique a `PATCH /api/appointments/:id/status` : un professionnel
ecrit uniquement a SES demandes, l administrateur a toutes.

### Repli sans SMTP

Si `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` manquent, le transport n est pas cree
l API repond **503** et le client bascule sur un `mailto:` : le bouton fonctionne
donc meme sans configuration, en ouvrant le logiciel de messagerie du professionnel.

### Activer l envoi reel

1. Creer un compte gratuit sur **brevo.com** (300 e-mails/jour).
2. Smozle -> SMTP & API -> Generer une cle SMTP.
3. Renseigner les variables dans `server/.env` (local) et dans Render (production) :

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=...
```
## 17. Responsivité des tableaux sur mobile

### Objectif

Transformer les tableaux en cartes empilées sur les petits écrans (< 768px).

### Implémentation CSS recommandée

Dans `app.css`, ajouter :

```css
/* --- Responsive Tables → Cards --- */
@media (max-width: 768px) {
  table.app-table {
    display: block;
    overflow-x: auto;
  }
  
  .responsive-table tbody tr {
    display: block;
    margin-bottom: 16px;
    border: 1px solid #e9e9e5;
    border-radius: 8px;
    padding: 12px;
    background: #fff;
  }
  
  .responsive-table th { display: none; }
  
  .responsive-table td {
    display: flex;
    justify-content: space-between;
    padding: 8px 4px;
    border: none;
    text-align: right;
  }
  
  .responsive-table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: #858b87;
    text-align: left;
    margin-right: 16px;
  }
}
```

### Utilisation dans les templates HTML

```html
<table class="app-table responsive-table">
  <thead>
    <tr>
      <th>Nom</th>
      <th>Spécialité</th>
      <th>Ville</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr *ngFor="let item of items">
      <td data-label="Nom">{{ item.name }}</td>
      <td data-label="Spécialité">{{ item.specialty }}</td>
      <td data-label="Ville">{{ item.city }}</td>
      <td data-label="Actions">...</td>
    </tr>
  </tbody>
</table>
```

---

## 18. Checklist de publication d'articles

### Avant publication

- [ ] Article rédigé dans la section « Articles » du portail professionnel
- [ ] Titre clair et descriptif
- [ ] Résumé court (maximum 200 caractères)
- [ ] Contenu détaillé avec références juridiques
- [ ] Catégorie sélectionnée (droit pénal, civil, travail, etc.)
- [ ] Tags pertinents ajoutés

### Après publication

- [ ] Article visible dans la section publique « Articles »
- [ ] Recherche fonctionnelle (filtre par catégorie/tag)
- [ ] Partage possible via lien direct

- `droit_penal` — Code pénal, infractions, sanctions
- `droit_civil` — Droit civil, contrats, familles
- `droit_travail` — Droit du travail, salariés, employeurs
- `droit_logement` — Locataire, propriétaire, expulsion
- `droit_consommation` — Consommateur, litiges, garanties
- `procedure` — Procédure judiciaire, délais, recours

### Mise à jour de `initializeDatabase()` dans `server/index.ts`

Ajouter la création de la table `articles` et des données de démonstration optionnelles dans la fonction `initializeDatabase()`.

### Maintenance

- Les articles publiés ne peuvent pas être supprimés par l'admin (seul l'auteur peut le faire)
- Un article publié reste visible même si le professionnel est désactivé
- Le slug est généré automatiquement à partir du titre (URL-friendly)
|---|---|---|---|
| `GET` | `/api/articles` | Publique | Liste des articles publiés |
| `GET` | `/api/articles/:slug` | Publique | Détail d'un article par slug |
| `GET` | `/api/articles/draft` | `professional` | Brouillons du professionnel connecté |
| `POST` | `/api/articles` | `professional` | Créer un nouvel article (brouillon) |
| `PUT` | `/api/articles/:id` | `professional` | Mettre à jour un article |
| `PATCH` | `/api/articles/:id/publish` | `professional` | Publier un article |
| `DELETE` | `/api/articles/:id` | `professional` | Supprimer un article |
- [ ] Trimestrielle : Changer le mot de passe admin
