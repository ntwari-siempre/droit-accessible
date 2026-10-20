import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';
import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import nodemailer from 'nodemailer';

dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET ?? 'droit-accessible-development-secret';
const databaseUrl = process.env.DATABASE_URL;
/*
 * Configuration MySQL : priorite aux variables dediees (DB_HOST, DB_PORT,
 * DB_USER, DB_PASSWORD, DB_NAME) ; sinon la connexion est deduite de
 * DATABASE_URL lorsqu'elle est au format mysql://utilisateur:motdepasse@hote:port/base.
 */
const dbConfig = (() => {
  const host = process.env.DB_HOST ?? 'localhost';
  const port = Number(process.env.DB_PORT ?? 3306);
  const user = process.env.DB_USER ?? 'calvin';
  const password = process.env.DB_PASSWORD ?? 'calvin123';
  const database = process.env.DB_NAME ?? 'droit_accessible';
  if (!databaseUrl) {
    return { host, port, user, password, database };
  }
  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error(
      'DATABASE_URL doit pointer vers une base MySQL (mysql://user:pass@hote:port/base) ou utiliser DB_HOST, DB_PORT, DB_USER, DB_PASSWORD et DB_NAME.'
    );
  }
  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname || host,
      port: parsed.port ? Number(parsed.port) : port,
      user: parsed.username ? decodeURIComponent(parsed.username) : user,
      password: parsed.password ? decodeURIComponent(parsed.password) : password,
      database: parsed.pathname.replace(/^\//, '') || database,
    };
  } catch {
    return { host, port, user, password, database };
  }
})();

const pool: Pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  dateStrings: true,
});

/* ---------- Helpers MySQL ---------- */

type Executor = Pool | PoolConnection;

/** SELECT : renvoie directement le tableau de lignes. */
async function select(sql: string, params: unknown[] = [], db: Executor = pool): Promise<RowDataPacket[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return rows;
}

/** INSERT / UPDATE / DELETE : renvoie insertId et affectedRows. */
async function run(sql: string, params: unknown[] = [], db: Executor = pool): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params);
  return result;
}

/** Erreur HTTP lancee dans une transaction : provoque un ROLLBACK puis une reponse propre. */
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Transaction : COMMIT si la fonction reussit, ROLLBACK sinon. */
async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
 * Envoi d'e-mails au demandeur (bouton « Contacter par e-mail »). Le
 * transport n'est cree que si les variables SMTP sont renseignees : sans
 * elles, l'endpoint repond 503 et le client bascule sur un mailto:.
 * Fournisseur recommande : Brevo (300 envois/jour gratuits) - SMTP keys.
 */
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = smtpConfigured
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  : null;
const mailFrom = process.env.MAIL_FROM ?? process.env.SMTP_USER ?? 'no-reply@droit-accessible.fr';
/*
 * Envoi HTTP sans SMTP : une simple cle suffit.
 *   FORMSPREE_URL : https://formspree.io/f/VOTRE_ID
 *   WEB3FORMS_KEY : votre cle_access_key (https://web3forms.com)
 * Renseigne en priorite FORMSPREE_URL, sinon WEB3FORMS_KEY.
 */
const formspreeUrl = process.env.FORMSPREE_URL?.trim() || null;
const web3formsKey = process.env.WEB3FORMS_KEY?.trim() || null;
const httpProvider = formspreeUrl ? 'formspree' : web3formsKey ? 'web3forms' : null;

/** Envoie l'e-mail via le service HTTP configure. Renvoie false si rien n'est configure. */
async function sendByHttpApi(to: string, subject: string, text: string, fromName: string, fromEmail: string): Promise<boolean> {
  const payload = {
    name: fromName,
    email: fromEmail,
    replyto: fromEmail,
    _subject: subject,
    subject,
    message: text,
    body: text,
    to,
  };
  try {
    if (formspreeUrl) {
      const response = await fetch(formspreeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) { throw new Error('HTTP ' + response.status); }
      return true;
    }
    if (web3formsKey) {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: web3formsKey, from_name: fromName, replyto: fromEmail, subject, message: text, to }),
      });
      if (!response.ok) { throw new Error('HTTP ' + response.status); }
      return true;
    }
  } catch (error) {
    console.error('Echec de l envoi HTTP :', error instanceof Error ? error.message : error);
  }
  return false;
}
type AuthRequest = Request & { user?: { id: number; role: string; professionalId?: number | null } };

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' }));
app.use(express.json());

