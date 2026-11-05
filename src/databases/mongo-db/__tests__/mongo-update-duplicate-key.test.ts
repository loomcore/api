import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { DefaultQueryOptions, IQueryOptions } from '@loomcore/common/models';

import { BadRequestError, DuplicateKeyError, IdNotFoundError, NotFoundError } from '../../../errors/index.js';
import { batchUpdate } from '../commands/mongo-batch-update.command.js';
import { fullUpdateById } from '../commands/mongo-full-update-by-id.command.js';
import { partialUpdateById } from '../commands/mongo-partial-update-by-id.command.js';
import { update } from '../commands/mongo-update.command.js';

const isMongo = process.env.TEST_DATABASE === 'mongodb';
const collectionName = 'duplicateKeyUpdateEntities';
const collationCollectionName = 'collationDuplicateKeyUpdateEntities';
const emptyQuery: IQueryOptions = { ...DefaultQueryOptions, filters: {} };

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

  describe('fullUpdateById', () => {
    it('should throw DuplicateKeyError when replace collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();

      await expectDuplicateKeyError(
        fullUpdateById(db, [], {}, secondId.toString(), { name: 'Alice' }, collectionName),
        `${collectionName} already exists`,
      );
    });

    it('should throw BadRequestError when id is not a valid ObjectId', async () => {
      await expect(
        fullUpdateById(db, [], {}, 'invalid-object-id', { name: 'Alice' }, collectionName),
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw IdNotFoundError when the id does not exist', async () => {
      await expect(
        fullUpdateById(db, [], {}, new ObjectId().toString(), { name: 'Alice' }, collectionName),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();

      const error = await expectNonDuplicateError(
        fullUpdateById(db, [], {}, secondId.toString(), { _id: new ObjectId(), name: 'Charlie' }, collectionName),
      );
      expect(error).not.toBeInstanceOf(BadRequestError);
      expect(error).not.toBeInstanceOf(IdNotFoundError);
    });
  });

  describe('partialUpdateById', () => {
    it('should throw DuplicateKeyError when $set collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();

      await expectDuplicateKeyError(
        partialUpdateById(db, [], {}, secondId.toString(), { name: 'Alice' }, collectionName),
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
        partialUpdateById(db, [], {}, secondId.toString(), { name: 'CAFÉ' }, collationCollectionName),
        `${collationCollectionName} already exists`,
      );
    });

    it('should throw BadRequestError when id is not a valid ObjectId', async () => {
      await expect(
        partialUpdateById(db, [], {}, 'invalid-object-id', { name: 'Alice' }, collectionName),
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw IdNotFoundError when the id does not exist', async () => {
      await expect(
        partialUpdateById(db, [], {}, new ObjectId().toString(), { name: 'Alice' }, collectionName),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();

      const error = await expectNonDuplicateError(
        partialUpdateById(db, [], {}, secondId.toString(), { _id: new ObjectId() }, collectionName),
      );
      expect(error).not.toBeInstanceOf(BadRequestError);
      expect(error).not.toBeInstanceOf(IdNotFoundError);
    });
  });

  describe('update', () => {
    it('should throw DuplicateKeyError when updateMany collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();
      const queryObject: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { _id: { eq: secondId.toString() } },
      };

      await expectDuplicateKeyError(
        update(db, queryObject, { name: 'Alice' }, [], collectionName),
        `One or more ${collectionName} already exist`,
      );
    });

    it('should throw NotFoundError when no records match the update query', async () => {
      const queryObject: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { _id: { eq: new ObjectId().toString() } },
      };

      await expect(
        update(db, queryObject, { name: 'Alice' }, [], collectionName),
      ).rejects.toThrow(NotFoundError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();
      const queryObject: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { _id: { eq: secondId.toString() } },
      };

      const error = await expectNonDuplicateError(
        update(db, queryObject, { _id: new ObjectId() }, [], collectionName),
      );
      expect(error).not.toBeInstanceOf(NotFoundError);
    });
  });

  describe('batchUpdate', () => {
    it('should throw DuplicateKeyError when bulkWrite collides with a unique index', async () => {
      const { secondId } = await insertNamedPair();

      await expectDuplicateKeyError(
        batchUpdate(db, [{ _id: secondId, name: 'Alice' }], [], emptyQuery, collectionName),
        `One or more ${collectionName} already exist`,
      );
    });

    it('should throw BadRequestError when an entity is missing a valid ObjectId _id', async () => {
      await expect(
        batchUpdate(db, [{ name: 'Alice' }], [], emptyQuery, collectionName),
      ).rejects.toThrow(BadRequestError);
    });

    it('should rethrow non-duplicate Mongo errors unchanged', async () => {
      const { secondId } = await insertNamedPair();

      const error = await expectNonDuplicateError(
        batchUpdate(db, [{ _id: secondId, name: 'Bob', 'name.nested': 'conflict' } as any], [], emptyQuery, collectionName),
      );
      expect(error).not.toBeInstanceOf(BadRequestError);
    });
  });
});
