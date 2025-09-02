import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';
import { Db, ObjectId } from 'mongodb';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils, { CategoryController, ProductsController } from '../../__tests__/common-test.utils.js';

describe('ApiController get (paged) with aggregation - Integration Tests', () => {
  let db: Db;
  let app: Application;
  let testAgent: any;
  let authToken: string;
  let categoryId: ObjectId;
  let productId: ObjectId;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;
    db = testSetup.db;
    testAgent = testSetup.agent;
    authToken = testUtils.getAuthToken();
    
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

    // Insert a category
    const categoryResult = await db.collection('categories').insertOne({ name: 'Test Category' });
    categoryId = categoryResult.insertedId;

    // Insert a product with a sensitive internalNumber
    const productResult = await db.collection('products').insertOne({ 
      name: 'Test Product',
      internalNumber: 'ABC-123-XYZ',
      categoryId: categoryId 
    });
    productId = productResult.insertedId;
  });

  it('should return a paged result of aggregated entities while filtering sensitive fields', async () => {
    // Act
    const response = await testAgent
      .get(`/api/products`)
      .set('Authorization', authToken);
    
    // Assert
    expect(response.status).toBe(200);
    const pagedResult = response.body.data;

    // Assert that the response is a paged result
    expect(pagedResult).toHaveProperty('entities');
    expect(pagedResult).toHaveProperty('total');
    expect(pagedResult.total).toBe(1);
    expect(Array.isArray(pagedResult.entities)).toBe(true);

    // Assert that the entity and the aggregated data are correct
    const product = pagedResult.entities[0];
    expect(product._id).toBe(productId.toHexString());
    expect(product.category).toBeDefined();
    expect(product.category.name).toBe('Test Category');
    // Crucially, assert that the sensitive field has been removed
    expect(product.internalNumber).toBeUndefined();
  });

  it('should return a paged result of single entities when using a service that does not override getAdditionalPipelineStages', async () => {
    // Act
    const response = await testAgent
      .get(`/api/categories`)
      .set('Authorization', authToken);

    // Assert
    expect(response.status).toBe(200);
    const pagedResult = response.body.data;
    
    // Assert that the response is a paged result
    expect(pagedResult).toHaveProperty('entities');
    expect(pagedResult).toHaveProperty('total');
    expect(pagedResult.total).toBe(1);
    expect(Array.isArray(pagedResult.entities)).toBe(true);

    // Assert that the entity data is correct
    const category = pagedResult.entities[0];
    expect(category._id).toBe(categoryId.toHexString());
    expect(category.name).toBe('Test Category');
  });
});