/*
 * Schema MySQL (InnoDB, utf8mb4). Une instruction par entree : mysql2 refuse
 * les requetes multiples par defaut. Les colonnes TEXT n'acceptent pas de
 * valeur par defaut en MySQL : les valeurs vides sont donc fournies a l'insertion.
 */
const schemaStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'professional',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS professionals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    user_id INT NULL,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(180) NOT NULL,
    role VARCHAR(160) NOT NULL DEFAULT 'Professionnel du droit',
    specialty VARCHAR(120) NOT NULL,
    city VARCHAR(120) NOT NULL,
    registration VARCHAR(120) NOT NULL,
    bio TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    rating DECIMAL(2,1) NOT NULL DEFAULT 5.0,
    availability VARCHAR(120) NOT NULL DEFAULT 'Disponible cette semaine',
    modes VARCHAR(40) NOT NULL DEFAULT 'visio,cabinet',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_professionals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    category VARCHAR(120) NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    read_time VARCHAR(30) NOT NULL,
    color VARCHAR(30) NOT NULL DEFAULT 'blue',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /*
   * access_token : code de suivi remis au citoyen lors de sa demande, il donne
   * acces au statut de sa demande (sans compte a creer).
   */
  `CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    professional_id INT NOT NULL,
    requester_name VARCHAR(160) NOT NULL,
    requester_email VARCHAR(180) NOT NULL DEFAULT '',
    requester_phone VARCHAR(40) NOT NULL DEFAULT '',
    requested_date DATE NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    access_token VARCHAR(64) NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointments_professional FOREIGN KEY (professional_id) REFERENCES professionals(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    professional_id INT NOT NULL,
    appointment_id INT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_professional FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  /* tags : tableau JSON (equivalent de TEXT[] sous PostgreSQL). */
  `CREATE TABLE IF NOT EXISTS articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    professional_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    excerpt TEXT NOT NULL,
    content LONGTEXT NOT NULL,
    category VARCHAR(80) NOT NULL DEFAULT 'droit_penal',
    tags JSON NULL,
    published TINYINT(1) NOT NULL DEFAULT 0,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_articles_professional FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/*
 * Migration : ajoute la colonne uuid (remplie pour les lignes existantes) aux
 * tables creees avant son introduction. Sans effet si la colonne existe deja.
 */
async function ensureUuidColumn(table: string): Promise<void> {
  const columns = await select("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'uuid'", [table]);
  if (columns.length) { return; }
  await run(`ALTER TABLE ${table} ADD COLUMN uuid CHAR(36) NULL AFTER id`);
  await run(`UPDATE ${table} SET uuid = UUID() WHERE uuid IS NULL`);
  await run(`ALTER TABLE ${table} MODIFY uuid CHAR(36) NOT NULL, ADD UNIQUE KEY uq_${table}_uuid (uuid)`);
}

