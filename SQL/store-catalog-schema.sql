-- Esquema mínimo para el módulo de catálogo por tienda.
-- Este archivo refleja el modelo descrito en catalog-implementation-plan.md.

CREATE TABLE IF NOT EXISTS stores (
  id_store UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_tienda TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired')),
  public_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS store_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id_store) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS store_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_group_id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id_store) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
  client_phone TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_status ON stores(status);
CREATE INDEX IF NOT EXISTS idx_store_public_token ON stores(public_token);
CREATE INDEX IF NOT EXISTS idx_store_items_store_id ON store_items(store_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_store_id ON store_orders(store_id);
