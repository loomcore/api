import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { TSchema, Type } from '@sinclair/typebox';
import { TypeboxObjectId } from '@loomcore/common/validation';
import { IUserContext } from '@loomcore/common/models';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { dbUtils } from '../db.utils.js';

describe('dbUtils', () => {
  describe('convertObjectIdsToStrings', () => {
    // Define a test schema
    const TestSchema = Type.Object({
      _id: TypeboxObjectId(),
      name: Type.String(),
      simpleId: TypeboxObjectId(),
      nestedObject: Type.Object({
        nestedId: TypeboxObjectId(),
        normalField: Type.String()
      }),
      arrayOfIds: Type.Array(TypeboxObjectId()),
      arrayOfObjects: Type.Array(
        Type.Object({
          itemId: TypeboxObjectId(),
          itemName: Type.String()
        })
      ),
      _orgId: Type.String(), // This should not be converted as it's in the exclusion list
      normalField: Type.String()
    });

    it('should convert top-level ObjectId to string', () => {
      const objId = new ObjectId();
      const entity = {
        _id: objId,
        name: 'Test Entity'
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(result._id).toBe(objId.toString());
      expect(typeof result._id).toBe('string');
      expect(result.name).toBe('Test Entity');
    });

    it('should convert ObjectId fields based on schema', () => {
      const mainId = new ObjectId();
      const simpleId = new ObjectId();
      const nestedId = new ObjectId();
      
      const entity = {
        _id: mainId,
        name: 'Test Entity',
        simpleId: simpleId,
        nestedObject: {
          nestedId: nestedId,
          normalField: 'Normal Value'
        },
        normalField: 'Another Normal Value'
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(result._id).toBe(mainId.toString());
      expect(result.simpleId).toBe(simpleId.toString());
      expect(result.nestedObject.nestedId).toBe(nestedId.toString());
      
      // Normal fields should remain unchanged
      expect(result.name).toBe('Test Entity');
      expect(result.nestedObject.normalField).toBe('Normal Value');
      expect(result.normalField).toBe('Another Normal Value');
    });

    it('should convert array of ObjectIds to strings', () => {
      const id1 = new ObjectId();
      const id2 = new ObjectId();
      const id3 = new ObjectId();
      
      const entity = {
        _id: new ObjectId(),
        arrayOfIds: [id1, id2, id3]
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(Array.isArray(result.arrayOfIds)).toBe(true);
      expect(result.arrayOfIds).toHaveLength(3);
      expect(result.arrayOfIds[0]).toBe(id1.toString());
      expect(result.arrayOfIds[1]).toBe(id2.toString());
      expect(result.arrayOfIds[2]).toBe(id3.toString());
    });

    it('should convert ObjectIds within array of objects', () => {
      const itemId1 = new ObjectId();
      const itemId2 = new ObjectId();
      
      const entity = {
        _id: new ObjectId(),
        arrayOfObjects: [
          { itemId: itemId1, itemName: 'Item 1' },
          { itemId: itemId2, itemName: 'Item 2' }
        ]
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(Array.isArray(result.arrayOfObjects)).toBe(true);
      expect(result.arrayOfObjects).toHaveLength(2);
      expect(result.arrayOfObjects[0].itemId).toBe(itemId1.toString());
      expect(result.arrayOfObjects[1].itemId).toBe(itemId2.toString());
      expect(result.arrayOfObjects[0].itemName).toBe('Item 1');
      expect(result.arrayOfObjects[1].itemName).toBe('Item 2');
    });

    it('should not convert _orgId field (exclusion list)', () => {
      const orgId = 'org-123'; // String value
      
      const entity = {
        _id: new ObjectId(),
        _orgId: orgId
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(result._orgId).toBe(orgId);
      expect(typeof result._orgId).toBe('string');
    });

    it('should handle null/undefined values', () => {
      const entity = {
        _id: new ObjectId(),
        simpleId: null,
        nestedObject: {
          nestedId: undefined,
          normalField: 'Normal Value'
        }
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(typeof result._id).toBe('string');
      expect(result.simpleId).toBeNull();
      expect(result.nestedObject.nestedId).toBeUndefined();
    });

    it('should handle non-schema fields without conversion', () => {
      const extraId = new ObjectId();
      const idString = new ObjectId().toString(); // String ID that should be in our models
      
      const entity = {
        _id: idString, // TO database, this would be a string ID
        extraField: 'Extra Value',
        extraObjectId: extraId // Not in schema but is an ObjectId
      };

      const result = dbUtils.convertObjectIdsToStrings(entity, TestSchema);
      
      expect(result._id).toBe(idString); // Should remain as string
      expect(result.extraField).toBe('Extra Value');
      expect(result.extraObjectId).toStrictEqual(extraId); // Should remain as ObjectId since not in schema
    });

    it('should have fallback behavior when no schema provided', () => {
      const objId = new ObjectId();
      const entity = {
        _id: objId,
        name: 'Test Entity'
      };

      const result = dbUtils.convertObjectIdsToStrings(entity);
      
      expect(result._id).toBe(objId.toString());
      expect(typeof result._id).toBe('string');
      expect(result.name).toBe('Test Entity');
    });
  });

  describe('convertStringsToObjectIds', () => {
    // Define a test schema
    const TestSchema = Type.Object({
      _id: TypeboxObjectId(),
      name: Type.String(),
      simpleId: TypeboxObjectId(),
      nestedObject: Type.Object({
        nestedId: TypeboxObjectId(),
        normalField: Type.String()
      }),
      arrayOfIds: Type.Array(TypeboxObjectId()),
      arrayOfObjects: Type.Array(
        Type.Object({
          itemId: TypeboxObjectId(),
          itemName: Type.String()
        })
      ),
      _orgId: Type.String(), // This should not be converted as it's in the exclusion list
      normalField: Type.String()
    });

    it('should convert top-level string ID to ObjectId', () => {
      const idString = new ObjectId().toString();
      const entity = {
        _id: idString, // TO database, this is a string ID
        name: 'Test Entity'
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(result._id).toBeInstanceOf(ObjectId);
      expect(result._id.toString()).toBe(idString);
      expect(result.name).toBe('Test Entity');
    });

    it('should convert string ID fields based on schema', () => {
      const mainId = new ObjectId().toString();
      const simpleId = new ObjectId().toString();
      const nestedId = new ObjectId().toString();
      
      const entity = {
        _id: mainId, // TO database, these are string IDs
        name: 'Test Entity',
        simpleId: simpleId,
        nestedObject: {
          nestedId: nestedId,
          normalField: 'Normal Value'
        },
        normalField: 'Another Normal Value'
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(result._id).toBeInstanceOf(ObjectId);
      expect(result._id.toString()).toBe(mainId);
      
      expect(result.simpleId).toBeInstanceOf(ObjectId);
      expect(result.simpleId.toString()).toBe(simpleId);
      
      expect(result.nestedObject.nestedId).toBeInstanceOf(ObjectId);
      expect(result.nestedObject.nestedId.toString()).toBe(nestedId);
      
      // Normal fields should remain unchanged
      expect(result.name).toBe('Test Entity');
      expect(result.nestedObject.normalField).toBe('Normal Value');
      expect(result.normalField).toBe('Another Normal Value');
    });

    it('should convert array of string IDs to ObjectIds', () => {
      const id1 = new ObjectId().toString();
      const id2 = new ObjectId().toString();
      const id3 = new ObjectId().toString();
      
      const entity = {
        _id: new ObjectId().toString(), // TO database, these are string IDs
        arrayOfIds: [id1, id2, id3]
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(Array.isArray(result.arrayOfIds)).toBe(true);
      expect(result.arrayOfIds).toHaveLength(3);
      expect(result.arrayOfIds[0]).toBeInstanceOf(ObjectId);
      expect(result.arrayOfIds[0].toString()).toBe(id1);
      expect(result.arrayOfIds[1].toString()).toBe(id2);
      expect(result.arrayOfIds[2].toString()).toBe(id3);
    });

    it('should convert string IDs within array of objects', () => {
      const itemId1 = new ObjectId().toString();
      const itemId2 = new ObjectId().toString();
      
      const entity = {
        _id: new ObjectId().toString(),
        arrayOfObjects: [
          { itemId: itemId1, itemName: 'Item 1' },
          { itemId: itemId2, itemName: 'Item 2' }
        ]
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(Array.isArray(result.arrayOfObjects)).toBe(true);
      expect(result.arrayOfObjects).toHaveLength(2);
      expect(result.arrayOfObjects[0].itemId).toBeInstanceOf(ObjectId);
      expect(result.arrayOfObjects[0].itemId.toString()).toBe(itemId1);
      expect(result.arrayOfObjects[1].itemId).toBeInstanceOf(ObjectId);
      expect(result.arrayOfObjects[1].itemId.toString()).toBe(itemId2);
      expect(result.arrayOfObjects[0].itemName).toBe('Item 1');
      expect(result.arrayOfObjects[1].itemName).toBe('Item 2');
    });

    it('should not convert _orgId field (exclusion list)', () => {
      const orgId = 'org-123'; // String value that should stay as string
      
      const entity = {
        _id: new ObjectId().toString(),
        _orgId: orgId
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(result._orgId).toBe(orgId);
      expect(typeof result._orgId).toBe('string');
    });

    it('should handle null/undefined values', () => {
      const idString = new ObjectId().toString();
      
      const entity = {
        _id: idString,
        simpleId: null,
        nestedObject: {
          nestedId: undefined,
          normalField: 'Normal Value'
        }
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(result._id).toBeInstanceOf(ObjectId);
      expect(result.simpleId).toBeNull();
      expect(result.nestedObject.nestedId).toBeUndefined();
    });

    it('should not convert invalid ObjectId strings', () => {
      const invalidId = 'not-an-objectid';
      
      const entity = {
        _id: new ObjectId().toString(), // Valid
        simpleId: invalidId // Invalid
      };

      const result = dbUtils.convertStringsToObjectIds(entity, TestSchema);
      
      expect(result._id).toBeInstanceOf(ObjectId);
      expect(result.simpleId).toBe(invalidId); // Should remain as string
    });
  });

  describe('convertStringToObjectId', () => {
    it('should convert a valid string to ObjectId', () => {
      const idString = new ObjectId().toString();
      const result = dbUtils.convertStringToObjectId(idString);
      
      expect(result).toBeInstanceOf(ObjectId);
      expect(result.toString()).toBe(idString);
    });

    it('should return the original ObjectId if one is passed', () => {
      const objId = new ObjectId();
      const result = dbUtils.convertStringToObjectId(objId);
      
      expect(result).toBe(objId);
    });

    it('should return null/undefined if null/undefined is passed', () => {
      expect(dbUtils.convertStringToObjectId(null)).toBeNull();
      expect(dbUtils.convertStringToObjectId(undefined)).toBeUndefined();
    });

    it('should return the original value for invalid ObjectId strings', () => {
      const invalidId = 'not-an-objectid';
      const result = dbUtils.convertStringToObjectId(invalidId);
      
      expect(result).toBe(invalidId);
    });

    it('should return non-string values unchanged', () => {
      const number = 123;
      const bool = true;
      const obj = { test: 'value' };
      
      expect(dbUtils.convertStringToObjectId(number)).toBe(number);
      expect(dbUtils.convertStringToObjectId(bool)).toBe(bool);
      expect(dbUtils.convertStringToObjectId(obj)).toBe(obj);
    });
  });

  // Keep the QueryOptions tests unchanged - these are the only ones that should have been modified
  describe('buildMongoMatchFromQueryOptions', () => {
    it('should build MongoDB $in query for string array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: ['active', 'pending', 'completed']
          }
        }
      };

      const result = dbUtils.buildMongoMatchFromQueryOptions(queryOptions);

      expect(result).toEqual({
        $match: {
          status: { $in: ['active', 'pending', 'completed'] }
        }
      });
    });

    it('should build MongoDB $in query for number array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          priority: {
            in: [1, 2, 3]
          }
        }
      };

      const result = dbUtils.buildMongoMatchFromQueryOptions(queryOptions);

      expect(result).toEqual({
        $match: {
          priority: { $in: [1, 2, 3] }
        }
      });
    });

    it('should convert string ObjectIds to ObjectId instances for properties ending with Id', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          clientId: {
            in: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
          }
        }
      };

      const result = dbUtils.buildMongoMatchFromQueryOptions(queryOptions);

      expect(result).toEqual({
        $match: {
          clientId: { $in: [new ObjectId('507f1f77bcf86cd799439011'), new ObjectId('507f1f77bcf86cd799439012')] }
        }
      });
    });

    it('should handle empty in array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: []
          }
        }
      };

      const result = dbUtils.buildMongoMatchFromQueryOptions(queryOptions);

      expect(result).toEqual({
        $match: {
          status: { $in: [] }
        }
      });
    });

    it('should combine in filter with other filters', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: ['active', 'pending']
          },
          priority: {
            eq: 1
          }
        }
      };

      const result = dbUtils.buildMongoMatchFromQueryOptions(queryOptions);

      expect(result).toEqual({
        $match: {
          status: { $in: ['active', 'pending'] },
          priority: 1
        }
      });
    });
  });

  describe('buildSQLWhereClauseFromQueryOptions', () => {
    it('should build SQL IN clause for string array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: ['active', 'pending', 'completed']
          }
        }
      };

      const result = dbUtils.buildSQLWhereClauseFromQueryOptions(queryOptions, {});

      expect(result).toBe("WHERE Status IN ('active', 'pending', 'completed')");
    });

    it('should build SQL IN clause for number array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          priority: {
            in: [1, 2, 3]
          }
        }
      };

      const result = dbUtils.buildSQLWhereClauseFromQueryOptions(queryOptions, {});

      expect(result).toBe("WHERE Priority IN (1, 2, 3)");
    });

    it('should combine IN clause with other conditions', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: ['active', 'pending']
          },
          priority: {
            eq: 1
          }
        }
      };

      const result = dbUtils.buildSQLWhereClauseFromQueryOptions(queryOptions, {});

      expect(result).toBe("WHERE Status IN ('active', 'pending') AND Priority = 1");
    });
  });
}); 