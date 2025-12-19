// src/databases/mongo/mongo-foundational.ts
import { Db } from 'mongodb';
import { IBaseApiConfig } from '../../../models/base-api-config.interface.js';

export interface SyntheticMigration {
  name: string;
  up: (context: { context: Db }) => Promise<void>;
  down: (context: { context: Db }) => Promise<void>;
}

export const getMongoFoundational = (config: IBaseApiConfig): SyntheticMigration[] => {
  const migrations: SyntheticMigration[] = [];
  const isMultiTenant = config.app.isMultiTenant === true;

  // 1. BASE USERS
  migrations.push({
    name: '00000000000001_base-users',
    up: async ({ context: db }) => {
      await db.createCollection('users');
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      
      // Dynamic Index Creation based on config
      if (isMultiTenant) {
        await db.collection('users').createIndex({ _orgId: 1 });
      }
    },
    down: async ({ context: db }) => {
      await db.collection('users').drop();
    }
  });

  // 2. ORGANIZATIONS
  if (isMultiTenant) {
    migrations.push({
      name: '00000000000002_base-organizations',
      up: async ({ context: db }) => {
        await db.createCollection('organizations');
        await db.collection('organizations').createIndex({ name: 1 });
      },
      down: async ({ context: db }) => {
        await db.collection('organizations').drop();
      }
    });
  }

  return migrations;
};