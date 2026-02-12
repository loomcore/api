import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { CategoryController } from '../../__tests__/common-test.utils.js';
import { ICategory } from '../../__tests__/models/category.model.js';
import { IProduct } from '../../__tests__/models/product.model.js';
import { ProductsController } from '../../__tests__/common-test.utils.js';
import { ProductSpec } from '../../__tests__/models/product.model.js';
import { CategorySpec } from '../../__tests__/models/category.model.js';
import { GenericApiService } from '../../services/generic-api-service/generic-api.service.js';
import { EmptyUserContext } from '@loomcore/common/models';
import { AppIdType } from '@loomcore/common/types';

describe('ApiController get (paged) with aggregation - Integration Tests', () => {
  let app: Application;
  let productService: GenericApiService<IProduct>;
  let categoryService: GenericApiService<ICategory>;
  let testAgent: any;
  let authToken: string;
  let categoryId: AppIdType;
  let productId: AppIdType;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;

    testAgent = testSetup.agent;
    authToken = testUtils.getAuthToken();

    // Instantiate controllers to map routes
    new ProductsController(app, testSetup.database);
    new CategoryController(app, testSetup.database);

    productService = new GenericApiService<IProduct>(testSetup.database, "products", "product", ProductSpec);
    categoryService = new GenericApiService<ICategory>(testSetup.database, "categories", "category", CategorySpec);

    await TestExpressApp.setupErrorHandling();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    // Insert a category
    const categoryResult = await categoryService.create(EmptyUserContext, { name: 'Test Category' });
    if (!categoryResult) throw new Error("category creation failed");
    categoryId = categoryResult._id;

    // Insert a product with a sensitive internalNumber
    const productResult = await productService.create(EmptyUserContext, {
      name: 'Test Product',
      internalNumber: 'ABC-123-XYZ',
      categoryId: categoryId
    });

    if (!productResult) throw new Error("product creation failed");
    productId = productResult._id;
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
    expect(product._id).toBe(productId);
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
    expect(category._id).toBe(categoryId);
    expect(category.name).toBe('Test Category');
  });
});
