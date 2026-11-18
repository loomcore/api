import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { IEntity } from '@loomcore/common/models';

import { IdNotFoundError } from '../../../errors/index.js';
import { replaceOne } from '../commands/mongo-replace-one.command.js';

const isMongo = process.env.TEST_DATABASE === 'mongodb';
const collectionName = 'replaceOnePreserveEntities';

interface ReplaceOneEntity extends IEntity {
  name: string;
  description?: string;
  extra?: string;
  formula?: string;
  'a.b'?: string;
  _created?: Date;
  _createdBy?: ObjectId | string;
  _updated?: Date;
  _updatedBy?: ObjectId | string;
}

describe.skipIf(!isMongo)('Mongo replaceOne command', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let collection: Collection;

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
    db = mongoClient.db('replace-one-preserve-test');
    collection = db.collection(collectionName);
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
  });

  it('should remove fields omitted from the replacement document', async () => {
    const id = new ObjectId();
    const createdBy = new ObjectId();
    const created = new Date('2020-01-15T12:00:00.000Z');
    await collection.insertOne({
      _id: id,
      name: 'Original',
      description: 'keep-me-gone',
      extra: 'removed-by-full-replace',
      _created: created,
      _createdBy: createdBy,
    });

    const replaced = await replaceOne<ReplaceOneEntity>(
      db,
      collectionName,
      { _id: { eq: id.toString() } },
      { name: 'Replaced' },
      [],
    );

    expect(replaced.name).toBe('Replaced');
    expect(replaced.description).toBeUndefined();
    expect(replaced.extra).toBeUndefined();

    const stored = await collection.findOne({ _id: id });
    expect(stored?.description).toBeUndefined();
    expect(stored?.extra).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(stored, 'description')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(stored, 'extra')).toBe(false);
  });

  it('should preserve _id, _created, and _createdBy when the replacement omits them', async () => {
    const id = new ObjectId();
    const createdBy = new ObjectId();
    const created = new Date('2020-01-15T12:00:00.000Z');
    await collection.insertOne({
      _id: id,
      name: 'Original',
      description: 'keep-me-gone',
      _created: created,
      _createdBy: createdBy,
      _updated: new Date('2020-01-15T12:00:00.000Z'),
      _updatedBy: createdBy,
    });

    const replaced = await replaceOne<ReplaceOneEntity>(
      db,
      collectionName,
      { _id: { eq: id.toString() } },
      {
        name: 'Replaced',
        _updated: new Date('2024-06-01T00:00:00.000Z'),
        _updatedBy: new ObjectId().toString(),
      },
      [],
    );

    expect(replaced._id.toString()).toBe(id.toString());
    expect(replaced.name).toBe('Replaced');
    expect(replaced._created).toEqual(created);
    expect(replaced._createdBy?.toString()).toBe(createdBy.toString());

    const stored = await collection.findOne({ _id: id });
    expect(stored?._created).toEqual(created);
    expect(stored?._createdBy?.toString()).toBe(createdBy.toString());
  });

  it('should ignore client-forged _id, _created, and _createdBy and keep the stored values', async () => {
    const id = new ObjectId();
    const createdBy = new ObjectId();
    const created = new Date('2021-03-01T08:30:00.000Z');
    await collection.insertOne({
      _id: id,
      name: 'Original',
      _created: created,
      _createdBy: createdBy,
    });

    const forgedId = new ObjectId();
    const forgedCreated = new Date('1999-01-01T00:00:00.000Z');
    const forgedCreatedBy = new ObjectId();

    const replaced = await replaceOne<ReplaceOneEntity>(
      db,
      collectionName,
      { _id: { eq: id.toString() } },
      {
        _id: forgedId.toString(),
        name: 'Forged system props attempt',
        _created: forgedCreated,
        _createdBy: forgedCreatedBy.toString(),
      },
      [],
    );

    expect(replaced._id.toString()).toBe(id.toString());
    expect(replaced.name).toBe('Forged system props attempt');
    expect(replaced._created).toEqual(created);
    expect(replaced._createdBy?.toString()).toBe(createdBy.toString());
    expect(await collection.findOne({ _id: forgedId })).toBeNull();
  });

  it('should store user values that start with $ literally', async () => {
    const id = new ObjectId();
    const createdBy = new ObjectId();
    await collection.insertOne({
      _id: id,
      name: 'Original',
      _created: new Date('2022-01-01T00:00:00.000Z'),
      _createdBy: createdBy,
    });

    const replaced = await replaceOne<ReplaceOneEntity>(
      db,
      collectionName,
      { _id: { eq: id.toString() } },
      {
        name: '$name',
        formula: '$add',
        'a.b': '$path.value',
      } as ReplaceOneEntity,
      [],
    );

    expect(replaced.name).toBe('$name');
    expect(replaced.formula).toBe('$add');
    expect((replaced as any)['a.b']).toBe('$path.value');

    const stored = await collection.findOne({ _id: id });
    expect(stored?.name).toBe('$name');
    expect(stored?.formula).toBe('$add');
    expect(stored?.['a.b']).toBe('$path.value');
  });

  it('should throw IdNotFoundError when no document matches the filter', async () => {
    await expect(
      replaceOne<ReplaceOneEntity>(
        db,
        collectionName,
        { _id: { eq: new ObjectId().toString() } },
        { name: 'Missing' },
        [],
      ),
    ).rejects.toThrow(IdNotFoundError);
  });
});
