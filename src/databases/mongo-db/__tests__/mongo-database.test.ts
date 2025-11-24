import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, Collection, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IQueryOptions, DefaultQueryOptions, IUserContext } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { initializeTypeBox, TypeboxIsoDate, TypeboxObjectId } from '@loomcore/common/validation';

import { MongoDBDatabase } from '../mongo-db.database.js';
import { Join } from '../../operations/join.operation.js';
import { GenericApiService } from '../../../services/generic-api-service/generic-api.service.js';
import testUtils from '../../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../../__tests__/test-express-app.js';
import { IEntity, IAuditable } from '@loomcore/common/models';
import { BadRequestError, IdNotFoundError } from '../../../errors/index.js';
import { TestEntity, testModelSpec } from '../../../__tests__/index.js';
import { IDatabase } from '../../models/index.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
  initializeTypeBox();
});

// Define test entity interfaces
interface Order {
  _id?: string;
  orderNumber: string;
  customerId: string;
  total: number;
  status: string;
}

interface Customer {
  _id?: string;
  name: string;
  email: string;
}

interface OrderWithCustomer extends Order {
  customer?: Customer;
}

// Create schemas for validation
const OrderSchema = Type.Object({
  orderNumber: Type.String(),
  customerId: Type.String({ format: 'objectid' }),
  total: Type.Number(),
  status: Type.String()
});

const CustomerSchema = Type.Object({
  name: Type.String(),
  email: Type.String()
});

const orderModelSpec = entityUtils.getModelSpec(OrderSchema);
const customerModelSpec = entityUtils.getModelSpec(CustomerSchema);

