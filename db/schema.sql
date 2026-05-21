-- ============================================================
-- AgenteAsesorFinanciero — Supabase Schema
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  color      text        NOT NULL,   -- HEX avatar color, e.g. '#6366f1'
  avatar     text        NOT NULL,   -- first letter of name, e.g. 'B'
  created_at timestamptz DEFAULT now()
);

-- ── Categories ───────────────────────────────────────────────
-- User-defined; not hardcoded. Any user can create categories.
-- A category is shared across the household — budget entries
-- determine who uses it and how much each person allocates.
CREATE TABLE categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  icon       text        NOT NULL DEFAULT '📦',
  color      text        NOT NULL DEFAULT '#94a3b8',
  type       text        NOT NULL DEFAULT 'variable'
                         CHECK (type IN ('fixed', 'variable')),
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Subcategories ─────────────────────────────────────────────
CREATE TABLE subcategories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ── Budget ────────────────────────────────────────────────────
-- One row per (user, category, month, year).
-- Each user independently sets their own amount for a category.
-- Pareja view: sum amounts for the same category across users;
--              derive percentages automatically (not stored).
CREATE TABLE budget (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id),
  year        int         NOT NULL,
  month       int         NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount      int         NOT NULL CHECK (amount >= 0),  -- COP
  created_at  timestamptz DEFAULT now(),
  UNIQUE (category_id, user_id, year, month)
);

-- ── Budget History ─────────────────────────────────────────────
-- Append-only audit log. Every change to a budget amount is recorded.
CREATE TABLE budget_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   uuid        REFERENCES budget(id),      -- NULL if budget was deleted
  category_id uuid        REFERENCES categories(id),
  user_id     uuid        REFERENCES users(id),
  year        int         NOT NULL,
  month       int         NOT NULL,
  old_amount  int,
  new_amount  int         NOT NULL,
  reason      text,                                   -- optional note from the user
  changed_at  timestamptz DEFAULT now()
);

-- ── Transactions ──────────────────────────────────────────────
CREATE TABLE transactions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id),
  date           date        NOT NULL,
  category_id    uuid        NOT NULL REFERENCES categories(id),
  subcategory_id uuid        REFERENCES subcategories(id),
  description    text        NOT NULL,
  amount         int         NOT NULL CHECK (amount > 0),  -- COP, always positive
  type           text        NOT NULL CHECK (type IN ('income', 'expense')),
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- ── Debts ─────────────────────────────────────────────────────
-- Debts are independent of the category system.
-- user_id = NULL means it is a shared household debt.
CREATE TABLE debts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  description   text,
  total_amount  int         NOT NULL CHECK (total_amount > 0),  -- original debt in COP
  user_id       uuid        REFERENCES users(id),               -- NULL = shared
  color         text        NOT NULL DEFAULT '#dc2626',
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paid')),
  due_date      date,
  interest_rate numeric(5,2),  -- optional, informational only
  created_at    timestamptz DEFAULT now()
);

-- ── Debt Payments ─────────────────────────────────────────────
CREATE TABLE debt_payments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id     uuid        NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount      int         NOT NULL CHECK (amount > 0),  -- COP
  date        date        NOT NULL,
  description text,
  paid_by     uuid        REFERENCES users(id),
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX idx_budget_user_month        ON budget(user_id, year, month);
CREATE INDEX idx_budget_category_month    ON budget(category_id, year, month);
CREATE INDEX idx_transactions_user_date   ON transactions(user_id, date);
CREATE INDEX idx_transactions_category    ON transactions(category_id);
CREATE INDEX idx_debt_payments_debt       ON debt_payments(debt_id);
CREATE INDEX idx_subcategories_category   ON subcategories(category_id);

-- ============================================================
-- Seed — insert users
-- Update names/colors to match your household's actual names.
-- ============================================================
INSERT INTO users (name, color, avatar) VALUES
  ('Belmont', '#6366f1', 'B'),
  ('Sofi',    '#ec4899', 'S');

-- ============================================================
-- Seed — starter categories (minimum viable set)
-- You can add/edit/delete these from the app.
-- ============================================================
INSERT INTO categories (name, icon, color, type, sort_order) VALUES
  ('Vivienda',             '🏠', '#f59e0b', 'fixed',    1),
  ('Alimentación',         '🛒', '#22c55e', 'variable', 2),
  ('Restaurantes',         '🍽️', '#ef4444', 'variable', 3),
  ('Transporte',           '🚌', '#3b82f6', 'variable', 4),
  ('Salud',                '🏥', '#14b8a6', 'variable', 5),
  ('Entretenimiento',      '🎉', '#8b5cf6', 'variable', 6),
  ('Ropa y cuidado',       '👗', '#ec4899', 'variable', 7),
  ('Tecnología',           '💻', '#06b6d4', 'variable', 8),
  ('Educación',            '📚', '#0ea5e9', 'fixed',    9),
  ('Ahorro',               '💰', '#22c55e', 'fixed',    10),
  ('Deuda',                '📋', '#dc2626', 'fixed',    11),
  ('Suscripciones',        '📱', '#6366f1', 'variable', 12),
  ('Mascotas',             '🐾', '#84cc16', 'variable', 13),
  ('Regalos',              '🎁', '#d946ef', 'variable', 14),
  ('Otros',                '📦', '#94a3b8', 'variable', 15),
  ('Ingreso',              '💵', '#10b981', 'fixed',    16);
