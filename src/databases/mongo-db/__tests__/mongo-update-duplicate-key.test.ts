import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { IEntity } from '@loomcore/common/models';

import { DuplicateKeyError, IdNotFoundError, NotFoundError, BadRequestError } from '../../../errors/index.js';
import { batchUpdate } from '../commands/mongo-batch-update.command.js';
import { replaceOne } from '../commands/mongo-replace-one.command.js';
import { updateOne } from '../commands/mongo-update-one.command.js';
import { updateMany } from '../commands/mongo-update-many.command.js';
import type { Filters } from '../../../services/filters.type.js';

const isMongo = process.env.TEST_DATABASE === 'mongodb';
const collectionName = 'duplicateKeyUpdateEntities';
const collationCollectionName = 'collationDuplicateKeyUpdateEntities';
const emptyFilters: Filters = {};

interface DuplicateKeyUpdateEntity extends IEntity {
  name: string;
}

describe.skipIf(!isMongo)('Mongo update commands - duplicate key handling', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let collection: Collection;
  let collationCollection: Collection;

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
    db = mongoClient.db('duplicate-key-update-test');
    collection = db.collection(collectionName);
    collationCollection = db.collection(collationCollectionName);
    await collection.createIndex({ name: 1 }, { unique: true });
    await collationCollection.createIndex({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 1 } });
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await collection.deleteMany({});
    await collationCollection.deleteMany({});
  });

  async function insertNamedPair(target: Collection = collection) {
    const firstId = new ObjectId();
    const secondId = new ObjectId();
    await target.insertMany([
      { _id: firstId, name: 'Alice' },
      { _id: secondId, name: 'Bob' },
    ]);
    return { firstId, secondId };
  }

  async function expectDuplicateKeyError(promise: Promise<unknown>, message: string) {
    const error = await promise.then(
      () => {
        throw new Error('Expected DuplicateKeyError to be thrown');
      },
      (err) => err,
    );
    expect(error).toBeInstanceOf(DuplicateKeyError);
    expect(error.message).toBe(message);
    expect(error.statusCode).toBe(400);
  }

  async function expectNonDuplicateError(promise: Promise<unknown>) {
    const error = await promise.then(
      () => {
        throw new Error('Expected a non-duplicate error to be thrown');
      },
      (err) => err,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DuplicateKeyError);
    return error;
  }

  describe('replaceOne', () => {
    it('should throw DuplicateKeyError when replace collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();

      await expectDuplicateKeyError(
        replaceOne<DuplicateKeyUpdateEntity>(db, collectionName, { _id: { eq: secondId.toString() } }, { name: 'Alice' }, []),
        `${collectionName} already exists`,
      );
    });

    it('should throw IdNotFoundError when the id does not exist', async () => {
      await expect(
        replaceOne<DuplicateKeyUpdateEntity>(db, collectionName, { _id: { eq: new ObjectId().toString() } }, { name: 'Alice' }, []),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();

      const error = await expectNonDuplicateError(
        replaceOne<DuplicateKeyUpdateEntity>(db, collectionName, { _id: { eq: secondId.toString() } }, { _id: new ObjectId().toString(), name: 'Charlie' }, []),
      );
      expect(error).not.toBeInstanceOf(IdNotFoundError);
    });
  });

  describe('updateOne', () => {
    it('should throw DuplicateKeyError when $set collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();

      await expectDuplicateKeyError(
        updateOne<DuplicateKeyUpdateEntity>(db, collectionName, { _id: { eq: secondId.toString() } }, { name: 'Alice' }, []),
        `${collectionName} already exists`,
      );
    });

    it('should throw DuplicateKeyError when a collation unique index collides on accent/case-only change', async () => {
      const firstId = new ObjectId();
      const secondId = new ObjectId();
      await collationCollection.insertMany([
        { _id: firstId, name: 'Cafe' },
        { _id: secondId, name: 'Restaurant' },
      ]);

      await expectDuplicateKeyError(
        updateOne<DuplicateKeyUpdateEntity>(db, collationCollectionName, { _id: { eq: secondId.toString() } }, { name: 'CAFÉ' }, []),
        `${collationCollectionName} already exists`,
      );
    });

    it('should throw IdNotFoundError when the id does not exist', async () => {
      await expect(
        updateOne<DuplicateKeyUpdateEntity>(db, collectionName, { _id: { eq: new ObjectId().toString() } }, { name: 'Alice' }, []),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();

      const error = await expectNonDuplicateError(
        updateOne<DuplicateKeyUpdateEntity>(db, collectionName, { _id: { eq: secondId.toString() } }, { _id: new ObjectId().toString() }, []),
      );
      expect(error).not.toBeInstanceOf(IdNotFoundError);
    });
  });

  describe('updateMany', () => {
    it('should throw DuplicateKeyError when updateMany collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();
      const filters: Filters = { _id: { eq: secondId.toString() } };

      await expectDuplicateKeyError(
        updateMany<DuplicateKeyUpdateEntity>(db, collectionName, filters, { name: 'Alice' }, []),
        `One or more ${collectionName} already exist`,
      );
    });

    it('should throw NotFoundError when no records match the update query', async () => {
      const filters: Filters = { _id: { eq: new ObjectId().toString() } };

      await expect(
        updateMany<DuplicateKeyUpdateEntity>(db, collectionName, filters, { name: 'Alice' }, []),
      ).rejects.toThrow(NotFoundError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();
      const filters: Filters = { _id: { eq: secondId.toString() } };

      const error = await expectNonDuplicateError(
        updateMany<DuplicateKeyUpdateEntity>(db, collectionName, filters, { _id: new ObjectId().toString() }, []),
      );
      expect(error).not.toBeInstanceOf(NotFoundError);
    });
  });

  describe('batchUpdate', () => {
    it('should throw DuplicateKeyError when bulkWrite collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();

      await expectDuplicateKeyError(
        batchUpdate(db, collectionName, emptyFilters, [{ _id: secondId, name: 'Alice' }], []),
        `One or more ${collectionName} already exist`,
      );
    });

    it('should throw BadRequestError when an entity is missing a valid ObjectId _id', async () => {
      await expect(
        batchUpdate(db, collectionName, emptyFilters, [{ name: 'Alice' }], []),
      ).rejects.toThrow(BadRequestError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();

      const error = await expectNonDuplicateError(
        batchUpdate(db, collectionName, emptyFilters, [{ _id: secondId, name: 'Bob', 'name.nested': 'conflict' } as any], []),
      );
      expect(error).not.toBeInstanceOf(BadRequestError);
    });
  });
});
