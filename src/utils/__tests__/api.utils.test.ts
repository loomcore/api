import { describe, it, expect, vi } from 'vitest';
import { Type } from '@sinclair/typebox';
import { ObjectId } from 'mongodb';
import { entityUtils } from '@loomcore/common/utils';
import { TypeboxIsoDate, TypeboxObjectId } from '@loomcore/common/validation';

import { apiUtils } from '../api.utils.js';

describe('apiUtils', () => {
  describe('apiResponse with model encoding', () => {
    // Mock Response object
    const createMockResponse = () => {
      const res = {
        status: vi.fn(),
        json: vi.fn(),
        set: vi.fn()
      };
      res.status.mockReturnValue(res);
      return res;
    };

    it('should encode Date objects to ISO strings in API responses', () => {
      // Create a simple schema with a Date field using TypeboxIsoDate
      const TestSchema = Type.Object({
        name: Type.String(),
        eventDate: TypeboxIsoDate()
      });
      
      // Create a model spec
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an entity with an actual Date
      const date = new Date();
      const entity = {
        name: 'Test Entity',
        eventDate: date
      };
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec
      apiUtils.apiResponse(res as any, 200, { data: entity }, modelSpec);
      
      // Verify json was called with properly encoded data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.status).toBe(200);
      expect(apiResponseArg.data).toBeDefined();
      
      // Most importantly, verify the Date was encoded to string
      expect(typeof apiResponseArg.data.eventDate).toBe('string');
      // Match date format with some flexibility for millisecond precision differences
      expect(apiResponseArg.data.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
    
    it('should properly handle and preserve string IDs in API responses', () => {
      // Create a simple schema with a string ID
      const TestSchema = Type.Object({
        name: Type.String(),
        refId: TypeboxObjectId() // This is a string schema with objectid format
      });
      
      // Create a model spec 
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an entity with a string ID (proper usage according to our schema)
      const idString = new ObjectId().toString(); // Get ID string, not ObjectId instance
      const entity = {
        name: 'Test Entity',
        refId: idString // This is a string, matching our schema
      };
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec
      apiUtils.apiResponse(res as any, 200, { data: entity }, modelSpec);
      
      // Verify json was called with properly preserved data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.status).toBe(200);
      expect(apiResponseArg.data).toBeDefined();
      
      // Verify the ID remained a string and matches the original
      expect(typeof apiResponseArg.data.refId).toBe('string');
      expect(apiResponseArg.data.refId).toBe(idString);
    });
    
    it('should handle string IDs in API responses', () => {
      // Create a simple schema with a string ID
      const TestSchema = Type.Object({
        name: Type.String(),
        refId: Type.String()
      });
      
      // Create a model spec 
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an entity with a string ID
      const idString = new ObjectId().toString();
      const entity = {
        name: 'Test Entity',
        refId: idString
      };
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec - add type assertion to fix TS error
      apiUtils.apiResponse(res as any, 200, { data: entity }, modelSpec);
      
      // Verify json was called with properly encoded data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.status).toBe(200);
      expect(apiResponseArg.data).toBeDefined();
      
      // Verify the ID remained a string
      expect(typeof apiResponseArg.data.refId).toBe('string');
      expect(apiResponseArg.data.refId).toBe(idString);
    });
    
    it('should handle arrays of entities with string IDs', () => {
      // Create a simple schema
      const TestSchema = Type.Object({
        name: Type.String(),
        refId: Type.String()
      });
      
      // Create a model spec
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an array of entities with string IDs
      const id1 = new ObjectId().toString();
      const id2 = new ObjectId().toString();
      const entities = [
        { name: 'Entity 1', refId: id1 },
        { name: 'Entity 2', refId: id2 }
      ];
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec
      apiUtils.apiResponse(res as any, 200, { data: entities }, modelSpec);
      
      // Verify json was called with properly encoded data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.data).toBeInstanceOf(Array);
      expect(apiResponseArg.data.length).toBe(2);
      
      // Verify both items have string IDs
      expect(typeof apiResponseArg.data[0].refId).toBe('string');
      expect(apiResponseArg.data[0].refId).toBe(id1);
      expect(typeof apiResponseArg.data[1].refId).toBe('string');
      expect(apiResponseArg.data[1].refId).toBe(id2);
    });

    it('should work without a modelSpec (backward compatibility)', () => {
      // Create an entity with an ObjectId (which won't be encoded without modelSpec)
      const objectId = new ObjectId();
      const entity = {
        name: 'Test Entity',
        refId: objectId
      };
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse WITHOUT the modelSpec
      apiUtils.apiResponse(res as any, 200, { data: entity });
      
      // Verify json was called
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the data was passed through unchanged
      expect(apiResponseArg.data.refId).toBe(objectId);
      // The ObjectId remains an ObjectId, not a string
      expect(apiResponseArg.data.refId instanceof ObjectId).toBe(true);
    });
  });
}); 