import { describe, it, beforeAll, afterAll, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { Db, ObjectId } from 'mongodb';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils, { IProduct, ProductsController, CategoryController } from '../../__tests__/common-test.utils.js';

describe('ApiController Batch Update', () => {
  let app: Application;
  let agent: supertest.SuperTest<supertest.Test>;
  let authorizationHeader: string;
  let db: Db;
  let productIds: string[];
  let insertedProductObjectIds: ObjectId[];

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;
    db = testSetup.db;
    agent = testSetup.agent;
    authorizationHeader = testUtils.getAuthToken();

    // Instantiate controllers to map routes
    new ProductsController(app, db);
    new CategoryController(app, db);

    await TestExpressApp.setupErrorHandling();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    // 1. Arrange: Create initial products
    const productsCollection = db.collection('products');
    const categoryCollection = db.collection('categories');

    const categoryResult = await categoryCollection.insertOne({ name: 'Test Category' });
    const categoryId = categoryResult.insertedId;

    const initialProducts = [
      { name: 'Product A', description: 'Description A', categoryId },
      { name: 'Product B', description: 'Description B', categoryId },
      { name: 'Product C', description: 'Description C', categoryId },
    ];
    const insertResult = await productsCollection.insertMany(initialProducts);
    insertedProductObjectIds = Object.values(insertResult.insertedIds);
    productIds = insertedProductObjectIds.map(id => id.toString());
  });

  it('should partially update multiple products in a single batch request', async () => {
    // 2. Act: Define the batch update payload and send the request
    const batchUpdatePayload = [
      { _id: productIds[0], name: 'Product A Updated' }, // Update name
      { _id: productIds[1], description: 'Description B Updated' }, // Update description
      { _id: productIds[2], name: 'Product C Updated', description: 'Description C also Updated' }, // Update both
    ];

    const response = await agent
      .patch('/api/products/batch')
      .set('Authorization', authorizationHeader)
      .send(batchUpdatePayload);

    // 3. Assert: Check the response and the database state
    expect(response.status).toBe(200);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBe(3);

    // Check the returned data
    const updatedProductA = response.body.data.find((p: any) => p._id === productIds[0]);
    expect(updatedProductA.name).toBe('Product A Updated');
    expect(updatedProductA.description).toBe('Description A'); // Should be unchanged

    const updatedProductB = response.body.data.find((p: any) => p._id === productIds[1]);
    expect(updatedProductB.name).toBe('Product B'); // Should be unchanged
    expect(updatedProductB.description).toBe('Description B Updated');

    const updatedProductC = response.body.data.find((p: any) => p._id === productIds[2]);
    expect(updatedProductC.name).toBe('Product C Updated');
    expect(updatedProductC.description).toBe('Description C also Updated');
    
    // Verify directly from DB
    const productsCollection = db.collection('products');
    const productAFromDb = await productsCollection.findOne({ _id: insertedProductObjectIds[0] });
    expect(productAFromDb!.name).toBe('Product A Updated');

    const productBFromDb = await productsCollection.findOne({ _id: insertedProductObjectIds[1] });
    expect(productBFromDb!.description).toBe('Description B Updated');
  });
});
