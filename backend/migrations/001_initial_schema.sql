-- Warehouse Receiving System - initial schema

CREATE TYPE user_role AS ENUM ('OPERATOR', 'SUPERVISOR');
CREATE TYPE doc_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE transaction_type AS ENUM ('RECEIPT_IN');

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'OPERATOR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku_normalized ON products (lower(btrim(sku)));

CREATE TABLE receiving_documents (
    id BIGSERIAL PRIMARY KEY,
    document_number VARCHAR(100) NOT NULL UNIQUE,
    status doc_status NOT NULL DEFAULT 'DRAFT',
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE receiving_items (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES receiving_documents(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id),
    expected_quantity INTEGER NOT NULL CHECK (expected_quantity > 0),
    received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    CONSTRAINT chk_received_not_exceed_expected CHECK (received_quantity <= expected_quantity),
    CONSTRAINT uq_receiving_document_product UNIQUE (document_id, product_id)
);

CREATE TABLE inventory (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE REFERENCES products(id),
    quantity_on_hand BIGINT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_transactions (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id),
    document_id BIGINT NOT NULL REFERENCES receiving_documents(id),
    quantity_change INTEGER NOT NULL CHECK (quantity_change > 0),
    type transaction_type NOT NULL DEFAULT 'RECEIPT_IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receiving_documents_status_created ON receiving_documents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receiving_items_document ON receiving_items (document_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created ON inventory_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_created ON inventory_transactions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_document ON inventory_transactions (document_id);