async function initializeDatabase(): Promise<void> {
  for (const statement of schemaStatements) await run(statement);
  for (const table of ['users', 'professionals', 'resources', 'appointments', 'notifications', 'articles']) await ensureUuidColumn(table);
  /* Messagerie supprimee : la table des conversations n'est plus utilisee. */
  await run('DROP TABLE IF EXISTS chat_messages');

  const passwordHash = await bcrypt.hash('admin123', 10);
  await run("INSERT IGNORE INTO users (uuid, username, password_hash, role) VALUES (?, 'admin', ?, 'admin')", [randomUUID(), passwordHash]);

  const resourceCount = await select('SELECT COUNT(*) AS count FROM resources');
  if (Number(resourceCount[0].count) === 0) {
    const resources = [
      ['Droit du travail', 'Comprendre son contrat de travail', 'Les clauses essentielles à vérifier avant de signer et les réflexes à adopter.', '6 min', 'coral'],
      ['Logement', 'Locataire : vos droits essentiels', 'Dépôt de garantie, réparations et préavis : les réponses aux questions courantes.', '8 min', 'mint'],
      ['Famille', 'Les étapes d’une séparation', 'Une fiche pratique pour comprendre les démarches et protéger vos intérêts.', '10 min', 'yellow'],
      ['Consommation', 'Résoudre un litige avec un professionnel', 'De la réclamation amiable à la médiation, les étapes à suivre.', '5 min', 'blue'],
    ];
    for (const resource of resources) await run('INSERT INTO resources (uuid, category, title, description, read_time, color) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), ...resource]);
  }

  const professionalCount = await select('SELECT COUNT(*) AS count FROM professionals');
  if (Number(professionalCount[0].count) === 0) {
    /* Modes differencies pour que le filtre de l'annuaire produise un resultat visible. */
    const professionals = [
      ['Nadia Martin', 'nadia.martin@cabinet.fr', 'Avocate au barreau de Paris', 'Droit de la famille', 'Paris · À distance', 'BAR-75001', 'Accompagne les familles dans leurs démarches avec écoute et clarté.', 'visio,cabinet'],
      ['Karim Meziane', 'karim.meziane@conseil.fr', 'Juriste conseil', 'Droit du travail', 'Lyon · À distance', 'JUR-69001', 'Conseil et accompagnement pour les salariés et les employeurs.', 'visio'],
      ['Sophie Caron', 'sophie.caron@avocat.fr', 'Avocate au barreau de Lille', 'Droit immobilier', 'Lille · À distance', 'BAR-59001', 'Une expertise concrète pour vos projets et litiges immobiliers.', 'cabinet'],
    ];
    for (const professional of professionals) {
      await run("INSERT INTO professionals (uuid, name, email, role, specialty, city, registration, bio, modes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')", [randomUUID(), ...professional]);
    }
  }
}

function authenticate(request: AuthRequest, response: Response, next: NextFunction): void {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) { response.status(401).json({ message: 'Authentification requise.' }); return; }
  try { request.user = jwt.verify(token, jwtSecret) as { id: number; role: string; professionalId?: number | null }; next(); }
  catch { response.status(401).json({ message: 'Session invalide ou expirée.' }); }
}

app.get('/api/health', async (_request, response) => {
  try { await pool.query('SELECT 1'); response.json({ status: 'ok', database: 'connected' }); }
  catch { response.status(503).json({ status: 'error', database: 'unavailable' }); }
});

app.post('/api/auth/login', async (request, response) => {
  const { username, password } = request.body as { username?: string; password?: string };
  if (!username || !password) { response.status(400).json({ message: 'Identifiant et mot de passe requis.' }); return; }
  const users = await select('SELECT id, username, password_hash, role FROM users WHERE username = ?', [username]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) { response.status(401).json({ message: 'Identifiants incorrects.' }); return; }
  /*
   * Un professionnel est relié à son profil via professionals.user_id :
   * l'identifiant du profil est embarqué dans le jeton afin que l'API
   * puisse filtrer strictement ses données (rendez-vous, notifications).
   */
  let professionalId: number | null = null;
  if (user.role === 'professional') {
    const profile = await select('SELECT id FROM professionals WHERE user_id = ? LIMIT 1', [user.id]);
    professionalId = profile[0]?.id ?? null;
  }
  const token = jwt.sign({ id: user.id, role: user.role, professionalId }, jwtSecret, { expiresIn: '8h' });
  response.json({ token, user: { id: user.id, username: user.username, role: user.role, professionalId } });
});

