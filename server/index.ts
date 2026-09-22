import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET ?? 'droit-accessible-development-secret';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL est manquante. Copiez server/.env.example vers server/.env et renseignez le mot de passe PostgreSQL.');
}
/*
 * Hébergement managé (Neon, Supabase, Render Postgres...) : l'URL contient
 * « sslmode=require ». On active alors TLS automatiquement ; en local
 * (Docker, sans sslmode) la connexion reste en clair.
 */
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('sslmode=') ? { rejectUnauthorized: false } : undefined,
});

type AuthRequest = Request & { user?: { id: number; role: string; professionalId?: number | null } };

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' }));
app.use(express.json());

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'professional',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS professionals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL,
  role VARCHAR(160) NOT NULL DEFAULT 'Professionnel du droit',
  specialty VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  registration VARCHAR(120) NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  rating NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  availability VARCHAR(120) NOT NULL DEFAULT 'Disponible cette semaine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  category VARCHAR(120) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  read_time VARCHAR(30) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  requester_name VARCHAR(160) NOT NULL,
  requested_date DATE NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  sender_role VARCHAR(20) NOT NULL,
  sender_name VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function initializeDatabase(): Promise<void> {
  await pool.query(schema);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS requester_email VARCHAR(180) NOT NULL DEFAULT ''; ALTER TABLE appointments ADD COLUMN IF NOT EXISTS requester_phone VARCHAR(40) NOT NULL DEFAULT '';`);
  /*
   * Code de suivi : remis au citoyen lors de sa demande, il donne accès à la
   * conversation liée (sans compte à créer). Les demandes existantes en
   * reçoivent un automatiquement.
   */
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS access_token VARCHAR(64) UNIQUE;`);
  await pool.query(`UPDATE appointments SET access_token = md5(random()::text || clock_timestamp()::text) WHERE access_token IS NULL;`);
  const passwordHash = await bcrypt.hash('admin123', 10);
  await pool.query(`INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin') ON CONFLICT (username) DO NOTHING`, [passwordHash]);
  const resourceCount = await pool.query<{ count: string }>('SELECT COUNT(*) FROM resources');
  if (Number(resourceCount.rows[0].count) === 0) {
    const resources = [
      ['Droit du travail', 'Comprendre son contrat de travail', 'Les clauses essentielles à vérifier avant de signer et les réflexes à adopter.', '6 min', 'coral'],
      ['Logement', 'Locataire : vos droits essentiels', 'Dépôt de garantie, réparations et préavis : les réponses aux questions courantes.', '8 min', 'mint'],
      ['Famille', 'Les étapes d’une séparation', 'Une fiche pratique pour comprendre les démarches et protéger vos intérêts.', '10 min', 'yellow'],
      ['Consommation', 'Résoudre un litige avec un professionnel', 'De la réclamation amiable à la médiation, les étapes à suivre.', '5 min', 'blue'],
    ];
    for (const resource of resources) await pool.query('INSERT INTO resources (category, title, description, read_time, color) VALUES ($1, $2, $3, $4, $5)', resource);
  }
  const professionalCount = await pool.query<{ count: string }>('SELECT COUNT(*) FROM professionals');
  if (Number(professionalCount.rows[0].count) === 0) {
    const professionals = [
      ['Nadia Martin', 'nadia.martin@cabinet.fr', 'Avocate au barreau de Paris', 'Droit de la famille', 'Paris · À distance', 'BAR-75001', 'Accompagne les familles dans leurs démarches avec écoute et clarté.', 'coral'],
      ['Karim Meziane', 'karim.meziane@conseil.fr', 'Juriste conseil', 'Droit du travail', 'Lyon · À distance', 'JUR-69001', 'Conseil et accompagnement pour les salariés et les employeurs.', 'blue'],
      ['Sophie Caron', 'sophie.caron@avocat.fr', 'Avocate au barreau de Lille', 'Droit immobilier', 'Lille · À distance', 'BAR-59001', 'Une expertise concrète pour vos projets et litiges immobiliers.', 'mint'],
    ];
    for (const professional of professionals) await pool.query('INSERT INTO professionals (name, email, role, specialty, city, registration, bio, status) VALUES ($1, $2, $3, $4, $5, $6, $7, \'approved\')', professional.slice(0, 7));
  }
}

function authenticate(request: AuthRequest, response: Response, next: NextFunction): void {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) { response.status(401).json({ message: 'Authentification requise.' }); return; }
  try { request.user = jwt.verify(token, jwtSecret) as { id: number; role: string }; next(); }
  catch { response.status(401).json({ message: 'Session invalide ou expirée.' }); }
}

