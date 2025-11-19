import { IUserContext, IQueryOptions, DefaultQueryOptions, IEntity } from '@loomcore/common/models';
import { describe, it, expect, beforeEach } from 'vitest';
import { TenantQueryDecorator, ITenantQueryOptions, DEFAULT_TENANT_OPTIONS } from '../tenant-query-decorator.js';
import { ServerError } from '../../errors/index.js';
import { ObjectId } from 'mongodb';

// Create a simple implementation of IEntity for testing
interface TestEntity extends IEntity {
  name: string;
}

/**
 * @library
 */
describe('TenantQueryDecorator', () => {
  // Test data
  const orgId = 'test-org-123';
  
  // Helper function to create user context with or without orgId
  const createUserContext = (includeOrgId = true): IUserContext => ({
    user: { 
      _id: new ObjectId().toHexString(), 
      email: 'test@example.com',
      password: '',
      _created: new Date(),
      _createdBy: 'system',
      _updated: new Date(),
      _updatedBy: 'system'
    },
    ...(includeOrgId ? { _orgId:orgId } : {})
  });

  const createUserContextWithoutOrgId = () => ({
    user: { 
      _id: new ObjectId().toHexString(), 
      email: 'test@example.com',
      password: '',
      _created: new Date(),
      _createdBy: 'system',
      _updated: new Date(),
      _updatedBy: 'system'
    }
  });
  
  const collectionName = 'testCollection';
  const excludedCollectionName = 'excludedCollection';
  
  describe('constructor', () => {
    it('should use default options when none provided', () => {
      // Arrange & Act
      const decorator = new TenantQueryDecorator();
      
      // Assert - testing private property via the getter
      expect(decorator.getOrgIdField()).toBe(DEFAULT_TENANT_OPTIONS.orgIdField);
    });
    
    it('should use custom options when provided', () => {
      // Arrange
      const customOptions: ITenantQueryOptions = {
        orgIdField: 'customOrgField',
        excludedCollections: ['collection1', 'collection2']
      };
      
      // Act
      const decorator = new TenantQueryDecorator(customOptions);
      
      // Assert
      expect(decorator.getOrgIdField()).toBe('customOrgField');
    });
    
    it('should merge custom options with defaults', () => {
      // Arrange
      const partialOptions: Partial<ITenantQueryOptions> = {
        orgIdField: 'customOrgField'
      };
      
      // Act
      const decorator = new TenantQueryDecorator(partialOptions);
      
      // Assert
      expect(decorator.getOrgIdField()).toBe('customOrgField');
      // Even though we didn't specify excludedCollections, it should exist with default value
      // We can't easily test this directly because options is private
    });
  });
  
  describe('applyTenantToQuery', () => {
    it('should add orgId to query for normal collection', () => {
      // Arrange
      const decorator = new TenantQueryDecorator();
      const query = { filters: { name: { eq: 'Test' } } };
      
      // Act
      const result = decorator.applyTenantToQuery(createUserContext(), query, collectionName);
      
      // Assert
      expect(result).toEqual({
        filters: { name: { eq: 'Test' }, _orgId: { eq: orgId } }
      });
    });
    
    it('should not add orgId to excluded collections', () => {
      // Arrange
      const customOptions: ITenantQueryOptions = {
        excludedCollections: [excludedCollectionName]
      };
      const decorator = new TenantQueryDecorator(customOptions);
      const query = { filters: { name: { eq: 'Test' } } };
      
      // Act
      const result = decorator.applyTenantToQuery(createUserContext(), query, excludedCollectionName);
      
      // Assert - should return original query unchanged
      expect(result).toEqual(query);
    });
    
    it('should use custom orgId field name when specified', () => {
      // Arrange
      const customOptions: ITenantQueryOptions = {
        orgIdField: 'tenantId'
      };
      const decorator = new TenantQueryDecorator(customOptions);
      const query = { filters: { name: { eq: 'Test' } } };
      
      // Act
      const result = decorator.applyTenantToQuery(createUserContext(), query, collectionName);
      
      // Assert
      expect(result).toEqual({
        filters: { name: { eq: 'Test' }, tenantId: { eq: orgId } }
      });
    });
    
    it('should throw ServerError if userContext has no orgId', () => {
      // Arrange
      const decorator = new TenantQueryDecorator();
      const query = { filters: { name: { eq: 'Test' } } };
      
      // Act & Assert
      expect(() => {
        decorator.applyTenantToQuery(createUserContext(false), query, collectionName);
      }).toThrow(ServerError);
    });
  });
  
  describe('applyTenantToQueryOptions', () => {
    it('should add orgId filter to query options', () => {
      // Arrange
      const decorator = new TenantQueryDecorator();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } }
      };

      // Act
      const result = decorator.applyTenantToQueryOptions(createUserContext(), queryOptions, collectionName);

      // Assert
      expect(result.filters).toBeDefined();
      expect(result.filters!['_orgId']).toEqual({ eq: orgId });
      expect(result.filters!['name']).toEqual({ eq: 'Test' });
    });

    it('should not modify query options for excluded collections', () => {
      // Arrange
      const customOptions: ITenantQueryOptions = {
        orgIdField: '_orgId',
        excludedCollections: ['users']
      };
      const decorator = new TenantQueryDecorator(customOptions);
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } }
      };

      // Act
      const result = decorator.applyTenantToQueryOptions(createUserContext(), queryOptions, 'users');

      // Assert
      expect(result.filters).toBeDefined();
      expect(result.filters!['_orgId']).toBeUndefined();
      expect(result.filters!['name']).toEqual({ eq: 'Test' });
    });

    it('should use custom orgId field name when specified', () => {
      // Arrange
      const customOptions: ITenantQueryOptions = {
        orgIdField: 'organizationId'
      };
      const decorator = new TenantQueryDecorator(customOptions);
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions
      };

      // Act
      const result = decorator.applyTenantToQueryOptions(createUserContext(), queryOptions, collectionName);

      // Assert
      expect(result.filters).toBeDefined();
      expect(result.filters!['organizationId']).toEqual({ eq: orgId });
    });

    it('should throw ServerError if userContext has no orgId', () => {
      // Arrange
      const decorator = new TenantQueryDecorator();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions
      };

      // Act & Assert
      expect(() => {
        decorator.applyTenantToQueryOptions(createUserContextWithoutOrgId(), queryOptions, collectionName);
      }).toThrow('userContext must have an _orgId property to apply tenant filtering');
    });

    it('should create filters object if it does not exist', () => {
      // Arrange
      const decorator = new TenantQueryDecorator();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions
      };
      // Note: not setting queryOptions.filters

      // Act
      const result = decorator.applyTenantToQueryOptions(createUserContext(), queryOptions, collectionName);

      // Assert
      expect(result.filters).toBeDefined();
      expect(result.filters!['_orgId']).toEqual({ eq: orgId });
    });
  });
  
  describe('applyTenantToEntity', () => {
    it('should add orgId to entity', () => {
      // Arrange
      const newId = new ObjectId().toHexString();
      const decorator = new TenantQueryDecorator();
      const entity: TestEntity = { _id: newId, name: 'Test Entity' };
      
      // Act
      const result = decorator.applyTenantToEntity(createUserContext(), entity, collectionName);
      
      // Assert
      expect(result).toEqual({
        _id: newId,
        name: 'Test Entity',
        _orgId: orgId
      });
    });
    
    it('should not modify entity for excluded collections', () => {
      // Arrange
      const newId = new ObjectId().toHexString();
      const customOptions: ITenantQueryOptions = {
        excludedCollections: [excludedCollectionName]
      };
      const decorator = new TenantQueryDecorator(customOptions);
      const entity: TestEntity = { _id: newId, name: 'Test Entity' };
      
      // Act
      const result = decorator.applyTenantToEntity(createUserContext(), entity, excludedCollectionName);
      
      // Assert
      expect(result).toEqual(entity);
    });
    
    it('should use custom orgId field name when specified', () => {
      // Arrange
      const newId = new ObjectId().toHexString();
      const customOptions: ITenantQueryOptions = {
        orgIdField: 'tenantId'
      };
      const decorator = new TenantQueryDecorator(customOptions);
      const entity: TestEntity = { _id: newId, name: 'Test Entity' };
      
      // Act
      const result = decorator.applyTenantToEntity(createUserContext(), entity, collectionName);
      
      // Assert
      expect(result).toEqual({
        _id: newId,
        name: 'Test Entity',
        tenantId: orgId
      });
    });
    
    it('should throw ServerError if userContext has no orgId', () => {
      // Arrange
      const newId = new ObjectId().toHexString();
      const decorator = new TenantQueryDecorator();
      const entity: TestEntity = { _id: newId, name: 'Test Entity' };
      
      // Act & Assert
      expect(() => {
        decorator.applyTenantToEntity(createUserContext(false), entity, collectionName);
      }).toThrow(ServerError);
    });
    
    it('should override entity orgId if already exists', () => {
      // Arrange
      const newId = new ObjectId().toHexString();
      const decorator = new TenantQueryDecorator();
      const entity: TestEntity & { _orgId: string } = { 
        _id: newId,
        name: 'Test Entity',
        _orgId: 'old-org-id'
      };
      
      // Act
      const result = decorator.applyTenantToEntity(createUserContext(), entity, collectionName);
      
      // Assert
      expect(result._orgId).toBe(orgId);
    });
  });
  
  describe('getOrgIdField', () => {
    it('should return default orgId field name when not specified', () => {
      // Arrange
      const decorator = new TenantQueryDecorator();
      
      // Act & Assert
      expect(decorator.getOrgIdField()).toBe('_orgId');
    });
    
    it('should return custom orgId field name when specified', () => {
      // Arrange
      const customOptions: ITenantQueryOptions = {
        orgIdField: 'tenantId'
      };
      const decorator = new TenantQueryDecorator(customOptions);
      
      // Act & Assert
      expect(decorator.getOrgIdField()).toBe('tenantId');
    });
  });
}); 