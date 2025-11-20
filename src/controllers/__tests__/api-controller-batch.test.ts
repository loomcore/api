import { describe, it, beforeAll, afterAll, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils, { IProduct, ICategory, ProductsController, CategoryController, MultiTenantProductsController, ProductSpec, CategorySpec } from '../../__tests__/common-test.utils.js';
import { GenericApiService } from '../../services/generic-api-service/generic-api.service.js';
import { EmptyUserContext } from '@loomcore/common/models';

describe('ApiController Batch Update', () => {
  let app: Application;
  let agent: supertest.SuperTest<supertest.Test>;
  let authorizationHeader: string;
  let productService: GenericApiService<IProduct>;
  let categoryService: GenericApiService<ICategory>;
  let productIds: string[];
  let categoryId: string;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init('test-app');
    app = testSetup.app;
    agent = testSetup.agent;
    authorizationHeader = testUtils.getAuthToken();

    // Instantiate controllers to map routes
    new ProductsController(app, testSetup.database);
    new CategoryController(app, testSetup.database);
    new MultiTenantProductsController(app, testSetup.database);

    productService = new GenericApiService<IProduct>(testSetup.database, "products", "product", ProductSpec);
    categoryService = new GenericApiService<ICategory>(testSetup.database, "categories", "category", CategorySpec);

    await TestExpressApp.setupErrorHandling();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    // 1. Arrange: Create initial products using services
    const categoryResult = await categoryService.create(EmptyUserContext, { name: 'Test Category' });
    if (!categoryResult) throw new Error("category creation failed");
    categoryId = categoryResult._id;

    // Create products using services
    const productA = await productService.create(EmptyUserContext, { 
      name: 'Product A', 
      description: 'Description A', 
      categoryId: categoryId 
    });
    if (!productA) throw new Error("product A creation failed");

    const productB = await productService.create(EmptyUserContext, { 
      name: 'Product B', 
      description: 'Description B', 
      categoryId: categoryId 
    });
    if (!productB) throw new Error("product B creation failed");

    const productC = await productService.create(EmptyUserContext, { 
      name: 'Product C', 
      description: 'Description C', 
      categoryId: categoryId 
    });
    if (!productC) throw new Error("product C creation failed");

    productIds = [productA._id, productB._id, productC._id];
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
    
    // Verify directly from service
    const productAFromDb = await productService.getById(EmptyUserContext, productIds[0]);
    expect(productAFromDb.name).toBe('Product A Updated');

    const productBFromDb = await productService.getById(EmptyUserContext, productIds[1]);
    expect(productBFromDb.description).toBe('Description B Updated');
  });

  it('should partially update multiple products for a multi-tenant service', async () => {
    // 2. Act: Define the batch update payload and send the request
    const batchUpdatePayload = [
      { _id: productIds[0], name: 'Product A Updated' },
      { _id: productIds[1], description: 'Description B Updated' },
      { _id: productIds[2], name: 'Product C Updated', description: 'Description C also Updated' },
    ];

    const response = await agent
      .patch('/api/multi-tenant-products/batch')
      .set('Authorization', authorizationHeader)
      .send(batchUpdatePayload);

    // 3. Assert: Check the response and the database state
    expect(response.status).toBe(200);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBe(3);

    const updatedProductA = response.body.data.find((p: IProduct) => p._id === productIds[0]);
    expect(updatedProductA!.name).toBe('Product A Updated');

    // Verify directly from service
    const productAFromDb = await productService.getById(EmptyUserContext, productIds[0]);
    expect(productAFromDb.name).toBe('Product A Updated');
  });
});
