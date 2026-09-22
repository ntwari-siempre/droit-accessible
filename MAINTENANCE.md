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
| `const schema` | Création des tables : `users`, `professionals`, `resources`, `appointments`, `notifications`, `chat_messages` | Ajouter un champ/une table |
| `initializeDatabase()` | Seed auto : admin `admin/admin123`, 4 fiches, 3 professionnels de démo, codes de suivi | Changer les données de démo |
| `GET /api/health` | Sonde de santé (utilisée par Render) | Rarement |
| `POST /api/auth/login` | Connexion (JWT 8 h, rôles `admin` / `professional`) | Durée de session, règles |
| `GET /api/stats` | **Compteurs du Dashboard** (COUNT SQL : pros, fiches, demandes, villes) | Ajouter une statistique |
| `GET /api/resources` + `GET /api/resources/:id` | Liste des fiches + **page « Lire la suite »** | Contenu des fiches |
| `GET/POST /api/professionals` | Annuaire public + inscription d'un pro | Règles de visibilité |
| `GET /api/professionals/me` | Profil du pro connecté (portail) | — |
| `GET/PUT /api/admin/professionals...` | Gestion admin + création des identifiants de portail | — |
| `POST /api/appointments` | Demande de RDV → génère le **code de suivi** (`access_token`) + notification | Formulaire demandeur |
| `GET/POST /api/appointments/:id/messages` | **Chat côté professionnel/admin** | — |
| `GET/POST /api/suivi/:token` | **Chat du justiciable SANS compte** (via son code) | — |
| `GET /api/notifications`, `PATCH .../status` | Notifications + demande traitée/rouverte | — |
| Bloc `Servir le frontend Angular en production` | Statique + fallback SPA (fin du fichier) | Hébergement |

### Frontend (`src/app/`)

| Fichier | Rôle | Maintenance typique |
|---|---|---|
| `api.service.ts` | Toutes les méthodes HTTP + types partagés | Ajouter un appel d'API |
| `auth.service.ts` | Session (localStorage), rôles admin/pro | Durée de session côté client |
| `app.routes.ts` | Toutes les URLs du site | Ajouter une page |
| `app.html` / `app.css` | Squelette + styles globaux (header, chat, panneaux…) | Design |
| `pages/home/` | **Dashboard public** (4 compteurs via `/api/stats`) | Nouvelle statistique |
| `pages/resources/resources-list.*` | Liste des fiches + bouton **« Lire la suite »** (→ `/resources/:id`) | Grille, recherche |
| `pages/resources/resource-details.*` | **Page de lecture complète** d'une fiche | Contenu enrichi par fiche |
| `pages/messages/messages.*` | **Messagerie du professionnel** — chat par demande, **polling 5 s** (`REFRESH_INTERVAL_MS`) | Vitesse du chat |
| `pages/suivi/suivi.*` | **Espace du justiciable sans compte** — code de suivi + chat, **polling 5 s** | Vitesse du chat |
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

### e) Régler la vitesse du chat
Constante `REFRESH_INTERVAL_MS = 5000` dans **les deux** fichiers :
`src/app/pages/messages/messages.page.ts` et `src/app/pages/suivi/suivi.page.ts`.

### f) Voir les logs de production
Render → service `droit-accessible` → onglet **Logs** (erreurs API, démarrages).

### g) Rotation du secret JWT
Render → Environment → `JWT_SECRET` → *Generate new value* → Save (déconnecte toutes les sessions).

### h) Sauvegarder la base
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

*Fichier généré le 22/09/2026 — à mettre à jour à chaque évolution structurelle du projet.*


