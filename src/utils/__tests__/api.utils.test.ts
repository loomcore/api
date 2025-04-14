import { describe, it, expect, vi } from 'vitest';
import { apiUtils } from '../api.utils.js';
import { Type } from '@sinclair/typebox';
import { ObjectId } from 'mongodb';
import { entityUtils } from '../entity.utils.js';

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

    it('should encode ObjectIds to strings in API responses', () => {
      // Create a simple schema with an ObjectId
      const TestSchema = Type.Object({
        name: Type.String(),
        refId: Type.Any() // Using Any to allow both ObjectId and string
      });
      
      // Create a model spec 
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an entity with an actual ObjectId
      const objectId = new ObjectId();
      const entity = {
        name: 'Test Entity',
        refId: objectId // This is an actual ObjectId instance
      };
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec
      apiUtils.apiResponse(res, 200, { data: entity }, modelSpec);
      
      // Verify json was called with properly encoded data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.status).toBe(200);
      expect(apiResponseArg.data).toBeDefined();
      
      // Most importantly, verify the ObjectId was encoded to string
      expect(typeof apiResponseArg.data.refId).toBe('string');
      expect(apiResponseArg.data.refId).toBe(objectId.toString());
    });
    
    it('should encode Date objects to ISO strings in API responses', () => {
      // Create a simple schema with a Date
      const TestSchema = Type.Object({
        name: Type.String(),
        eventDate: Type.Any() // Using Any to allow both Date and string
      });
      
      // Create a model spec
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an entity with an actual Date
      const date = new Date();
      const entity = {
        name: 'Test Entity',
        eventDate: date // This is an actual Date instance
      };
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec
      apiUtils.apiResponse(res, 200, { data: entity }, modelSpec);
      
      // Verify json was called with properly encoded data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.status).toBe(200);
      expect(apiResponseArg.data).toBeDefined();
      
      // Most importantly, verify the Date was encoded to string
      expect(typeof apiResponseArg.data.eventDate).toBe('string');
      expect(apiResponseArg.data.eventDate).toBe(date.toISOString());
    });
    
    it('should handle arrays of entities', () => {
      // Create a simple schema
      const TestSchema = Type.Object({
        name: Type.String(),
        refId: Type.Any()
      });
      
      // Create a model spec
      const modelSpec = entityUtils.getModelSpec(TestSchema);
      
      // Create an array of entities with ObjectIds
      const id1 = new ObjectId();
      const id2 = new ObjectId();
      const entities = [
        { name: 'Entity 1', refId: id1 },
        { name: 'Entity 2', refId: id2 }
      ];
      
      // Create mock response
      const res = createMockResponse();
      
      // Call apiResponse with the modelSpec
      apiUtils.apiResponse(res, 200, { data: entities }, modelSpec);
      
      // Verify json was called with properly encoded data
      expect(res.json).toHaveBeenCalled();
      const apiResponseArg = res.json.mock.calls[0][0];
      
      // Verify the response structure
      expect(apiResponseArg.success).toBe(true);
      expect(apiResponseArg.data).toBeInstanceOf(Array);
      expect(apiResponseArg.data.length).toBe(2);
      
      // Verify both items had their ObjectIds converted to strings
      expect(typeof apiResponseArg.data[0].refId).toBe('string');
      expect(apiResponseArg.data[0].refId).toBe(id1.toString());
      expect(typeof apiResponseArg.data[1].refId).toBe('string');
      expect(apiResponseArg.data[1].refId).toBe(id2.toString());
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
      apiUtils.apiResponse(res, 200, { data: entity });
      
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