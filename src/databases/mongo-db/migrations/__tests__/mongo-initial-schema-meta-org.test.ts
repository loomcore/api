import { initializeSystemUserContext, isSystemUserContextInitialized } from '@loomcore/common/models';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IInitialDbMigrationConfig } from '../../../../models/initial-database-config.interface.js';
import { getMongoInitialSchema } from '../mongo-initial-schema.js';

const isMongo = process.env.TEST_DATABASE === 'mongodb';

describe.skipIf(!isMongo)('mongo initial schema meta-org seed', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        ip: '127.0.0.1',
        port: 0,
      },
      binary: {
        downloadDir: process.env.HOME ? `${process.env.HOME}/.cache/mongodb-binaries` : undefined,
      },
    });
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('stores a mixed-case metaOrgCode as lowercase', async () => {
    const db = mongoClient.db('meta-org-seed-test');

    if (!isSystemUserContextInitialized()) {
      initializeSystemUserContext('system@test.com', undefined);
    }

    const dbConfig: IInitialDbMigrationConfig = {
      env: 'test',
      app: {
        isMultiTenant: true,
        isAuthEnabled: false,
        name: 'test-app',
        dbType: 'mongodb',
      },
      database: {
        name: 'test-db',
        host: 'localhost',
        password: 'test-password',
        port: 27017,
        username: 'test-user',
      },
      adminUser: { email: 'admin@test.com', password: 'admin-password' },
      multiTenant: {
        metaOrgName: 'Mixed Case Meta',
        metaOrgCode: '  MetaOrg  ',
        metaOrgDomains: [],
      },
    };

    const migrations = getMongoInitialSchema(dbConfig);
    for (const name of ['00000000000001_schema-organizations', '00000000000009_data-meta-org']) {
      const migration = migrations.find((item) => item.name === name);
      expect(migration, `missing migration ${name}`).toBeDefined();
      await migration!.up({ context: db });
    }

    const stored = await db.collection('organizations').findOne({ isMetaOrg: true });
    expect(stored?.code).toBe('metaorg');
  });
});
