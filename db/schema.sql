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

CREATE INDEX IF NOT EXISTS audit_company_idx ON audit_log (company_id, created_at DESC);

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

COMMIT;
