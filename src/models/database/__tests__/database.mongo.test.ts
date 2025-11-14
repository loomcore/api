import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, Collection, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { initializeTypeBox } from '@loomcore/common/validation';

import { MongoDBDatabase } from '../database.mongo.js';
import { Join } from '../../operations/join.js';

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
  let ordersCollection: Collection;
  let customersCollection: Collection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('test-db');
    
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
});