app.get('/api/resources/:uuid', async (request, response) => {
  const rows = await select('SELECT uuid, category, title, description, read_time AS readTime, color FROM resources WHERE uuid = ?', [request.params.uuid]);
  if (!rows.length) { response.status(404).json({ message: 'Fiche introuvable.' }); return; }
  response.json(rows[0]);
});

/*
 * Statistiques publiques du tableau de bord : comptées directement dans la
 * base de données (COUNT) pour refléter l'état réel de la plateforme.
 */
app.get('/api/stats', async (_request, response) => {
  const [professionals, resources, appointments, cities] = await Promise.all([
    select("SELECT COUNT(*) AS count FROM professionals WHERE status = 'approved'"),
    select('SELECT COUNT(*) AS count FROM resources'),
    select('SELECT COUNT(*) AS count FROM appointments'),
    select("SELECT COUNT(DISTINCT city) AS count FROM professionals WHERE status = 'approved'"),
  ]);
  response.json({
    professionals: Number(professionals[0].count),
    resources: Number(resources[0].count),
    appointments: Number(appointments[0].count),
    cities: Number(cities[0].count),
  });
});

app.get('/api/resources', async (_request, response) => {
  const rows = await select('SELECT uuid, category, title, description, read_time AS readTime, color FROM resources ORDER BY id');
  response.json(rows);
});

/*
 * Palette normative du secteur juridique (robe d'avocat : bleu marine,
 * bordeaux, or, ardoise). La couleur est deduite de la specialite quand
 * elle est connue, sinon de facon stable a partir du nom, afin qu'un meme
 * professionnel garde la meme couleur sur toutes les pages.
 */
const legalPalette = ['navy', 'bordeaux', 'gold', 'slate'];
const legalColorsBySpecialty: Record<string, string> = {
  'Droit de la famille': 'bordeaux',
  'Droit du travail': 'navy',
  'Droit immobilier': 'gold'
};
function legalColor(name: string, specialty: string): string {
  const known = legalColorsBySpecialty[specialty];
  if (known) { return known; }
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return legalPalette[hash % legalPalette.length];
}

/*
 * Recherche : LIKE est insensible a la casse avec la collation utf8mb4_unicode_ci
 * (equivalent de ILIKE). Le parametre est repete car MySQL n'a pas de $1 reutilisable.
 */
app.get('/api/professionals', async (request, response) => {
  const search = String(request.query.search ?? '').trim();
  const like = `%${search}%`;
  const rows = await select(
    `SELECT uuid,
            CONCAT(LEFT(name, 1), SUBSTRING(name, POSITION(' ' IN name) + 1, 1)) AS initials,
            name, role, specialty, city,
            CAST(rating AS CHAR) AS rating,
            availability AS available, modes
     FROM professionals
     WHERE status = 'approved' AND (? = '' OR name LIKE ? OR specialty LIKE ? OR city LIKE ?)
     ORDER BY name`,
    [search, like, like, like]
  );
  response.json(rows.map((row) => ({ ...row, color: legalColor(row.name, row.specialty) })));
});

