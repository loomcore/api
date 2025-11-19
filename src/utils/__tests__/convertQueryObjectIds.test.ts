import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { convertQueryObjectIds } from '../../databases/mongoDb/utils/convertQueryObjectIds.js';

describe('convertQueryObjectIds', () => {
  it('should convert string _id to ObjectId', () => {
    const queryObject = { _id: '507f1f77bcf86cd799439011' };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id).toBeInstanceOf(ObjectId);
    expect(result._id.toString()).toBe('507f1f77bcf86cd799439011');
  });

  it('should keep ObjectId _id as ObjectId', () => {
    const objectId = new ObjectId('507f1f77bcf86cd799439011');
    const queryObject = { _id: objectId };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id).toBeInstanceOf(ObjectId);
    expect(result._id).toBe(objectId); // Should be the same instance
    expect(result._id.toString()).toBe('507f1f77bcf86cd799439011');
  });

  it('should convert string IDs in _id $in operator', () => {
    const queryObject = { 
      _id: { 
        $in: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] 
      } 
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id.$in).toHaveLength(2);
    expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
    expect(result._id.$in[1]).toBeInstanceOf(ObjectId);
    expect(result._id.$in[0].toString()).toBe('507f1f77bcf86cd799439011');
    expect(result._id.$in[1].toString()).toBe('507f1f77bcf86cd799439012');
  });

  it('should keep ObjectIds in _id $in operator', () => {
    const objectId1 = new ObjectId('507f1f77bcf86cd799439011');
    const objectId2 = new ObjectId('507f1f77bcf86cd799439012');
    const queryObject = { 
      _id: { 
        $in: [objectId1, objectId2] 
      } 
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id.$in).toHaveLength(2);
    expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
    expect(result._id.$in[1]).toBeInstanceOf(ObjectId);
    expect(result._id.$in[0]).toBe(objectId1);
    expect(result._id.$in[1]).toBe(objectId2);
  });

  it('should convert string IDs in _id $ne operator', () => {
    const queryObject = { 
      _id: { 
        $ne: '507f1f77bcf86cd799439011' 
      } 
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id.$ne).toBeInstanceOf(ObjectId);
    expect(result._id.$ne.toString()).toBe('507f1f77bcf86cd799439011');
  });

  it('should convert fields ending with "Id" to ObjectId', () => {
    const queryObject = { 
      userId: '507f1f77bcf86cd799439011',
      categoryId: '507f1f77bcf86cd799439012',
      name: 'test' // Should not be converted
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result.userId).toBeInstanceOf(ObjectId);
    expect(result.categoryId).toBeInstanceOf(ObjectId);
    expect(result.name).toBe('test');
    expect(result.userId.toString()).toBe('507f1f77bcf86cd799439011');
    expect(result.categoryId.toString()).toBe('507f1f77bcf86cd799439012');
  });

  it('should recursively convert nested objects', () => {
    const queryObject = { 
      user: {
        _id: '507f1f77bcf86cd799439011',
        profile: {
          organizationId: '507f1f77bcf86cd799439012'
        }
      }
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result.user._id).toBeInstanceOf(ObjectId);
    expect(result.user.profile.organizationId).toBeInstanceOf(ObjectId);
    expect(result.user._id.toString()).toBe('507f1f77bcf86cd799439011');
    expect(result.user.profile.organizationId.toString()).toBe('507f1f77bcf86cd799439012');
  });

  it('should handle mixed string and ObjectId in nested $in operator', () => {
    const objectId1 = new ObjectId('507f1f77bcf86cd799439011');
    const queryObject = { 
      _id: { 
        $in: [objectId1, '507f1f77bcf86cd799439012'] 
      } 
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id.$in).toHaveLength(2);
    expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
    expect(result._id.$in[1]).toBeInstanceOf(ObjectId);
    expect(result._id.$in[0]).toBe(objectId1); // Should keep original ObjectId
    expect(result._id.$in[1].toString()).toBe('507f1f77bcf86cd799439012');
  });

  it('should not convert invalid ObjectId strings', () => {
    const queryObject = { 
      _id: 'invalid-id',
      userId: 'also-invalid'
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id).toBe('invalid-id');
    expect(result.userId).toBe('also-invalid');
  });

  it('should handle empty objects', () => {
    const queryObject = {};
    const result = convertQueryObjectIds(queryObject);
    
    expect(result).toEqual({});
  });

  it('should handle null and undefined', () => {
    expect(convertQueryObjectIds(null)).toBeNull();
    expect(convertQueryObjectIds(undefined)).toBeUndefined();
  });

  it('should handle non-object values', () => {
    expect(convertQueryObjectIds('string')).toBe('string');
    expect(convertQueryObjectIds(123)).toBe(123);
    expect(convertQueryObjectIds(true)).toBe(true);
  });

  it('should preserve Date objects', () => {
    const date = new Date('2024-01-01');
    const queryObject = { 
      createdAt: date,
      _id: '507f1f77bcf86cd799439011'
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt).toBe(date);
    expect(result._id).toBeInstanceOf(ObjectId);
  });

  it('should preserve arrays (non-$in)', () => {
    const queryObject = { 
      tags: ['tag1', 'tag2'],
      _id: '507f1f77bcf86cd799439011'
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result.tags).toEqual(['tag1', 'tag2']);
    expect(result._id).toBeInstanceOf(ObjectId);
  });

  it('should handle complex nested query with multiple operators', () => {
    const objectId = new ObjectId('507f1f77bcf86cd799439011');
    const queryObject = {
      _id: objectId,
      userId: '507f1f77bcf86cd799439012',
      status: { $in: ['active', 'pending'] },
      nested: {
        categoryId: '507f1f77bcf86cd799439013',
        date: new Date('2024-01-01')
      }
    };
    const result = convertQueryObjectIds(queryObject);
    
    expect(result._id).toBeInstanceOf(ObjectId);
    expect(result._id).toBe(objectId);
    expect(result.userId).toBeInstanceOf(ObjectId);
    expect(result.status.$in).toEqual(['active', 'pending']); // Non-ID array should not be converted
    expect(result.nested.categoryId).toBeInstanceOf(ObjectId);
    expect(result.nested.date).toBeInstanceOf(Date);
  });
});

