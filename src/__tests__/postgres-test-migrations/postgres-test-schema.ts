import { Pool } from 'pg';
import { IBaseApiConfig } from '../../models/base-api-config.interface.js';
import { SyntheticMigration } from '../../databases/postgres/migrations/postgres-initial-schema.js';

/**
 * Test schema migrations for test-specific tables
 * These are only used in test environments, not in production
 */
export const getPostgresTestSchema = (config: IBaseApiConfig): SyntheticMigration[] => {
  const migrations: SyntheticMigration[] = [];
  const isMultiTenant = config.app.isMultiTenant === true;

  // 1. TEST ENTITIES
  migrations.push({
    name: '00000000000100_schema-test-entities',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "testEntities" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR(255) NOT NULL,
          "description" TEXT,
          "isActive" BOOLEAN,
          "tags" TEXT[],
          "count" INTEGER,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "testEntities"');
    }
  });

  // 2. CATEGORIES
  migrations.push({
    name: '00000000000101_schema-categories',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "categories" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR(255) NOT NULL
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "categories"');
    }
  });

  // 3. PRODUCTS
  migrations.push({
    name: '00000000000102_schema-products',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "products" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR(255) NOT NULL,
          "description" TEXT,
          "internalNumber" VARCHAR(255),
          "categoryId" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT "fk_products_category" FOREIGN KEY ("categoryId") REFERENCES "categories"("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "products"');
    }
  });

  // 4. TEST ITEMS
  migrations.push({
    name: '00000000000103_schema-test-items',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "testItems" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR(255) NOT NULL,
          "value" INTEGER,
          "eventDate" TIMESTAMPTZ,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "testItems"');
    }
  });

  return migrations;
};

