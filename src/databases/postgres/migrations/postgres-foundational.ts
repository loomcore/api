// src/databases/postgres/postgres-foundational.ts
import { Pool } from 'pg';
import { IBaseApiConfig } from '../../../models/base-api-config.interface.js';

// Define the interface Umzug expects for code-based migrations
export interface SyntheticMigration {
  name: string;
  up: (context: { context: Pool }) => Promise<void>;
  down: (context: { context: Pool }) => Promise<void>;
}

export const getPostgresFoundational = (config: IBaseApiConfig): SyntheticMigration[] => {
  const migrations: SyntheticMigration[] = [];
  const isMultiTenant = config.app.isMultiTenant === true;

  // 1. BASE USERS
  migrations.push({
    name: '00000000000001_base-users',
    up: async ({ context: pool }) => {
      // DYNAMIC SQL GENERATION
      // If MultiTenant, we inject the column definition.
      // If not, we inject an empty string.
      const orgColumnDef = isMultiTenant ? '_orgId INTEGER,' : '';

      const sql = `
        CREATE TABLE users (
          _id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255),
          roles TEXT[],
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `;
      await pool.query(sql);
      
      // If MultiTenant, maybe we need an index too?
      if (isMultiTenant) {
        await pool.query(`CREATE INDEX idx_users_org_id ON users (_orgId);`);
      }
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS users');
    }
  });

  // 2. ORGANIZATIONS (Conditionally Added)
  // We only add this migration object to the array if the feature is enabled.
  if (isMultiTenant) {
    migrations.push({
      name: '00000000000002_base-organizations',
      up: async ({ context: pool }) => {
        await pool.query(`
          CREATE TABLE organizations (
            _id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            plan_tier VARCHAR(50) DEFAULT 'free',
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS organizations');
      }
    });
  }

  return migrations;
};