app.post('/api/professionals', async (request, response) => {
  const { name, email, specialty, city, registration, bio, username, password } = request.body;
  if (!name || !email || !specialty || !city || !registration || !username || !password) { response.status(400).json({ message: 'Les champs obligatoires sont incomplets.' }); return; }
  if (String(password).length < 6) { response.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' }); return; }
  const usernameTaken = await select('SELECT id FROM users WHERE username = ?', [username]);
  if (usernameTaken.length) { response.status(409).json({ message: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.' }); return; }
  /*
   * Chaque professionnel dispose de ses propres identifiants : un compte
   * utilisateur (rôle « professional ») est créé puis relié à son profil.
   * Il accède ainsi à un portail strictement personnel.
   */
  const passwordHash = await bcrypt.hash(String(password), 10);
  const professionalId = await withTransaction(async (connection) => {
    const user = await run("INSERT INTO users (uuid, username, password_hash, role) VALUES (?, ?, ?, 'professional')", [randomUUID(), username, passwordHash], connection);
    const created = await run('INSERT INTO professionals (uuid, name, email, specialty, city, registration, bio, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), name, email, specialty, city, registration, bio ?? '', user.insertId], connection);
    return created.insertId;
  });
  const rows = await select('SELECT uuid, name, status, created_at AS createdAt FROM professionals WHERE id = ?', [professionalId]);
  response.status(201).json({ ...rows[0], message: 'Compte créé. Connectez-vous avec vos identifiants pour accéder à votre portail.' });
});

/* Profil du professionnel connecté : strictement le sien. */
app.get('/api/professionals/me', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'professional') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const rows = await select('SELECT uuid, name, email, specialty, city, registration, bio, status, created_at AS createdAt FROM professionals WHERE user_id = ?', [request.user.id]);
  if (!rows.length) { response.status(404).json({ message: 'Aucun profil professionnel n\'est relié à ce compte.' }); return; }
  response.json(rows[0]);
});

/* Requete commune de la liste admin des professionnels. */
const ADMIN_PROFESSIONAL_SELECT = 'SELECT p.uuid, p.name, p.email, p.specialty, p.city, p.status, p.user_id AS userId, u.username AS portalUsername, p.created_at AS createdAt FROM professionals p LEFT JOIN users u ON u.id = p.user_id';

/*
 * Liste complète des professionnels : réservée à l'administrateur.
 * Les professionnels consultent leur portail (/portail), jamais cette liste.
 */
app.get('/api/admin/professionals', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès administrateur requis.' }); return; }
  const rows = await select(`${ADMIN_PROFESSIONAL_SELECT} ORDER BY p.created_at DESC`);
  response.json(rows);
});

/*
 * Modification d'un professionnel : réservée à l'administrateur.
 * Permet aussi de créer / mettre à jour les identifiants du portail
 * du professionnel (credentials.username / credentials.password).
 */
app.put('/api/admin/professionals/:uuid', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès administrateur requis.' }); return; }
  const { name, email, specialty, city, registration, bio, status, credentials } = request.body as {
    name?: string; email?: string; specialty?: string; city?: string; registration?: string; bio?: string; status?: string;
    credentials?: { username?: string; password?: string };
  };
  const username = credentials?.username?.trim() ?? '';
  const password = credentials?.password ?? '';
  const professionalUuid = request.params.uuid;
  try {
    const credentialsMessage = await withTransaction(async (connection) => {
      const existing = await select('SELECT id, user_id FROM professionals WHERE uuid = ?', [professionalUuid], connection);
      if (!existing.length) { throw new HttpError(404, 'Professionnel introuvable.'); }
      await run('UPDATE professionals SET name = ?, email = ?, specialty = ?, city = ?, registration = ?, bio = ?, status = ? WHERE id = ?', [name ?? '', email ?? '', specialty ?? '', city ?? '', registration ?? '', bio ?? '', status ?? 'pending', existing[0].id], connection);

      if (!username && !password) { return ''; }
      if (password && password.length < 6) { throw new HttpError(400, 'Le mot de passe doit contenir au moins 6 caractères.'); }
      const userId: number | null = existing[0].user_id ?? null;
      if (userId) {
        if (username) {
          const clash = await select('SELECT id FROM users WHERE username = ? AND id <> ?', [username, userId], connection);
          if (clash.length) { throw new HttpError(409, 'Cet identifiant est déjà utilisé par un autre compte.'); }
          await run('UPDATE users SET username = ? WHERE id = ?', [username, userId], connection);
        }
        if (password) await run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), userId], connection);
        return 'Identifiants du portail mis à jour.';
      }
      if (!username || !password) { throw new HttpError(400, 'Identifiant et mot de passe sont requis pour créer le compte du portail.'); }
      const clash = await select('SELECT id FROM users WHERE username = ?', [username], connection);
      if (clash.length) { throw new HttpError(409, 'Cet identifiant est déjà utilisé par un autre compte.'); }
      const created = await run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'professional')", [username, await bcrypt.hash(password, 10)], connection);
      await run('UPDATE professionals SET user_id = ? WHERE id = ?', [created.insertId, existing[0].id], connection);
      return 'Compte du portail créé pour ce professionnel.';
    });
    const rows = await select(`${ADMIN_PROFESSIONAL_SELECT} WHERE p.uuid = ?`, [professionalUuid]);
    response.json({ ...rows[0], message: credentialsMessage || 'Le profil a été mis à jour avec succès.' });
  } catch (error) {
    if (error instanceof HttpError) { response.status(error.status).json({ message: error.message }); return; }
    throw error;
  }
});