app.get('/api/health', async (_request, response) => {
  try { await pool.query('SELECT 1'); response.json({ status: 'ok', database: 'connected' }); }
  catch { response.status(503).json({ status: 'error', database: 'unavailable' }); }
});

app.post('/api/auth/login', async (request, response) => {
  const { username, password } = request.body as { username?: string; password?: string };
  if (!username || !password) { response.status(400).json({ message: 'Identifiant et mot de passe requis.' }); return; }
  const result = await pool.query('SELECT id, username, password_hash, role FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) { response.status(401).json({ message: 'Identifiants incorrects.' }); return; }
  /*
   * Un professionnel est relié à son profil via professionals.user_id :
   * l'identifiant du profil est embarqué dans le jeton afin que l'API
   * puisse filtrer strictement ses données (rendez-vous, notifications).
   */
  let professionalId: number | null = null;
  if (user.role === 'professional') {
    const profile = await pool.query('SELECT id FROM professionals WHERE user_id = $1 LIMIT 1', [user.id]);
    professionalId = profile.rows[0]?.id ?? null;
  }
  const token = jwt.sign({ id: user.id, role: user.role, professionalId }, jwtSecret, { expiresIn: '8h' });
  response.json({ token, user: { id: user.id, username: user.username, role: user.role, professionalId } });
});

app.get('/api/resources/:id', async (request, response) => {
  const result = await pool.query('SELECT id, category, title, description, read_time AS "readTime", color FROM resources WHERE id = $1', [request.params.id]);
  if (!result.rowCount) { response.status(404).json({ message: 'Fiche introuvable.' }); return; }
  response.json(result.rows[0]);
});

/*
 * Statistiques publiques du tableau de bord : comptées directement dans la
 * base de données (COUNT) pour refléter l'état réel de la plateforme.
 */
app.get('/api/stats', async (_request, response) => {
  const [professionals, resources, appointments, cities] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*) FROM professionals WHERE status = 'approved'"),
    pool.query<{ count: string }>('SELECT COUNT(*) FROM resources'),
    pool.query<{ count: string }>('SELECT COUNT(*) FROM appointments'),
    pool.query<{ count: string }>("SELECT COUNT(DISTINCT city) FROM professionals WHERE status = 'approved'"),
  ]);
  response.json({
    professionals: Number(professionals.rows[0].count),
    resources: Number(resources.rows[0].count),
    appointments: Number(appointments.rows[0].count),
    cities: Number(cities.rows[0].count),
  });
});

app.get('/api/resources', async (_request, response) => {
  const result = await pool.query('SELECT id, category, title, description, read_time AS "readTime", color FROM resources ORDER BY id');
  response.json(result.rows);
});

app.get('/api/professionals', async (request, response) => {
  const search = String(request.query.search ?? '').trim();
  const result = await pool.query(`SELECT id, LEFT(name, 1) || SUBSTRING(name FROM POSITION(' ' IN name) + 1 FOR 1) AS initials, name, role, specialty, city, rating::text, availability FROM professionals WHERE status = 'approved' AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR specialty ILIKE '%' || $1 || '%' OR city ILIKE '%' || $1 || '%') ORDER BY name`, [search]);
  response.json(result.rows);
});

