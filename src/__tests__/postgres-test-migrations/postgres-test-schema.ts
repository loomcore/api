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

  // 5. Persons
  migrations.push({
    name: '00000000000105_schema-persons',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "persons" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "external_id" VARCHAR UNIQUE,
          "is_agent" BOOLEAN NOT NULL DEFAULT FALSE,
          "is_client" BOOLEAN NOT NULL DEFAULT FALSE,
          "is_employee" BOOLEAN NOT NULL DEFAULT FALSE,
          "first_name" VARCHAR NOT NULL,
          "middle_name" VARCHAR,
          "date_of_birth" DATE,
          "last_name" VARCHAR NOT NULL,
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
      await pool.query('DROP TABLE IF EXISTS "persons"');
    }
  });

  // 6. Agents (must come after persons since agents references persons, and before clients since clients references agents)
  migrations.push({
    name: '00000000000105_5_schema-agents',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "agents" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "person_id" INTEGER NOT NULL UNIQUE,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_agents_person_id FOREIGN KEY ("person_id") REFERENCES persons("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "agents"');
    }
  });

  // 7. Clients (must come after persons and agents since clients references both)
  migrations.push({
    name: '00000000000105_6_schema-clients',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "clients" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "external_id" VARCHAR UNIQUE,
          "person_id" INTEGER NOT NULL UNIQUE,
          "agent_id" INTEGER,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_clients_person_id FOREIGN KEY ("person_id") REFERENCES persons("_id") ON DELETE CASCADE,
          CONSTRAINT fk_clients_agent_id FOREIGN KEY ("agent_id") REFERENCES agents("_id") ON DELETE SET NULL
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "clients"');
    }
  });

  // 8. Policies (must come after clients since policies references clients)
  migrations.push({
    name: '00000000000105_7_schema-policies',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "policies" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "client_id" INTEGER NOT NULL,
          "amount" NUMERIC NOT NULL,
          "frequency" VARCHAR NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_policies_client_id FOREIGN KEY ("client_id") REFERENCES clients("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "policies"');
    }
  });

  // 9. Agents Policies join table (must come after agents and policies)
  migrations.push({
    name: '00000000000105_8_schema-agents-policies',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS agents_policies (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "policy_id" INTEGER NOT NULL,
          "agent_id" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_agents_policies_policy_id FOREIGN KEY ("policy_id") REFERENCES policies("_id") ON DELETE CASCADE,
          CONSTRAINT fk_agents_policies_agent_id FOREIGN KEY ("agent_id") REFERENCES agents("_id") ON DELETE CASCADE,
          CONSTRAINT uk_agents_policies_policy_agent UNIQUE ("policy_id", "agent_id")
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "agents_policies"');
    }
  });

  // 11. Email Addresses
  migrations.push({
    name: '00000000000106_schema-email-addresses',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_addresses (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "person_id" INTEGER NOT NULL,
          "external_id" VARCHAR UNIQUE,
          "email_address" VARCHAR NOT NULL UNIQUE,
          "email_address_type" VARCHAR,
          "is_default" BOOLEAN NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_email_addresses_person_id FOREIGN KEY ("person_id") REFERENCES persons("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "email_addresses"');
    }
  });


  // 11. Phone Numbers
  migrations.push({
    name: '00000000000107_schema-phone-numbers',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS phone_numbers (
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            "_orgId" INTEGER,
            "external_id" VARCHAR UNIQUE,
            "phone_number" VARCHAR NOT NULL UNIQUE,
            "phone_number_type" VARCHAR,
            "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
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
      await pool.query('DROP TABLE IF EXISTS "phone_numbers"');
    }
  });

  // 12. Addresses
  migrations.push({
    name: '00000000000108_schema-addresses',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS addresses (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "external_id" VARCHAR UNIQUE,
          "address_type" VARCHAR NOT NULL,
          "address_line_1" VARCHAR NOT NULL,
          "address_line_2" VARCHAR,
          "city" VARCHAR NOT NULL,
          "state" VARCHAR NOT NULL,
          "zip_code" VARCHAR NOT NULL,
          "country" VARCHAR NOT NULL,
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
      await pool.query('DROP TABLE IF EXISTS "addresses"');
    }
  });

  // 13. Person Addresses join table
  migrations.push({
    name: '00000000000109_schema-person-addresses',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS persons_addresses (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "address_id" INTEGER NOT NULL,
          "person_id" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_persons_addresses_address_id FOREIGN KEY ("address_id") REFERENCES addresses("_id") ON DELETE CASCADE,
          CONSTRAINT fk_persons_addresses_person_id FOREIGN KEY ("person_id") REFERENCES persons("_id") ON DELETE CASCADE,
          CONSTRAINT uk_persons_addresses_address_person UNIQUE ("address_id", "person_id")
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "persons_addresses"');
    }
  });

  // 14. Persons Phone Numbers join table
  migrations.push({
    name: '00000000000110_schema-person-phone-numbers',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS persons_phone_numbers (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "phone_number_id" INTEGER NOT NULL,
          "person_id" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_persons_phone_numbers_phone_number_id FOREIGN KEY ("phone_number_id") REFERENCES phone_numbers("_id") ON DELETE CASCADE,
          CONSTRAINT fk_persons_phone_numbers_person_id FOREIGN KEY ("person_id") REFERENCES persons("_id") ON DELETE CASCADE,
          CONSTRAINT uk_persons_phone_numbers_phone_number_person UNIQUE ("phone_number_id", "person_id")
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "persons_phone_numbers"');
    }
  });

  // 15. States
  migrations.push({
    name: '00000000000111_schema-states',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS states (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR NOT NULL,
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
      await pool.query('DROP TABLE IF EXISTS "states"');
    }
  });

  // 16. Districts (must come after states since districts references states)
  migrations.push({
    name: '00000000000112_schema-districts',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS districts (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR NOT NULL,
          "state_id" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_districts_state_id FOREIGN KEY ("state_id") REFERENCES states("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "districts"');
    }
  });

  // 17. Schools (must come after districts since schools references districts)
  migrations.push({
    name: '00000000000113_schema-schools',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS schools (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "name" VARCHAR NOT NULL,
          "district_id" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_schools_district_id FOREIGN KEY ("district_id") REFERENCES districts("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "schools"');
    }
  });

  // 18. Persons Schools join table (must come after persons and schools)
  migrations.push({
    name: '00000000000114_schema-person-schools',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS persons_schools (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "person_id" INTEGER NOT NULL,
          "school_id" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT fk_persons_schools_person_id FOREIGN KEY ("person_id") REFERENCES persons("_id") ON DELETE CASCADE,
          CONSTRAINT fk_persons_schools_school_id FOREIGN KEY ("school_id") REFERENCES schools("_id") ON DELETE CASCADE,
          CONSTRAINT uk_persons_schools_person_school UNIQUE ("person_id", "school_id")
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "persons_schools"');
    }
  });

  return migrations;
};