app.patch('/api/admin/professionals/:id/status', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès administrateur requis.' }); return; }
  const { status } = request.body as { status?: string };
  if (!['approved', 'pending', 'rejected'].includes(status ?? '')) { response.status(400).json({ message: 'Statut invalide.' }); return; }
  const result = await run('UPDATE professionals SET status = ? WHERE id = ?', [status, request.params.id]);
  if (!result.affectedRows) { response.status(404).json({ message: 'Professionnel introuvable.' }); return; }
  const rows = await select('SELECT id, status FROM professionals WHERE id = ?', [request.params.id]);
  response.json(rows[0]);
});

/*
 * Demandes de rendez-vous : un professionnel ne voit QUE les demandes
 * adressées à son propre profil (conflit marketing évité) ; l'administrateur
 * voit l'ensemble pour piloter l'annuaire.
 */
const APPOINTMENT_SELECT = `SELECT a.id, a.professional_id AS professionalId, a.requester_name AS requesterName, a.requester_email AS requesterEmail, a.requester_phone AS requesterPhone, a.requested_date AS requestedDate, a.message, a.status, a.access_token AS accessToken, a.created_at AS createdAt, p.name AS professionalName, p.specialty, p.email AS professionalEmail FROM appointments a JOIN professionals p ON p.id = a.professional_id`;

app.post('/api/appointments', async (request, response) => {
  const { professionalId, requesterName, requesterEmail, requesterPhone, requestedDate, message } = request.body;
  if (!professionalId || !requesterName || !requesterEmail || !requesterPhone || !requestedDate) { response.status(400).json({ message: 'Nom, email, téléphone et date sont obligatoires.' }); return; }
  const professional = await select("SELECT id, name FROM professionals WHERE id = ? AND status = 'approved'", [professionalId]);
  if (!professional.length) { response.status(404).json({ message: 'Professionnel indisponible.' }); return; }
  const appointmentId = await withTransaction(async (connection) => {
    const appointment = await run('INSERT INTO appointments (professional_id, requester_name, requester_email, requester_phone, requested_date, message, access_token) VALUES (?, ?, ?, ?, ?, ?, ?)', [professionalId, requesterName, requesterEmail, requesterPhone, requestedDate, message ?? '', randomBytes(16).toString('hex')], connection);
    await run('INSERT INTO notifications (professional_id, appointment_id, title, message) VALUES (?, ?, ?, ?)', [professionalId, appointment.insertId, 'Nouvelle demande de rendez-vous', `${requesterName} souhaite vous contacter pour le ${requestedDate}.`], connection);
    return appointment.insertId;
  });
  const rows = await select('SELECT id, status, access_token AS accessToken, requested_date AS requestedDate FROM appointments WHERE id = ?', [appointmentId]);
  response.status(201).json({ ...rows[0], message: 'Demande envoyée. Le professionnel vous contactera.' });
});

/*
 * Espace de suivi du citoyen : AUCUN compte requis. Le code remis lors de la
 * demande donne accès au statut de SA demande uniquement.
 */
