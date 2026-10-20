-- =====================================================================
-- ChantierPilot — Schéma PostgreSQL (Neon)
-- Devise : FCFA (XOF) — montants en entiers (0 décimale), unités = FCFA.
-- Langue applicative : français.
--
-- Principes :
--   * Chaque table métier porte company_id (cloisonnement multi-entreprise).
--   * Contraintes CHECK applicatives doublées côté serveur (zod) et base.
--   * Aucun montant négatif ; bornes réalistes pour des montants en FCFA.
--   * RLS activé + FORCÉ (voir db/rls.sql) : même le propriétaire de la
--     table ne lit pas les données sans contexte d'entreprise.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Entreprises
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  rccm        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT 'Daloa',
  currency    TEXT NOT NULL DEFAULT 'XOF',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_len        CHECK (char_length(btrim(name))    BETWEEN 2 AND 120),
  CONSTRAINT companies_rccm_len        CHECK (char_length(rccm)    <= 60),
  CONSTRAINT companies_phone_len       CHECK (char_length(phone)   <= 30),
  CONSTRAINT companies_email_len       CHECK (char_length(email)   <= 254),
  CONSTRAINT companies_address_len     CHECK (char_length(address) <= 240),
  CONSTRAINT companies_city_len        CHECK (char_length(city)    BETWEEN 2 AND 80),
  CONSTRAINT companies_currency_xof    CHECK (currency = 'XOF')
);

-- ---------------------------------------------------------------------
-- Utilisateurs (appartenant à une entreprise)
-- auth_provider :
--   * 'local'     → email + mot de passe (hash scrypt, jamais en clair)
--   * 'neon_auth' → compte géré par Neon Auth (auth_subject = id externe)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  password_hash        TEXT,
  full_name            TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'admin',
  auth_provider        TEXT NOT NULL DEFAULT 'local',
  auth_subject         TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_users_email_format  CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT app_users_email_len     CHECK (char_length(email) BETWEEN 5 AND 254),
  CONSTRAINT app_users_fullname_len  CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT app_users_role_valid    CHECK (role IN ('admin', 'member')),
  CONSTRAINT app_users_provider_valid CHECK (auth_provider IN ('local', 'neon_auth')),
  CONSTRAINT app_users_local_needs_password CHECK (
    (auth_provider = 'local' AND password_hash IS NOT NULL) OR
    (auth_provider = 'neon_auth' AND auth_subject IS NOT NULL)
  ),
  CONSTRAINT app_users_attempts_ok   CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 1000),
  CONSTRAINT app_users_email_unique  UNIQUE (email),
  CONSTRAINT app_users_subject_unique UNIQUE (auth_provider, auth_subject)
);

CREATE INDEX IF NOT EXISTS app_users_company_idx ON app_users (company_id);

