import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { entityUtils } from '../entity.utils.js';
import { EntitySchema, AuditableSchema } from '../../models/index.js';
import { ObjectId } from 'mongodb';
import { Value } from '@sinclair/typebox/value';

describe('entityUtils', () => {
  describe('encode', () => {
    // Define a test schema
    const TestSchema = Type.Object({
      name: Type.String(),
      age: Type.Optional(Type.Number()),
      email: Type.Optional(Type.String({ format: 'email' })),
      tags: Type.Optional(Type.Array(Type.String()))
    });
    
    // Create a model spec with the encode method
    const testSpec = entityUtils.getModelSpec(TestSchema, { isAuditable: true });
    
    it('should remove properties not defined in the schema', () => {
      // Arrange
      const entityWithExtraProps = {
        name: 'Test Entity',
        age: 30,
        // Properties not in the schema
        extraProperty: 'This should be removed',
        anotherExtraProperty: 42,
        nestedExtraProperty: { foo: 'bar', baz: 123 }
      };
      
      // Act
      const encodedEntity = testSpec.encode(entityWithExtraProps);
      
      // Assert
      expect(encodedEntity).toBeDefined();
      expect(encodedEntity.name).toBe('Test Entity');
      expect(encodedEntity.age).toBe(30);
      
      // Extra properties should be removed
      expect((encodedEntity as any).extraProperty).toBeUndefined();
      expect((encodedEntity as any).anotherExtraProperty).toBeUndefined();
      expect((encodedEntity as any).nestedExtraProperty).toBeUndefined();
    });
    
    it('should convert ObjectId instances to strings', () => {
      // Create an entity with an ObjectId
      const originalId = new ObjectId();
      const entity = { 
        _id: originalId,
        name: 'Test with ObjectId' 
      };
      
      // Encode the entity using the model spec
      const encodedEntity = testSpec.encode(entity);
      
      // Assert that the _id field is now a string representation of the ObjectId
      expect(encodedEntity._id).toBeDefined();
      expect(typeof encodedEntity._id).toBe('string');
      expect(encodedEntity._id).toBe(originalId.toString());
    });
    
    it('should preserve system properties from the EntitySchema', () => {
      // Arrange
      const entityWithSystemProps = {
        name: 'System Props Test',
        // System properties from EntitySchema
        _id: '507f1f77bcf86cd799439011',
        // Extra property not in schema
        notInSchema: 'should be removed'
      };
      
      // Act
      const encodedEntity = testSpec.encode(entityWithSystemProps);
      
      // Assert
      expect(encodedEntity).toBeDefined();
      expect(encodedEntity.name).toBe('System Props Test');
      expect(encodedEntity._id).toBeDefined();
      expect(typeof encodedEntity._id).toBe('string');
      
      // Extra property should be removed
      expect((encodedEntity as any).notInSchema).toBeUndefined();
    });
    
    it('should convert Date objects to strings', () => {
      // Arrange
      const now = new Date();
      const entityWithAuditProps = {
        name: 'Audit Props Test',
        // Audit properties from AuditableSchema
        _created: now,
        _createdBy: 'test-user',
        _updated: now,
        _updatedBy: 'test-user',
        // Extra property not in schema
        extraProp: 'should be removed'
      };
      
      // Act
      const encodedEntity = testSpec.encode(entityWithAuditProps);
      
      // Assert
      expect(encodedEntity).toBeDefined();
      expect(encodedEntity.name).toBe('Audit Props Test');
      expect(typeof encodedEntity._created).toBe('string');
      expect(encodedEntity._created).toBe(now.toISOString());
      expect(encodedEntity._createdBy).toBe('test-user');
      expect(typeof encodedEntity._updated).toBe('string');
      expect(encodedEntity._updated).toBe(now.toISOString());
      expect(encodedEntity._updatedBy).toBe('test-user');
      
      // Extra property should be removed
      expect((encodedEntity as any).extraProp).toBeUndefined();
    });
    
    it('should handle arrays and nested objects correctly', () => {
      // Arrange
      const entityWithArrays = {
        name: 'Array Test',
        tags: ['tag1', 'tag2', 'tag3'],
        // Each item in the array has extra properties
        complexArray: [
          { validProp: 'value', extraProp: 'should be removed' },
          { anotherExtraProp: 'also removed' }
        ],
        // Extra property not in schema
        extraArray: [1, 2, 3]
      };
      
      // Act
      const encodedEntity = testSpec.encode(entityWithArrays);
      
      // Assert
      expect(encodedEntity).toBeDefined();
      expect(encodedEntity.name).toBe('Array Test');
      expect(encodedEntity.tags).toEqual(['tag1', 'tag2', 'tag3']);
      
      // Extra properties should be removed
      expect((encodedEntity as any).complexArray).toBeUndefined();
      expect((encodedEntity as any).extraArray).toBeUndefined();
    });
    
    it('should handle null values gracefully', () => {
      // Act
      const encodedNull = testSpec.encode(null);
      
      // Assert
      expect(encodedNull).toBeNull();
    });
    
    it('should handle undefined values gracefully', () => {
      // Act
      const encodedUndefined = testSpec.encode(undefined);
      
      // Assert
      expect(encodedUndefined).toBeUndefined();
    });
  });
  
  describe('decode', () => {
    // Define a test schema
    const TestSchema = Type.Object({
      name: Type.String(),
      age: Type.Optional(Type.Number()),
      email: Type.Optional(Type.String({ format: 'email' })),
      tags: Type.Optional(Type.Array(Type.String()))
    });
    
    // Create a model spec with the decode method
    const testSpec = entityUtils.getModelSpec(TestSchema, { isAuditable: true });
    
    it('should convert string IDs to ObjectId instances', () => {
      // Create an entity with a string ID
      const idString = '507f1f77bcf86cd799439011';
      const entity = { 
        _id: idString,
        name: 'Test with string ID' 
      };
      
      // Decode the entity using the model spec
      const decodedEntity = testSpec.decode(entity);
      
      // Assert that the _id field is now an ObjectId
      expect(decodedEntity._id).toBeDefined();
      expect((decodedEntity._id as any) instanceof ObjectId).toBe(true);
      expect((decodedEntity._id as any).toString()).toBe(idString);
    });
    
    it('should convert string dates to Date objects', () => {
      // Arrange
      const nowIsoString = new Date().toISOString();
      const entityWithAuditProps = {
        name: 'Audit Props Test',
        _created: nowIsoString,
        _createdBy: 'test-user',
        _updated: nowIsoString,
        _updatedBy: 'test-user'
      };
      
      // Act
      const decodedEntity = testSpec.decode(entityWithAuditProps);
      
      // Assert
      expect(decodedEntity).toBeDefined();
      expect(decodedEntity.name).toBe('Audit Props Test');
      expect((decodedEntity._created as any) instanceof Date).toBe(true);
      expect((decodedEntity._created as any).toISOString()).toBe(nowIsoString);
      expect(decodedEntity._createdBy).toBe('test-user');
      expect((decodedEntity._updated as any) instanceof Date).toBe(true);
      expect((decodedEntity._updated as any).toISOString()).toBe(nowIsoString);
      expect(decodedEntity._updatedBy).toBe('test-user');
    });
    
    it('should remove properties not defined in the schema', () => {
      // Arrange
      const entityWithExtraProps = {
        name: 'Test Entity',
        age: 30,
        // Properties not in the schema
        extraProperty: 'This should be removed',
        anotherExtraProperty: 42
      };
      
      // Act
      const decodedEntity = testSpec.decode(entityWithExtraProps);
      
      // Assert
      expect(decodedEntity).toBeDefined();
      expect(decodedEntity.name).toBe('Test Entity');
      expect(decodedEntity.age).toBe(30);
      
      // Extra properties should be removed
      expect((decodedEntity as any).extraProperty).toBeUndefined();
      expect((decodedEntity as any).anotherExtraProperty).toBeUndefined();
    });
    
    it('should handle null values gracefully', () => {
      // Act
      const decodedNull = testSpec.decode(null);
      
      // Assert
      expect(decodedNull).toBeNull();
    });
    
    it('should handle undefined values gracefully', () => {
      // Act
      const decodedUndefined = testSpec.decode(undefined);
      
      // Assert
      expect(decodedUndefined).toBeUndefined();
    });
  });
}); 