app.post('/api/professionals', async (request, response) => {
  const { name, email, specialty, city, registration, bio, username, password } = request.body;
  if (!name || !email || !specialty || !city || !registration || !username || !password) { response.status(400).json({ message: 'Les champs obligatoires sont incomplets.' }); return; }
  if (String(password).length < 6) { response.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' }); return; }
  const usernameTaken = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (usernameTaken.rowCount) { response.status(409).json({ message: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.' }); return; }
  /*
   * Chaque professionnel dispose de ses propres identifiants : un compte
   * utilisateur (rôle « professional ») est créé puis relié à son profil.
   * Il accède ainsi à un portail strictement personnel.
   */
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await client.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, \'professional\') RETURNING id', [username, passwordHash]);
    const result = await client.query('INSERT INTO professionals (name, email, specialty, city, registration, bio, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, status, created_at', [name, email, specialty, city, registration, bio ?? '', user.rows[0].id]);
    await client.query('COMMIT');
    response.status(201).json({ ...result.rows[0], message: 'Compte créé. Connectez-vous avec vos identifiants pour accéder à votre portail.' });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

/* Profil du professionnel connecté : strictement le sien. */
app.get('/api/professionals/me', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'professional') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const result = await pool.query('SELECT id, name, email, specialty, city, registration, bio, status, created_at AS "createdAt" FROM professionals WHERE user_id = $1', [request.user.id]);
  if (!result.rowCount) { response.status(404).json({ message: 'Aucun profil professionnel n\'est relié à ce compte.' }); return; }
  response.json(result.rows[0]);
});

/*
 * Liste complète des professionnels : réservée à l'administrateur.
 * Les professionnels consultent leur portail (/portail), jamais cette liste.
 */
app.get('/api/admin/professionals', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès administrateur requis.' }); return; }
  const result = await pool.query('SELECT p.id, p.name, p.email, p.specialty, p.city, p.status, p.user_id AS "userId", u.username AS "portalUsername", p.created_at AS "createdAt" FROM professionals p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC');
  response.json(result.rows);
});

/*
 * Modification d'un professionnel : réservée à l'administrateur.
 * Permet aussi de créer / mettre à jour les identifiants du portail
 * du professionnel (credentials.username / credentials.password).
 */
app.put('/api/admin/professionals/:id', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès administrateur requis.' }); return; }
  const { name, email, specialty, city, registration, bio, status, credentials } = request.body as {
    name?: string; email?: string; specialty?: string; city?: string; registration?: string; bio?: string; status?: string;
    credentials?: { username?: string; password?: string };
  };
  const username = credentials?.username?.trim() ?? '';
  const password = credentials?.password ?? '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query('UPDATE professionals SET name = $1, email = $2, specialty = $3, city = $4, registration = $5, bio = $6, status = $7 WHERE id = $8 RETURNING id, user_id AS "userId"', [name ?? '', email ?? '', specialty ?? '', city ?? '', registration ?? '', bio ?? '', status ?? 'pending', request.params.id]);
    if (!updated.rowCount) { await client.query('ROLLBACK'); response.status(404).json({ message: 'Professionnel introuvable.' }); return; }
    let credentialsMessage = '';
    if (username || password) {
      if (password && password.length < 6) { await client.query('ROLLBACK'); response.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' }); return; }
      const userId: number | null = updated.rows[0].userId ?? null;
      if (userId) {
        if (username) {
          const clash = await client.query('SELECT id FROM users WHERE username = $1 AND id <> $2', [username, userId]);
          if (clash.rowCount) { await client.query('ROLLBACK'); response.status(409).json({ message: 'Cet identifiant est déjà utilisé par un autre compte.' }); return; }
          await client.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
        }
        if (password) await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 10), userId]);
        credentialsMessage = 'Identifiants du portail mis à jour.';
      } else {
        if (!username || !password) { await client.query('ROLLBACK'); response.status(400).json({ message: 'Identifiant et mot de passe sont requis pour créer le compte du portail.' }); return; }
        const clash = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (clash.rowCount) { await client.query('ROLLBACK'); response.status(409).json({ message: 'Cet identifiant est déjà utilisé par un autre compte.' }); return; }
        const created = await client.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, \'professional\') RETURNING id', [username, await bcrypt.hash(password, 10)]);
        await client.query('UPDATE professionals SET user_id = $1 WHERE id = $2', [created.rows[0].id, request.params.id]);
        credentialsMessage = 'Compte du portail créé pour ce professionnel.';
      }
    }
    await client.query('COMMIT');
    const result = await pool.query('SELECT p.id, p.name, p.email, p.specialty, p.city, p.status, p.user_id AS "userId", u.username AS "portalUsername", p.created_at AS "createdAt" FROM professionals p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = $1', [request.params.id]);
    response.json({ ...result.rows[0], message: credentialsMessage || 'Le profil a été mis à jour avec succès.' });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

app.patch('/api/admin/professionals/:id/status', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès administrateur requis.' }); return; }
  const { status } = request.body as { status?: string };
  if (!['approved', 'pending', 'rejected'].includes(status ?? '')) { response.status(400).json({ message: 'Statut invalide.' }); return; }
  const result = await pool.query('UPDATE professionals SET status = $1 WHERE id = $2 RETURNING id, status', [status, request.params.id]);
  if (!result.rowCount) { response.status(404).json({ message: 'Professionnel introuvable.' }); return; }
  response.json(result.rows[0]);
});