-- ---------------------------------------------------------------------
-- Sessions (jetons opaques ; la base ne stocke que le hash SHA-256)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  user_agent   TEXT NOT NULL DEFAULT '',
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT sessions_token_hash_len CHECK (char_length(token_hash) = 64),
  CONSTRAINT sessions_ua_len        CHECK (char_length(user_agent) <= 300)
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------
-- Chantiers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  client_name  TEXT NOT NULL,
  location     TEXT NOT NULL DEFAULT '',
  budget       BIGINT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE,
  status       TEXT NOT NULL DEFAULT 'en_cours',
  notes        TEXT NOT NULL DEFAULT '',
  archived_at  TIMESTAMPTZ,
  created_by   UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_len      CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT projects_client_len    CHECK (char_length(btrim(client_name)) BETWEEN 2 AND 160),
  CONSTRAINT projects_location_len  CHECK (char_length(location) <= 200),
  CONSTRAINT projects_notes_len     CHECK (char_length(notes) <= 2000),
  CONSTRAINT projects_budget_range  CHECK (budget >= 0 AND budget <= 999999999999),
  CONSTRAINT projects_status_valid  CHECK (status IN ('planifie', 'en_cours', 'en_pause', 'termine', 'archive')),
  CONSTRAINT projects_dates_coherent CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT projects_archive_consistency CHECK ((status = 'archive') = (archived_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS projects_company_idx ON projects (company_id, status);
CREATE INDEX IF NOT EXISTS projects_company_created_idx ON projects (company_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Dépenses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category          TEXT NOT NULL,
  amount            BIGINT NOT NULL,
  expense_date      DATE NOT NULL,
  supplier          TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  receipt           BYTEA,
  receipt_filename  TEXT,
  receipt_mime      TEXT,
  receipt_size      INTEGER,
  created_by        UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_category_valid CHECK (category IN
    ('materiaux', 'main_oeuvre', 'transport', 'location_materiel', 'sous_traitance', 'frais_divers', 'autre')),
  CONSTRAINT expenses_amount_range CHECK (amount > 0 AND amount <= 999999999999),
  CONSTRAINT expenses_supplier_len CHECK (char_length(supplier) <= 160),
  CONSTRAINT expenses_desc_len     CHECK (char_length(description) <= 500),
  CONSTRAINT expenses_date_sane    CHECK (expense_date >= DATE '2000-01-01' AND expense_date <= DATE '2100-12-31'),
  CONSTRAINT expenses_receipt_mime CHECK (receipt_mime IS NULL OR receipt_mime IN ('image/jpeg', 'image/png', 'application/pdf')),
  CONSTRAINT expenses_receipt_size CHECK (receipt_size IS NULL OR (receipt_size > 0 AND receipt_size <= 2097152)),
  CONSTRAINT expenses_receipt_pair CHECK ((receipt IS NULL) = (receipt_size IS NULL))
);

CREATE INDEX IF NOT EXISTS expenses_project_idx        ON expenses (company_id, project_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_company_date_idx   ON expenses (company_id, expense_date DESC);

-- ---------------------------------------------------------------------
-- Encaissements (déclarations de paiements clients — jamais « présumés »)
-- `reference` est OBLIGATOIRE : n° de reçu, référence de virement, etc.
-- Le rapport PDF les présente comme « déclarés », justifiés seulement si
-- une preuve est jointe.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_name       TEXT NOT NULL,
  amount            BIGINT NOT NULL,
  payment_date      DATE NOT NULL,
  reference         TEXT NOT NULL,
  payment_method    TEXT NOT NULL,
  memo              TEXT NOT NULL DEFAULT '',
  proof             BYTEA,
  proof_filename    TEXT,
  proof_mime        TEXT,
  proof_size        INTEGER,
  created_by        UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_client_len     CHECK (char_length(btrim(client_name)) BETWEEN 2 AND 160),
  CONSTRAINT payments_amount_range   CHECK (amount > 0 AND amount <= 999999999999),
  CONSTRAINT payments_reference_len  CHECK (char_length(btrim(reference)) BETWEEN 2 AND 120),
  CONSTRAINT payments_method_valid   CHECK (payment_method IN
    ('especes', 'mobile_money', 'virement_bancaire', 'cheque', 'autre')),
  CONSTRAINT payments_memo_len       CHECK (char_length(memo) <= 500),
  CONSTRAINT payments_date_sane      CHECK (payment_date >= DATE '2000-01-01' AND payment_date <= DATE '2100-12-31'),
  CONSTRAINT payments_proof_mime     CHECK (proof_mime IS NULL OR proof_mime IN ('image/jpeg', 'image/png', 'application/pdf')),
  CONSTRAINT payments_proof_size     CHECK (proof_size IS NULL OR (proof_size > 0 AND proof_size <= 2097152)),
  CONSTRAINT payments_proof_pair     CHECK ((proof IS NULL) = (proof_size IS NULL))
);

CREATE INDEX IF NOT EXISTS payments_project_idx      ON payments (company_id, project_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS payments_company_date_idx ON payments (company_id, payment_date DESC);

-- ---------------------------------------------------------------------
-- Journal d'audit (append-only : pas de UPDATE/DELETE autorisés, cf RLS)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   UUID,
  summary     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_action_len  CHECK (char_length(action) BETWEEN 1 AND 40),
  CONSTRAINT audit_entity_len  CHECK (char_length(entity) BETWEEN 1 AND 40),
  CONSTRAINT audit_summary_len CHECK (char_length(summary) <= 500)
);

CREATE INDEX IF NOT EXISTS audit_company_created_id_idx ON audit_log (company_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies', 'app_users', 'projects', 'expenses', 'payments']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I_set_updated_at ON %I;
       CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t, t, t);
  END LOOP;
END;
$$;

-- Essai gratuit garanti de 2 semaines complètes (14 jours pleins) pour tous les nouveaux espaces
-- et mise à niveau des anciens défauts éventuels sur une base existante.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days');
ALTER TABLE companies ALTER COLUMN trial_until SET DEFAULT (now() + interval '14 days');
ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_plan TEXT CHECK (billing_plan IN ('essentiel','equipe','entreprise'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_suspended BOOLEAN NOT NULL DEFAULT false;
UPDATE companies
   SET trial_until = GREATEST(trial_until, TIMESTAMPTZ '2026-10-20T09:55:00Z' + interval '14 days')
 WHERE created_at < TIMESTAMPTZ '2026-10-20T09:55:00Z'
   AND NOT COALESCE(billing_suspended, false)
   AND trial_until < TIMESTAMPTZ '2026-10-20T09:55:00Z' + interval '14 days';
CREATE TABLE IF NOT EXISTS billing_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan IN ('essentiel','equipe','entreprise')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  transaction_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credited_at TIMESTAMPTZ,
  access_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_orders_company_idx ON billing_orders(company_id, created_at DESC);
-- Liste des opérateurs SHOPIN30, alimentée uniquement par un administrateur SQL.
CREATE TABLE IF NOT EXISTS platform_operators (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS platform_actions (
  id BIGSERIAL PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES app_users(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  suspended BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Modules métier V2, appliqués après schema.sql et avant rls.sql.
CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_id ON projects(company_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_id ON app_users(company_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_tenant_id ON expenses(company_id,id);

CREATE TABLE IF NOT EXISTS operation_requests (
  company_id UUID NOT NULL REFERENCES companies(id), request_id UUID NOT NULL,
  user_id UUID NOT NULL, fingerprint TEXT NOT NULL, response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(company_id,request_id),
  FOREIGN KEY(company_id,user_id) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS commercial_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
  number TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('quote','invoice','credit')),
  invoice_kind TEXT CHECK(invoice_kind IN ('deposit','progress','balance')),
  quote_id UUID, source_id UUID, project_id UUID,
  title TEXT NOT NULL CHECK(char_length(title) BETWEEN 2 AND 160), client_name TEXT NOT NULL,
  client_address TEXT NOT NULL DEFAULT '', lines JSONB NOT NULL,
  subtotal BIGINT NOT NULL CHECK(subtotal BETWEEN 0 AND 999999999999),
  tax BIGINT NOT NULL CHECK(tax BETWEEN 0 AND 999999999999),
  total BIGINT NOT NULL CHECK(total BETWEEN 1 AND 999999999999),
  estimated_cost BIGINT NOT NULL DEFAULT 0 CHECK(estimated_cost BETWEEN 0 AND 999999999999),
  tax_bps INTEGER NOT NULL DEFAULT 0 CHECK(tax_bps BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','rejected')),
  due_date DATE, accepted_name TEXT, accepted_reference TEXT, accepted_at TIMESTAMPTZ,
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), UNIQUE(company_id,number),
  CHECK(total=subtotal+tax),
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,quote_id) REFERENCES commercial_documents(company_id,id),
  FOREIGN KEY(company_id,source_id) REFERENCES commercial_documents(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS price_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
  label TEXT NOT NULL, unit TEXT NOT NULL, unit_price BIGINT NOT NULL CHECK(unit_price BETWEEN 0 AND 999999999999),
  unit_cost BIGINT NOT NULL DEFAULT 0 CHECK(unit_cost BETWEEN 0 AND 999999999999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cash_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID NOT NULL, assignee_id UUID NOT NULL, amount BIGINT NOT NULL CHECK(amount BETWEEN 1 AND 999999999999),
  purpose TEXT NOT NULL, reference TEXT NOT NULL, advance_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_by UUID NOT NULL, closed_by UUID, closed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,assignee_id) REFERENCES app_users(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id),
  FOREIGN KEY(company_id,closed_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS advance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), advance_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('expense','return')), amount BIGINT NOT NULL CHECK(amount BETWEEN 1 AND 999999999999),
  expense_id UUID UNIQUE, reference TEXT NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK((kind='expense')=(expense_id IS NOT NULL)),
  FOREIGN KEY(company_id,advance_id) REFERENCES cash_advances(company_id,id),
  FOREIGN KEY(company_id,expense_id) REFERENCES expenses(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
  full_name TEXT NOT NULL, trade TEXT NOT NULL DEFAULT '', daily_rate BIGINT NOT NULL CHECK(daily_rate BETWEEN 1 AND 999999999),
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id,id)
);
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL, worker_id UUID NOT NULL,
  work_date DATE NOT NULL, minutes INTEGER NOT NULL CHECK(minutes BETWEEN 30 AND 960),
  cost BIGINT NOT NULL CHECK(cost BETWEEN 1 AND 999999999999),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  expense_id UUID UNIQUE, created_by UUID NOT NULL, reviewed_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), UNIQUE(company_id,worker_id,work_date),
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,worker_id) REFERENCES workers(company_id,id),
  FOREIGN KEY(company_id,expense_id) REFERENCES expenses(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id),
  FOREIGN KEY(company_id,reviewed_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS site_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task','reserve')),
  assignee_id UUID, due_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','validated')),
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,assignee_id) REFERENCES app_users(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS site_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL,
  entry_date DATE NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100),
  photo BYTEA, photo_mime TEXT, photo_filename TEXT,
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id),
  CHECK(photo_mime IS NULL OR photo_mime IN ('image/jpeg','image/png')),
  CHECK(photo IS NULL OR octet_length(photo) <= 2097152)
);
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, unit TEXT NOT NULL, minimum_milli BIGINT NOT NULL DEFAULT 0 CHECK(minimum_milli>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id,id)
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL, item_id UUID NOT NULL,
  supplier TEXT NOT NULL, quantity_milli BIGINT NOT NULL CHECK(quantity_milli BETWEEN 1 AND 1000000000),
  unit_price BIGINT NOT NULL CHECK(unit_price BETWEEN 1 AND 999999999999), amount BIGINT NOT NULL CHECK(amount BETWEEN 1 AND 999999999999),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','received','rejected')),
  delivery_date DATE NOT NULL, reference TEXT, expense_id UUID UNIQUE,
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,item_id) REFERENCES inventory_items(company_id,id),
  FOREIGN KEY(company_id,expense_id) REFERENCES expenses(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL, item_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('receipt','consume','return')), quantity_milli BIGINT NOT NULL CHECK(quantity_milli>0),
  order_id UUID UNIQUE, reference TEXT NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
  FOREIGN KEY(company_id,item_id) REFERENCES inventory_items(company_id,id),
  FOREIGN KEY(company_id,order_id) REFERENCES purchase_orders(company_id,id),
  FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['operation_requests','commercial_documents','price_items','cash_advances','advance_entries','workers','attendance','site_tasks','site_journal','inventory_items','purchase_orders','stock_movements'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)',t||'_tenant_idx',t);
  END LOOP;
END $$;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='payments_invoice_tenant_fk') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_invoice_tenant_fk FOREIGN KEY(company_id,invoice_id) REFERENCES commercial_documents(company_id,id);
  END IF;
END $$;
-- Extensions chantier : versions immuables, planning, dépôts et paie.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_number TEXT NOT NULL DEFAULT '' CHECK(length(tax_number)<=100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_regime TEXT NOT NULL DEFAULT '' CHECK(length(tax_regime)<=160);
CREATE TABLE IF NOT EXISTS plan_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL,
 title TEXT NOT NULL, revision TEXT NOT NULL, file BYTEA NOT NULL CHECK(octet_length(file)<=2097152), mime TEXT NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')), filename TEXT NOT NULL,
 sha256 TEXT NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,project_id,title,revision),
 FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id), FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS plan_annotations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), plan_id UUID NOT NULL,
 page INTEGER NOT NULL CHECK(page BETWEEN 1 AND 1000), x DOUBLE PRECISION NOT NULL CHECK(x BETWEEN 0 AND 1), y DOUBLE PRECISION NOT NULL CHECK(y BETWEEN 0 AND 1),
 note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,plan_id) REFERENCES plan_versions(company_id,id), FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
