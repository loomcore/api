import { afterEach, describe, expect, it } from 'vitest';

import { setupTestConfig } from './common-test.utils.js';
import { TestMongoDatabase } from './mongo-db.test-database.js';

const isMongo = process.env.TEST_DATABASE === 'mongodb';

describe.skipIf(!isMongo)('TestMongoDatabase.getMongoDb', () => {
  let testDatabase: TestMongoDatabase | null = null;

  afterEach(async () => {
    if (testDatabase) {
      await testDatabase.cleanup();
      testDatabase = null;
    }
  });

  it('should return the native Db after init', async () => {
    setupTestConfig(true, 'mongodb');
    testDatabase = new TestMongoDatabase();
    await testDatabase.init();

    const db = testDatabase.getMongoDb();
    expect(db).toBeDefined();

    const collectionName = 'getMongoDb_test_collection';
    await db.collection(collectionName).createIndex({ _orgId: 1, contentType: 1 });
    const indexes = await db.collection(collectionName).indexes();
    expect(indexes.some((index) => index.key && index.key._orgId === 1 && index.key.contentType === 1)).toBe(true);
  });

  it('should throw before init', () => {
    testDatabase = new TestMongoDatabase();

    expect(() => testDatabase!.getMongoDb()).toThrow('TestMongoDatabase is not initialized; call init() first');
  });
});