app.get('/api/suivi/:token', async (request, response) => {
  const appointment = await select(`${APPOINTMENT_SELECT} WHERE a.access_token = ?`, [request.params.token]);
  if (!appointment.length) { response.status(404).json({ message: 'Code de suivi inconnu.' }); return; }
  const row = appointment[0];
  response.json({
    appointment: {
      id: row.id,
      status: row.status,
      requesterName: row.requesterName,
      requestedDate: row.requestedDate,
      professionalName: row.professionalName,
      specialty: row.specialty
    }
  });
});

app.get('/api/appointments', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role === 'professional') {
    const scoped = await select(`${APPOINTMENT_SELECT} WHERE a.professional_id = ? ORDER BY a.created_at DESC`, [request.user.professionalId ?? -1]);
    response.json(scoped);
    return;
  }
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const rows = await select(`${APPOINTMENT_SELECT} ORDER BY a.created_at DESC`);
  response.json(rows);
});

app.get('/api/appointments/:id', authenticate, async (request: AuthRequest, response: Response) => {
  if (request.user?.role === 'professional') {
    const scoped = await select(`${APPOINTMENT_SELECT} WHERE a.id = ? AND a.professional_id = ?`, [request.params.id, request.user.professionalId ?? -1]);
    if (!scoped.length) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
    response.json(scoped[0]);
    return;
  }
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const rows = await select(`${APPOINTMENT_SELECT} WHERE a.id = ?`, [request.params.id]);
  if (!rows.length) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
  response.json(rows[0]);
});

/*
 * Notifications : un professionnel ne reçoit que celles de son profil ;
 * l'administrateur reçoit l'ensemble.
 */
app.get('/api/notifications', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role === 'professional') {
    const scoped = await select('SELECT id, title, message, read_at AS readAt, created_at AS createdAt FROM notifications WHERE professional_id = ? AND read_at IS NULL ORDER BY created_at DESC', [request.user.professionalId ?? -1]);
    response.json(scoped);
    return;
  }
  const rows = await select('SELECT id, title, message, read_at AS readAt, created_at AS createdAt FROM notifications WHERE read_at IS NULL ORDER BY created_at DESC');
  response.json(rows);
});

/* --- ARTICLES --- */