describe('MongoDBDatabase - Join Operations', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let orderDatabase: MongoDBDatabase;
  let testDatabase: IDatabase;
  let ordersCollection: Collection;
  let customersCollection: Collection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('test-db');
    const testSetup = await TestExpressApp.init();
    testDatabase = testSetup.database;
    orderDatabase = new MongoDBDatabase(db, 'orders');
    ordersCollection = db.collection('orders');
    customersCollection = db.collection('customers');
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
    // Clean up collections before each test
    await ordersCollection.deleteMany({});
    await customersCollection.deleteMany({});
  });

  describe('getAll with join operation', () => {
    it('should join customer data with orders using getAll', async () => {
      // Arrange: Create test customers
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();
      
      await customersCollection.insertMany([
        {
          _id: customer1Id,
          name: 'John Doe',
          email: 'john@example.com'
        },
        {
          _id: customer2Id,
          name: 'Jane Smith',
          email: 'jane@example.com'
        }
      ]);

      // Create test orders
      await ordersCollection.insertMany([
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-001',
          customerId: customer1Id,
          total: 100.50,
          status: 'pending'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-002',
          customerId: customer2Id,
          total: 250.75,
          status: 'completed'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-003',
          customerId: customer1Id,
          total: 75.25,
          status: 'pending'
        }
      ]);

      // Create join operation
      const joinOperation = new Join(
        'customers',
        'customerId',
        '_id',
        'customer'
      );

      // Act
      const results = await orderDatabase.getAll<OrderWithCustomer>([joinOperation]);

      // Assert
      expect(results).toHaveLength(3);
      
      // Verify first order has customer data
      const order1 = results.find(o => o.orderNumber === 'ORD-001');
      expect(order1).toBeDefined();
      expect(order1!.customer).toBeDefined();
      expect(order1!.customer!.name).toBe('John Doe');
      expect(order1!.customer!.email).toBe('john@example.com');
      
      // Verify second order has customer data
      const order2 = results.find(o => o.orderNumber === 'ORD-002');
      expect(order2).toBeDefined();
      expect(order2!.customer).toBeDefined();
      expect(order2!.customer!.name).toBe('Jane Smith');
      expect(order2!.customer!.email).toBe('jane@example.com');
      
      // Verify third order has customer data
      const order3 = results.find(o => o.orderNumber === 'ORD-003');
      expect(order3).toBeDefined();
      expect(order3!.customer).toBeDefined();
      expect(order3!.customer!.name).toBe('John Doe');
    });

    it('should handle orders without matching customers (left outer join)', async () => {
      // Arrange: Create an order with a non-existent customer ID
      const nonExistentCustomerId = new ObjectId();
      
      await ordersCollection.insertOne({
        _id: new ObjectId(),
        orderNumber: 'ORD-004',
        customerId: nonExistentCustomerId,
        total: 50.00,
        status: 'pending'
      });

      // Create join operation
      const joinOperation = new Join(
        'customers',
        'customerId',
        '_id',
        'customer'
      );

      // Act
      const results = await orderDatabase.getAll<OrderWithCustomer>([joinOperation]);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].orderNumber).toBe('ORD-004');
      // Customer should be null or undefined for non-matching join (MongoDB $unwind sets it to undefined)
      expect(results[0].customer).toBeUndefined();
    });

    it('should return all orders when no join operation is provided', async () => {
      // Arrange
      await ordersCollection.insertMany([
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-005',
          customerId: new ObjectId(),
          total: 100.00,
          status: 'pending'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-006',
          customerId: new ObjectId(),
          total: 200.00,
          status: 'completed'
        }
      ]);

      // Act
      const results = await orderDatabase.getAll<Order>([]);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].orderNumber).toBeDefined();
      expect(results[1].orderNumber).toBeDefined();
    });
  });

  describe('get with join operation', () => {
    it('should join customer data with orders using get and return paginated results', async () => {
      // Arrange: Create test customers
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();
      
      await customersCollection.insertMany([
        {
          _id: customer1Id,
          name: 'John Doe',
          email: 'john@example.com'
        },
        {
          _id: customer2Id,
          name: 'Jane Smith',
          email: 'jane@example.com'
        }
      ]);

      // Create test orders
      await ordersCollection.insertMany([
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-101',
          customerId: customer1Id,
          total: 100.50,
          status: 'pending'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-102',
          customerId: customer2Id,
          total: 250.75,
          status: 'completed'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-103',
          customerId: customer1Id,
          total: 75.25,
          status: 'pending'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-104',
          customerId: customer2Id,
          total: 300.00,
          status: 'completed'
        }
      ]);

      // Create join operation
      const joinOperation = new Join(
        'customers',
        'customerId',
        '_id',
        'customer'
      );

      // Create query options with pagination
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        page: 1,
        pageSize: 2,
        orderBy: 'orderNumber',
        sortDirection: 'asc'
      };

      // Act
      const result = await orderDatabase.get<OrderWithCustomer>(
        [joinOperation],
        queryOptions,
        orderModelSpec
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.entities!.length).toBe(2);
      expect(result.total).toBe(4);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      
      // Verify first result has customer data
      expect(result.entities![0].customer).toBeDefined();
      expect(result.entities![0].customer!.name).toBeDefined();
      expect(result.entities![0].customer!.email).toBeDefined();
      
      // Verify orders are sorted by orderNumber
      expect(result.entities![0].orderNumber).toBe('ORD-101');
      expect(result.entities![1].orderNumber).toBe('ORD-102');
    });

    it('should filter orders and join customer data', async () => {
      // Arrange: Create test customers
      const customer1Id = new ObjectId();
      const customer2Id = new ObjectId();
      
      await customersCollection.insertMany([
        {
          _id: customer1Id,
          name: 'John Doe',
          email: 'john@example.com'
        },
        {
          _id: customer2Id,
          name: 'Jane Smith',
          email: 'jane@example.com'
        }
      ]);

      // Create test orders with different statuses
      await ordersCollection.insertMany([
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-201',
          customerId: customer1Id,
          total: 100.50,
          status: 'pending'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-202',
          customerId: customer2Id,
          total: 250.75,
          status: 'completed'
        },
        {
          _id: new ObjectId(),
          orderNumber: 'ORD-203',
          customerId: customer1Id,
          total: 75.25,
          status: 'pending'
        }
      ]);

      // Create join operation
      const joinOperation = new Join(
        'customers',
        'customerId',
        '_id',
        'customer'
      );

      // Create query options with filter
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            eq: 'pending'
          }
        },
        orderBy: 'orderNumber',
        sortDirection: 'asc'
      };

      // Act
      const result = await orderDatabase.get<OrderWithCustomer>(
        [joinOperation],
        queryOptions,
        orderModelSpec
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.entities!.length).toBe(2);
      expect(result.total).toBe(2);
      
      // Verify all results are pending orders
      result.entities!.forEach((order: OrderWithCustomer) => {
        expect(order.status).toBe('pending');
        expect(order.customer).toBeDefined();
      });
      
      // Verify customer data is joined
      const order1 = result.entities!.find((o: OrderWithCustomer) => o.orderNumber === 'ORD-201');
      expect(order1).toBeDefined();
      expect(order1!.customer!.name).toBe('John Doe');
    });

    it('should handle pagination with join operation', async () => {
      // Arrange: Create test customers
      const customer1Id = new ObjectId();
      
      await customersCollection.insertOne({
        _id: customer1Id,
        name: 'John Doe',
        email: 'john@example.com'
      });

      // Create multiple orders
      const orders = [];
      for (let i = 1; i <= 5; i++) {
        orders.push({
          _id: new ObjectId(),
          orderNumber: `ORD-${300 + i}`,
          customerId: customer1Id,
          total: 100 * i,
          status: 'pending'
        });
      }
      await ordersCollection.insertMany(orders);

      // Create join operation
      const joinOperation = new Join(
        'customers',
        'customerId',
        '_id',
        'customer'
      );

      // Test first page
      const queryOptionsPage1: IQueryOptions = {
        ...DefaultQueryOptions,
        page: 1,
        pageSize: 2,
        orderBy: 'orderNumber',
        sortDirection: 'asc'
      };

      // Act
      const resultPage1 = await orderDatabase.get<OrderWithCustomer>(
        [joinOperation],
        queryOptionsPage1,
        orderModelSpec
      );

      // Assert
      expect(resultPage1.entities).toBeDefined();
      expect(resultPage1.entities!.length).toBe(2);
      expect(resultPage1.total).toBe(5);
      expect(resultPage1.page).toBe(1);
      expect(resultPage1.pageSize).toBe(2);
      expect(resultPage1.entities![0].orderNumber).toBe('ORD-301');
      expect(resultPage1.entities![1].orderNumber).toBe('ORD-302');
      
      // Verify customer data is joined on all results
      resultPage1.entities!.forEach((order: OrderWithCustomer) => {
        expect(order.customer).toBeDefined();
        expect(order.customer!.name).toBe('John Doe');
      });

      // Test second page
      const queryOptionsPage2: IQueryOptions = {
        ...DefaultQueryOptions,
        page: 2,
        pageSize: 2,
        orderBy: 'orderNumber',
        sortDirection: 'asc'
      };

      const resultPage2 = await orderDatabase.get<OrderWithCustomer>(
        [joinOperation],
        queryOptionsPage2,
        orderModelSpec
      );

      // Assert
      expect(resultPage2.entities).toBeDefined();
      expect(resultPage2.entities!.length).toBe(2);
      expect(resultPage2.total).toBe(5);
      expect(resultPage2.page).toBe(2);
      expect(resultPage2.entities![0].orderNumber).toBe('ORD-303');
      expect(resultPage2.entities![1].orderNumber).toBe('ORD-304');
    });
  });

  describe('ObjectId Conversion', () => {
    let testUserContext: IUserContext;

    beforeAll(() => {
      testUserContext = testUtils.testUserContext;
    });

    it('should convert string IDs to ObjectIds for database storage', async () => {
      // Arrange
      const ObjectIdSchema = Type.Object({
        name: Type.String({ minLength: 1 }),
        refId: TypeboxObjectId({ title: 'Reference ID' })
      });
      
      const objectIdModelSpec = entityUtils.getModelSpec(ObjectIdSchema, { isAuditable: true });
      const objectIdService = new GenericApiService<any>(
        testDatabase,
        'objectIdToStringTest',
        'objectIdEntity',
        objectIdModelSpec
      );
      
      // Entity with string ID (simulating JSON from API)
      const stringIdEntity = {
        name: 'Entity with string ID reference',
        refId: new ObjectId().toString() // String ID from client
      };
      
      // Act
      const preparedEntity = await objectIdService.preprocessEntity<any>(testUserContext, stringIdEntity, true);
      
      // Assert - prepareDataForDb should convert string IDs to ObjectIds for database storage
      expect(preparedEntity.refId instanceof ObjectId).toBe(true);
      expect(preparedEntity.refId.toString()).toBe(stringIdEntity.refId);
    });
    
    it('should handle nested objects with proper type conversion to database types', async () => {
      // Arrange
      const testDate = new Date();
      const refIdString = testUtils.getRandomId();
      
      const ComplexSchema = Type.Object({
        name: Type.String(),
        nested: Type.Object({
          refId: TypeboxObjectId({ title: 'Reference ID' }),
          timestamp: TypeboxIsoDate({ title: 'Timestamp' }),
          deeplyNested: Type.Object({
            anotherRefId: TypeboxObjectId({ title: 'Another Reference ID' })
          })
        }),
        items: Type.Array(
          Type.Object({
            itemRefId: TypeboxObjectId({ title: 'Item Reference ID' }),
            eventDate: TypeboxIsoDate({ title: 'Event Date' })
          })
        )
      });
      
      const complexModelSpec = entityUtils.getModelSpec(ComplexSchema);
      const complexService = new GenericApiService<any>(
        testDatabase,
        'complexEntities',
        'complexEntity',
        complexModelSpec
      );
      
      // Entity with nested objects containing string IDs and ISO date strings
      const complexJsonEntity = {
        name: 'Complex Entity',
        nested: {
          refId: refIdString,
          timestamp: testDate.toISOString(),
          deeplyNested: {
            anotherRefId: refIdString
          }
        },
        items: [
          { itemRefId: refIdString, eventDate: testDate.toISOString() },
          { itemRefId: testUtils.getRandomId(), eventDate: new Date().toISOString() }
        ]
      };
      
      // Act
      const preparedEntity = await complexService.preprocessEntity<any>(testUserContext, complexJsonEntity, true);
      
      // Assert - prepareEntity should convert string IDs to ObjectIds for database storage
      expect(preparedEntity.nested.refId instanceof ObjectId).toBe(true);
      expect(preparedEntity.nested.deeplyNested.anotherRefId instanceof ObjectId).toBe(true);
      expect(preparedEntity.items[0].itemRefId instanceof ObjectId).toBe(true);
      expect(preparedEntity.items[1].itemRefId instanceof ObjectId).toBe(true);
      
      // Dates should be Date objects
      expect(preparedEntity.nested.timestamp instanceof Date).toBe(true);
      expect(preparedEntity.items[0].eventDate instanceof Date).toBe(true);
      expect(preparedEntity.items[1].eventDate instanceof Date).toBe(true);
      
      // Verify values match original input
      expect(preparedEntity.nested.refId.toString()).toBe(refIdString);
      expect(preparedEntity.nested.timestamp.toISOString()).toBe(testDate.toISOString());
      expect(preparedEntity.nested.deeplyNested.anotherRefId.toString()).toBe(refIdString);
    });
  });

  describe('ObjectId Transformation Tests', () => {
    let service: GenericApiService<TestEntity>;
    let testUserContext: IUserContext;

    beforeAll(async () => {
      const testSetup = await TestExpressApp.init();
      testUserContext = testUtils.testUserContext;
      
      // Create service with auditable model spec
      service = new GenericApiService<TestEntity>(
        testSetup.database,
        'testEntities',
        'testEntity',
        testModelSpec
      );
    });

    afterAll(async () => {
      await TestExpressApp.cleanup();
    });

    beforeEach(async () => {
      await TestExpressApp.clearCollections();
    });

    describe('CRUD Operations - ObjectId Transformation', () => {
      it('should transform entity ID from ObjectId to string when retrieving by ID', async () => {
        // Arrange
        const testEntity: Partial<TestEntity> = {
          name: 'Entity for ID transformation test'
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, testEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Act
        const retrievedEntity = await service.getById(testUserContext, createdEntity._id);
        
        // Assert
        expect(retrievedEntity).toBeDefined();
        expect(retrievedEntity._id).toBeDefined();
        // ID should be a string (transformed from ObjectId)
        expect(typeof retrievedEntity._id).toBe('string');
        expect(retrievedEntity._id).toBe(createdEntity._id);
      });
    });

    describe('Error Handling - ObjectId Validation', () => {
      it('should throw BadRequestError when getById is called with invalid ObjectId', async () => {
        // Arrange
        const invalidId = 'invalid-object-id';
        
        // Act & Assert
        await expect(
          service.getById(testUserContext, invalidId)
        ).rejects.toThrow(BadRequestError);
      });

      it('should throw IdNotFoundError when getById is called with non-existent ID', async () => {
        // Arrange
        const nonExistentId = new ObjectId().toString();
        
        // Act & Assert
        await expect(
          service.getById(testUserContext, nonExistentId)
        ).rejects.toThrow(IdNotFoundError);
      });
    });

    describe('Batch Update Operations - ObjectId Transformation', () => {
      it('should transform entity IDs from ObjectId to string in batch update results', async () => {
        // Arrange
        
        // Create initial entity
        const testEntity: Partial<TestEntity> = {
          name: 'Entity for ID transformation test'
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, testEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Prepare update
        const updateEntity: Partial<TestEntity> = {
          _id: createdEntity._id,
          description: 'Updated description'
        };
        
        // Act
        const updatedEntities = await service.batchUpdate(testUserContext, [updateEntity]);
        
        // Assert
        expect(updatedEntities).toHaveLength(1);
        expect(updatedEntities[0]._id).toBeDefined();
        expect(typeof updatedEntities[0]._id).toBe('string');
        expect(updatedEntities[0]._id).toBe(createdEntity._id);
      });
    });

    describe('Full Update Operations - ObjectId Transformation', () => {
      it('should throw BadRequestError when fullUpdateById is called with invalid ObjectId', async () => {
        // Arrange
        const invalidId = 'invalid-object-id';
        const updateEntity: TestEntity = {
          name: 'Updated Name'
        } as TestEntity;
        
        // Act & Assert
        await expect(
          service.fullUpdateById(testUserContext, invalidId, updateEntity)
        ).rejects.toThrow(BadRequestError);
      });

      it('should throw IdNotFoundError when fullUpdateById is called with non-existent ID', async () => {
        // Arrange
        const nonExistentId = new ObjectId().toString();
        const updateEntity: TestEntity = {
          name: 'Updated Name'
        } as TestEntity;
        
        const preparedUpdate = await service.preprocessEntity(testUserContext, updateEntity, false);
        
        // Act & Assert
        await expect(
          service.fullUpdateById(testUserContext, nonExistentId, preparedUpdate as TestEntity)
        ).rejects.toThrow(IdNotFoundError);
      });

      it('should transform entity ID from ObjectId to string in full update result', async () => {
        // Arrange
        const initialEntity: Partial<TestEntity> = {
          name: 'Entity for ID transformation test'
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, initialEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Act
        const updateEntity: TestEntity = {
          name: 'Updated Name'
        } as TestEntity;
        
        const preparedUpdate = await service.preprocessEntity(testUserContext, updateEntity, false);
        const updatedEntity = await service.fullUpdateById(
          testUserContext,
          createdEntity._id,
          preparedUpdate as TestEntity
        );
        
        // Assert
        expect(updatedEntity._id).toBeDefined();
        expect(typeof updatedEntity._id).toBe('string');
        expect(updatedEntity._id).toBe(createdEntity._id);
      });
    });

    describe('Partial Update Operations - ObjectId Transformation', () => {
      it('should throw BadRequestError when partialUpdateById is called with invalid ObjectId', async () => {
        // Arrange
        const invalidId = 'invalid-object-id';
        const updateEntity: Partial<TestEntity> = {
          name: 'Updated Name'
        };
        
        // Act & Assert
        await expect(
          service.partialUpdateById(testUserContext, invalidId, updateEntity)
        ).rejects.toThrow(BadRequestError);
      });

      it('should throw IdNotFoundError when partialUpdateById is called with non-existent ID', async () => {
        // Arrange
        const nonExistentId = new ObjectId().toString();
        const updateEntity: Partial<TestEntity> = {
          name: 'Updated Name'
        };
        
        const preparedUpdate = await service.preprocessEntity(testUserContext, updateEntity, false);
        
        // Act & Assert
        await expect(
          service.partialUpdateById(testUserContext, nonExistentId, preparedUpdate)
        ).rejects.toThrow(IdNotFoundError);
      });

      it('should transform entity ID from ObjectId to string in partial update result', async () => {
        // Arrange
        const initialEntity: Partial<TestEntity> = {
          name: 'Entity for ID transformation test'
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, initialEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Act
        const updateEntity: Partial<TestEntity> = {
          description: 'Updated description'
        };
        
        const preparedUpdate = await service.preprocessEntity(testUserContext, updateEntity, false);
        const updatedEntity = await service.partialUpdateById(
          testUserContext,
          createdEntity._id,
          preparedUpdate
        );
        
        // Assert
        expect(updatedEntity._id).toBeDefined();
        expect(typeof updatedEntity._id).toBe('string');
        expect(updatedEntity._id).toBe(createdEntity._id);
      });
    });

    describe('Partial Update Without Before And After - ObjectId Transformation', () => {
      it('should throw BadRequestError when partialUpdateByIdWithoutBeforeAndAfter is called with invalid ObjectId', async () => {
        // Arrange
        const invalidId = 'invalid-object-id';
        const updateEntity: TestEntity = {
          name: 'Updated Name'
        } as TestEntity;
        
        // Act & Assert
        await expect(
          service.partialUpdateByIdWithoutBeforeAndAfter(testUserContext, invalidId, updateEntity)
        ).rejects.toThrow(BadRequestError);
      });

      it('should transform entity ID from ObjectId to string in partialUpdateByIdWithoutBeforeAndAfter result', async () => {
        // Arrange
        const initialEntity: Partial<TestEntity> = {
          name: 'Entity for ID transformation test'
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, initialEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Act
        const updateEntity: TestEntity = {
          description: 'Updated description'
        } as TestEntity;
        
        const preparedUpdate = await service.preprocessEntity(testUserContext, updateEntity, false);
        const updatedEntity = await service.partialUpdateByIdWithoutBeforeAndAfter(
          testUserContext,
          createdEntity._id,
          preparedUpdate as TestEntity
        );
        
        // Assert
        expect(updatedEntity._id).toBeDefined();
        expect(typeof updatedEntity._id).toBe('string');
        expect(updatedEntity._id).toBe(createdEntity._id);
      });
    });

    describe('Update Operations - ObjectId Transformation', () => {
      it('should transform entity IDs from ObjectId to string in update results', async () => {
        // Arrange
        const initialEntities: Partial<TestEntity>[] = [
          { name: 'Entity 1', isActive: true },
          { name: 'Entity 2', isActive: true }
        ];
        
        const preparedEntities = await service.preprocessEntities(testUserContext, initialEntities, true);
        const createdEntities = await service.createMany(testUserContext, preparedEntities as TestEntity[]);
        
        // Act
        const updateEntity: Partial<TestEntity> = {
          description: 'Updated'
        };
        
        const preparedUpdate = await service.preprocessEntity(testUserContext, updateEntity, false);
        const queryObject = { isActive: true };
        const updatedEntities = await service.update(testUserContext, queryObject, preparedUpdate);
        
        // Assert
        expect(updatedEntities).toHaveLength(2);
        updatedEntities.forEach(entity => {
          expect(entity._id).toBeDefined();
          expect(typeof entity._id).toBe('string');
        });
      });
    });

    describe('Delete Operations - ObjectId Transformation', () => {
      it('should throw BadRequestError when deleteById is called with invalid ObjectId', async () => {
        // Arrange
        const invalidId = 'invalid-object-id';
        
        // Act & Assert
        await expect(
          service.deleteById(testUserContext, invalidId)
        ).rejects.toThrow(BadRequestError);
      });

      it('should throw IdNotFoundError when deleteById is called with non-existent ID', async () => {
        // Arrange
        const nonExistentId = new ObjectId().toString();
        
        // Act & Assert
        await expect(
          service.deleteById(testUserContext, nonExistentId)
        ).rejects.toThrow(IdNotFoundError);
      });

      it('should handle delete operation with valid ObjectId string', async () => {
        // Arrange
        const testEntity: Partial<TestEntity> = {
          name: 'Entity for delete test'
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, testEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Verify ID is a string
        expect(typeof createdEntity._id).toBe('string');
        
        // Act
        const deleteResult = await service.deleteById(testUserContext, createdEntity._id);
        
        // Assert
        expect(deleteResult.count).toBe(1);
        expect(deleteResult.success).toBe(true);
      });
    });

    describe('Find Operations - ObjectId Transformation', () => {
      it('should transform entity IDs from ObjectId to string in find results', async () => {
        // Arrange
        const testEntities: Partial<TestEntity>[] = [
          { name: 'Entity 1', isActive: true },
          { name: 'Entity 2', isActive: true }
        ];
        
        const preparedEntities = await service.preprocessEntities(testUserContext, testEntities, true);
        await service.createMany(testUserContext, preparedEntities as TestEntity[]);
        
        // Act
        const queryObject: IQueryOptions = { filters: { isActive: { eq: true } } };
        const foundEntities = await service.find(testUserContext, queryObject);
        
        // Assert
        expect(foundEntities).toHaveLength(2);
        foundEntities.forEach(entity => {
          expect(entity._id).toBeDefined();
          expect(typeof entity._id).toBe('string');
        });
      });
    });

    describe('FindOne Operations - ObjectId Transformation', () => {
      it('should transform entity ID from ObjectId to string in findOne result', async () => {
        // Arrange
        const testEntity: Partial<TestEntity> = {
          name: 'Entity 1',
          isActive: true
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, testEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Act
        const queryObject: IQueryOptions = { filters: { _id: { eq: createdEntity._id } } };
        const foundEntity = await service.findOne(testUserContext, queryObject);
        
        // Assert
        expect(foundEntity?._id).toBeDefined();
        expect(typeof foundEntity?._id).toBe('string');
        expect(foundEntity?._id).toBe(createdEntity._id);
      });

      it('should find one entity by _id using string ID', async () => {
        // Arrange
        const testEntity: Partial<TestEntity> = {
          name: 'Entity to find',
          isActive: true
        };
        
        const preparedEntity = await service.preprocessEntity(testUserContext, testEntity, true);
        const createdEntity = await service.create(testUserContext, preparedEntity);
        
        if (!createdEntity || !createdEntity._id) {
          throw new Error('Entity not created or missing ID');
        }
        
        // Act - Find by _id using string (should be converted to ObjectId)
        const queryObject: IQueryOptions = { filters: { _id: { eq: createdEntity._id } } };
        const foundEntity = await service.findOne(testUserContext, queryObject);
        
        // Assert
        expect(foundEntity).toBeDefined();
        expect(foundEntity?._id).toBe(createdEntity._id);
        expect(foundEntity?.name).toBe('Entity to find');
      });
    });
  });
});