CREATE TABLE IF NOT EXISTS schedule_tasks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), project_id UUID NOT NULL,
 title TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL CHECK(end_date>=start_date), progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100),
 predecessor_id UUID, assignee_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), CHECK(predecessor_id IS DISTINCT FROM id),
 FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id), FOREIGN KEY(company_id,assignee_id) REFERENCES app_users(company_id,id),
 FOREIGN KEY(company_id,predecessor_id) REFERENCES schedule_tasks(company_id,id)
);
CREATE TABLE IF NOT EXISTS warehouses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 UNIQUE(company_id,id), UNIQUE(company_id,name)
);
CREATE TABLE IF NOT EXISTS warehouse_movements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), item_id UUID NOT NULL,
 from_id UUID, to_id UUID, project_id UUID, quantity_milli BIGINT NOT NULL CHECK(quantity_milli BETWEEN 1 AND 1000000000),
 reference TEXT NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(from_id IS NOT NULL OR to_id IS NOT NULL), CHECK(from_id IS DISTINCT FROM to_id), CHECK(project_id IS NULL OR (from_id IS NOT NULL AND to_id IS NULL)),
 FOREIGN KEY(company_id,item_id) REFERENCES inventory_items(company_id,id), FOREIGN KEY(company_id,from_id) REFERENCES warehouses(company_id,id),
 FOREIGN KEY(company_id,to_id) REFERENCES warehouses(company_id,id), FOREIGN KEY(company_id,project_id) REFERENCES projects(company_id,id),
 FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id)
);
-- Archives historiques uniquement : module paie retiré, aucune API métier active.
-- Ne pas supprimer ces tables automatiquement afin de préserver les données existantes.
CREATE TABLE IF NOT EXISTS payroll_profiles (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), worker_id UUID NOT NULL,
 employee_number TEXT NOT NULL, social_number TEXT NOT NULL, job_title TEXT NOT NULL, monthly_salary BIGINT NOT NULL CHECK(monthly_salary BETWEEN 1 AND 999999999),
 UNIQUE(company_id,id), UNIQUE(company_id,worker_id), UNIQUE(company_id,employee_number),
 FOREIGN KEY(company_id,worker_id) REFERENCES workers(company_id,id)
);
CREATE TABLE IF NOT EXISTS payroll_slips (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id), profile_id UUID NOT NULL,
 period TEXT NOT NULL CHECK(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'), snapshot JSONB NOT NULL,
 gross BIGINT NOT NULL CHECK(gross BETWEEN 1 AND 999999999999), deductions BIGINT NOT NULL CHECK(deductions BETWEEN 0 AND gross),
 employer_charges BIGINT NOT NULL CHECK(employer_charges BETWEEN 0 AND 999999999999), status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paid')),
 validation_reference TEXT, approved_by UUID, payment_reference TEXT, payment_date DATE, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,profile_id,period),
 FOREIGN KEY(company_id,profile_id) REFERENCES payroll_profiles(company_id,id), FOREIGN KEY(company_id,created_by) REFERENCES app_users(company_id,id),
 FOREIGN KEY(company_id,approved_by) REFERENCES app_users(company_id,id)
);

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['plan_versions','plan_annotations','schedule_tasks','warehouses','warehouse_movements','payroll_profiles','payroll_slips'] LOOP
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)',t||'_tenant_idx',t);
 END LOOP;
END $$;
COMMIT;