/* Liste des articles publiés (public) */
app.get('/api/articles', async (request, response) => {
  const { published = 'true', category, search = '' } = request.query as {
    published?: string;
    category?: string;
    search?: string;
  };

  let query = `
    SELECT a.id, a.title, a.slug, a.excerpt, a.category, a.tags,
           a.published, a.published_at AS publishedAt, a.created_at AS createdAt, a.updated_at AS updatedAt,
           p.name AS professionalName, p.specialty
    FROM articles a
    JOIN professionals p ON p.id = a.professional_id
    WHERE 1 = 1
  `;
  const params: unknown[] = [];

  if (published === 'true') {
    query += ' AND a.published = 1';
  }

  if (category) {
    query += ' AND a.category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (a.title LIKE ? OR a.excerpt LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  /* MySQL n'a pas NULLS LAST : on trie d'abord sur « published_at IS NULL ». */
  query += ' ORDER BY a.published_at IS NULL, a.published_at DESC, a.created_at DESC';

  const rows = await select(query, params);
  response.json(rows);
});

/*
 * Marquer une demande comme traitée (ou la rouvrir) : le professionnel
 * propriétaire coche / décoche ; l'administrateur peut le faire sur tout.
 */
app.patch('/api/appointments/:id/status', authenticate, async (request: AuthRequest, response) => {
  const { status } = request.body as { status?: string };
  if (!['pending', 'processed'].includes(status ?? '')) { response.status(400).json({ message: 'Statut invalide.' }); return; }
  if (request.user?.role === 'professional') {
    const scoped = await run('UPDATE appointments SET status = ? WHERE id = ? AND professional_id = ?', [status, request.params.id, request.user.professionalId ?? -1]);
    if (!scoped.affectedRows) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
    response.json({ id: Number(request.params.id), status });
    return;
  }
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const result = await run('UPDATE appointments SET status = ? WHERE id = ?', [status, request.params.id]);
  if (!result.affectedRows) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
  response.json({ id: Number(request.params.id), status });
});

/*
 * Envoi d'un e-mail du professionnel / administrateur au demandeur d'une
 * demande. Meme regle d'acces que PATCH /api/appointments/:id/status : le
 * professionnel n'ecrit qu'a SES demandes, l'admin a toutes.
 */
app.post('/api/appointments/:id/email', authenticate, async (request: AuthRequest, response) => {
  const { subject, body } = request.body as { subject?: string; body?: string };
  const mailSubject = (subject ?? '').trim();
  const mailBody = (body ?? '').trim();
  if (!mailSubject || !mailBody) { response.status(400).json({ message: 'Objet et message sont requis.' }); return; }

  /* Recuperation scopee de la demande (et de l'email du professionnel). */
  const target = await select(
    'SELECT a.id, a.requester_name, a.requester_email, a.professional_id, p.name AS professionalName, p.email AS professionalEmail FROM appointments a JOIN professionals p ON p.id = a.professional_id WHERE a.id = ?',
    [request.params.id]
  );
  if (!target.length) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
  const row = target[0];
  const isOwner = row.professional_id === (request.user?.professionalId ?? -1);
  if (request.user?.role !== 'admin' && !isOwner) {
    response.status(403).json({ message: 'Acces professionnel requis.' });
    return;
  }
  const to = (row.requester_email ?? '').trim();
  if (!to) { response.status(400).json({ message: 'Cette demande ne comporte pas d adresse e-mail.' }); return; }

  /* 1) Service HTTP (Formspree / Web3Forms) : prioritaire, une seule cle suffit. */
  if (httpProvider) {
    const sent = await sendByHttpApi(to, mailSubject, mailBody, row.professionalName, row.professionalEmail ?? mailFrom);
    if (sent) {
      console.log('E-mail envoye via le service HTTP a la demande #' + row.id);
      response.json({ sent: true, to, provider: httpProvider });
      return;
    }
    response.status(502).json({ message: 'Le service d envoi a refuse la demande. Reessayez plus tard.' });
    return;
  }

  /* 2) Repli SMTP si un serveur a ete configure. */
  if (!mailer) {
    /* Le client bascule alors sur un mailto:. */
    response.status(503).json({ smtp: false, message: 'Aucun service d envoi configure sur le serveur.' });
    return;
  }

  try {
    await mailer.sendMail({
      from: mailFrom,
      to,
      replyTo: row.professionalEmail ?? undefined,
      subject: mailSubject,
      text: mailBody,
    });
    console.log('E-mail envoye par SMTP a la demande #' + row.id);
  } catch (error) {
    console.error('Echec de l envoi SMTP :', error instanceof Error ? error.message : error);
    response.status(502).json({ message: 'L envoi SMTP a echoue.' });
    return;
  }
  response.json({ sent: true, to, provider: 'smtp' });
});

/*
 * Servir le frontend Angular en production : en hébergement gratuit tout-en-un
 * (Render), le même serveur Express expose l'application compilée
 * (dist/calvin-ui/browser) puis l'API sous /api. Le fallback renvoie index.html
 * pour les routes Angular (ex. /resources/3) tout en laissant passer /api.
 */
const frontendRoot = path.join(process.cwd(), 'dist', 'calvin-ui', 'browser');
if (fs.existsSync(frontendRoot)) {
  app.use(express.static(frontendRoot));
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) {
      response.sendFile(path.join(frontendRoot, 'index.html'));
      return;
    }
    next();
  });
}

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => { console.error(error); response.status(500).json({ message: 'Erreur interne du serveur.' }); });

initializeDatabase().then(() => app.listen(port, () => console.log(`API Droit Accessible: http://localhost:${port}`))).catch((error) => {
  console.error('Impossible de démarrer MySQL. Vérifiez DATABASE_URL (ou DB_*) dans server/.env.');
  console.error(`Détail MySQL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