app.post('/api/appointments', async (request, response) => {
  const { professionalId, requesterName, requesterEmail, requesterPhone, requestedDate, message } = request.body;
  if (!professionalId || !requesterName || !requesterEmail || !requesterPhone || !requestedDate) { response.status(400).json({ message: 'Nom, email, téléphone et date sont obligatoires.' }); return; }
  const professional = await pool.query('SELECT id, name FROM professionals WHERE id = $1 AND status = \'approved\'', [professionalId]);
  if (!professional.rowCount) { response.status(404).json({ message: 'Professionnel indisponible.' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appointment = await client.query('INSERT INTO appointments (professional_id, requester_name, requester_email, requester_phone, requested_date, message, access_token) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, status, access_token AS "accessToken", requested_date AS "requestedDate"', [professionalId, requesterName, requesterEmail, requesterPhone, requestedDate, message ?? '', randomBytes(16).toString('hex')]);
    await client.query('INSERT INTO notifications (professional_id, appointment_id, title, message) VALUES ($1, $2, $3, $4)', [professionalId, appointment.rows[0].id, 'Nouvelle demande de rendez-vous', `${requesterName} souhaite vous contacter pour le ${requestedDate}.`]);
    await client.query('COMMIT');
    response.status(201).json({ ...appointment.rows[0], message: 'Demande envoyée. Le professionnel vous contactera.' });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

/*
 * Conversation d'une demande de rendez-vous (professionnel / administrateur).
 */
app.get('/api/appointments/:id/messages', authenticate, async (request: AuthRequest, response) => {
  const appointment = await findAccessibleAppointment(request, String(request.params.id));
  if (!appointment) { response.status(404).json({ message: 'Demande introuvable ou accès refusé.' }); return; }
  const result = await pool.query('SELECT id, sender_role AS "senderRole", sender_name AS "senderName", content, created_at AS "createdAt" FROM chat_messages WHERE appointment_id = $1 ORDER BY created_at, id', [request.params.id]);
  response.json(result.rows);
});

app.post('/api/appointments/:id/messages', authenticate, async (request: AuthRequest, response) => {
  const appointment = await findAccessibleAppointment(request, String(request.params.id));
  if (!appointment) { response.status(404).json({ message: 'Demande introuvable ou accès refusé.' }); return; }
  const { content } = request.body as { content?: string };
  const trimmed = (content ?? '').trim();
  if (!trimmed) { response.status(400).json({ message: 'Le message est vide.' }); return; }
  const senderName = request.user?.role === 'admin' ? 'Administration' : appointment.professionalName;
  const inserted = await pool.query('INSERT INTO chat_messages (appointment_id, sender_role, sender_name, content) VALUES ($1, $2, $3, $4) RETURNING id, sender_role AS "senderRole", sender_name AS "senderName", content, created_at AS "createdAt"', [request.params.id, request.user?.role, senderName, trimmed]);
  response.status(201).json(inserted.rows[0]);
});

/*
 * Espace de suivi du citoyen : AUCUN compte requis. Le code remis lors de la
 * demande donne accès à la conversation liée à SA demande uniquement.
 */
app.get('/api/suivi/:token', async (request, response) => {
  const appointment = await pool.query(`${APPOINTMENT_SELECT} WHERE a.access_token = $1`, [request.params.token]);
  if (!appointment.rowCount) { response.status(404).json({ message: 'Code de suivi inconnu.' }); return; }
  const row = appointment.rows[0];
  const messages = await pool.query('SELECT id, sender_role AS "senderRole", sender_name AS "senderName", content, created_at AS "createdAt" FROM chat_messages WHERE appointment_id = $1 ORDER BY created_at, id', [row.id]);
  response.json({
    appointment: {
      id: row.id,
      status: row.status,
      requesterName: row.requesterName,
      requestedDate: row.requestedDate,
      professionalName: row.professionalName,
      specialty: row.specialty
    },
    messages: messages.rows
  });
});

app.post('/api/suivi/:token', async (request, response) => {
  const { content } = request.body as { content?: string };
  const trimmed = (content ?? '').trim();
  if (!trimmed) { response.status(400).json({ message: 'Le message est vide.' }); return; }
  const appointment = await pool.query('SELECT id, professional_id, requester_name FROM appointments WHERE access_token = $1', [request.params.token]);
  if (!appointment.rowCount) { response.status(404).json({ message: 'Code de suivi inconnu.' }); return; }
  const row = appointment.rows[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query('INSERT INTO chat_messages (appointment_id, sender_role, sender_name, content) VALUES ($1, \'citizen\', $2, $3) RETURNING id, sender_role AS "senderRole", sender_name AS "senderName", content, created_at AS "createdAt"', [row.id, row.requester_name, trimmed]);
    await client.query('INSERT INTO notifications (professional_id, appointment_id, title, message) VALUES ($1, $2, $3, $4)', [row.professional_id, row.id, 'Nouveau message du citoyen', `${row.requester_name} : ${trimmed.slice(0, 120)}`]);
    await client.query('COMMIT');
    response.status(201).json(inserted.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

/*
 * Demandes de rendez-vous : un professionnel ne voit QUE les demandes
 * adressées à son propre profil (conflit marketing évité) ; l'administrateur
 * voit l'ensemble pour piloter l'annuaire.
 */
const APPOINTMENT_SELECT = `SELECT a.id, a.professional_id AS "professionalId", a.requester_name AS "requesterName", a.requester_email AS "requesterEmail", a.requester_phone AS "requesterPhone", a.requested_date AS "requestedDate", a.message, a.status, a.access_token AS "accessToken", a.created_at AS "createdAt", p.name AS "professionalName", p.specialty FROM appointments a JOIN professionals p ON p.id = a.professional_id`;

app.get('/api/appointments', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role === 'professional') {
    const scoped = await pool.query(`${APPOINTMENT_SELECT} WHERE a.professional_id = $1 ORDER BY a.created_at DESC`, [request.user.professionalId ?? -1]);
    response.json(scoped.rows);
    return;
  }
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const result = await pool.query(`${APPOINTMENT_SELECT} ORDER BY a.created_at DESC`);
  response.json(result.rows);
});

app.get('/api/appointments/:id', authenticate, async (request: AuthRequest, response: Response) => {
  if (request.user?.role === 'professional') {
    const scoped = await pool.query(`${APPOINTMENT_SELECT} WHERE a.id = $1 AND a.professional_id = $2`, [request.params.id, request.user.professionalId ?? -1]);
    if (!scoped.rowCount) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
    response.json(scoped.rows[0]);
    return;
  }
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const result = await pool.query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [request.params.id]);
  if (!result.rowCount) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
  response.json(result.rows[0]);
});

/*
 * Notifications : un professionnel ne reçoit que celles de son profil ;
 * l'administrateur reçoit l'ensemble.
 */
app.get('/api/notifications', authenticate, async (request: AuthRequest, response) => {
  if (request.user?.role === 'professional') {
    const scoped = await pool.query('SELECT id, title, message, read_at AS "readAt", created_at AS "createdAt" FROM notifications WHERE professional_id = $1 AND read_at IS NULL ORDER BY created_at DESC', [request.user.professionalId ?? -1]);
    response.json(scoped.rows);
    return;
  }
  const result = await pool.query('SELECT id, title, message, read_at AS "readAt", created_at AS "createdAt" FROM notifications WHERE read_at IS NULL ORDER BY created_at DESC');
  response.json(result.rows);
});

/*
 * Marquer une demande comme traitée (ou la rouvrir) : le professionnel
 * propriétaire coche / décoche ; l'administrateur peut le faire sur tout.
 */
app.patch('/api/appointments/:id/status', authenticate, async (request: AuthRequest, response) => {
  const { status } = request.body as { status?: string };
  if (!['pending', 'processed'].includes(status ?? '')) { response.status(400).json({ message: 'Statut invalide.' }); return; }
  if (request.user?.role === 'professional') {
    const scoped = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 AND professional_id = $3 RETURNING id, status', [status, request.params.id, request.user.professionalId ?? -1]);
    if (!scoped.rowCount) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
    response.json(scoped.rows[0]);
    return;
  }
  if (request.user?.role !== 'admin') { response.status(403).json({ message: 'Accès professionnel requis.' }); return; }
  const result = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING id, status', [status, request.params.id]);
  if (!result.rowCount) { response.status(404).json({ message: 'Demande introuvable.' }); return; }
  response.json(result.rows[0]);
});

/*
 * Accès d'un utilisateur authentifié à UNE demande : l'administrateur accède
 * à tout, un professionnel uniquement aux demandes adressées à son profil.
 */
interface AppointmentRow {
  id: number;
  status: string;
  requesterName: string;
  accessToken: string | null;
  professionalName: string;
}

async function findAccessibleAppointment(request: AuthRequest, id: string): Promise<AppointmentRow | null> {
  if (request.user?.role === 'professional') {
    const scoped = await pool.query(`${APPOINTMENT_SELECT} WHERE a.id = $1 AND a.professional_id = $2`, [id, request.user.professionalId ?? -1]);
    return (scoped.rows[0] as AppointmentRow) ?? null;
  }
  if (request.user?.role !== 'admin') { return null; }
  const result = await pool.query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [id]);
  return (result.rows[0] as AppointmentRow) ?? null;
}

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
  console.error('Impossible de démarrer PostgreSQL. Vérifiez DATABASE_URL dans server/.env.');
  console.error(`Détail PostgreSQL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
