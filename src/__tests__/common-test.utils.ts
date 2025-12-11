import { Request, Response, Application } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUser, IUserContext, IEntity, IAuditable, IQueryOptions, IOrganization, getSystemUserContext } from '@loomcore/common/models';
import { Type } from '@sinclair/typebox';

import { JwtService } from '../services/jwt.service.js';
import { ApiController } from '../controllers/api.controller.js';
import { MultiTenantApiService } from '../services/multi-tenant-api.service.js';
import { Operation } from '../databases/operations/operation.js';
import { Join } from '../databases/operations/join.operation.js';
import { OrganizationService } from '../services/organization.service.js';
import { IdNotFoundError } from '../errors/index.js';
import { AuthService, GenericApiService } from '../services/index.js';
import { ObjectId } from 'mongodb';
import { IDatabase } from '../databases/models/index.js';
import { getTestMetaOrg, getTestOrg, getTestMetaOrgUser, getTestMetaOrgUserContext } from './test-objects.js';
import { CategorySpec, ICategory } from './models/category.model.js';
import { IProduct, ProductSpec } from './models/product.model.js';

let deviceIdCookie: string;
let authService: AuthService;
let organizationService: OrganizationService;

const JWT_SECRET = 'test-secret';
const newUser1Email = 'one@test.com';
const newUser1Password = 'testone';
const constDeviceIdCookie = crypto.randomBytes(16).toString('hex'); // Generate a consistent device ID for tests

function initialize(database: IDatabase) {
  authService = new AuthService(database);
  organizationService = new OrganizationService(database);
  deviceIdCookie = constDeviceIdCookie;
}

function getRandomId(): string {
  // This satisfies MongoDB and Postgres shouldn't really care what the id is. 
  return new ObjectId().toString();
}

async function createMetaOrg() {
  if (!organizationService) {
    throw new Error('OrganizationService not initialized. Call initialize() first.');
  }
  try {
    // Create a meta organization (required for system user context)
    const existingMetaOrg = await organizationService.getMetaOrg(getTestMetaOrgUserContext());
    if (!existingMetaOrg) {
      const metaOrgInsertResult = await organizationService.create(getTestMetaOrgUserContext(), getTestMetaOrg());
    }
  }
  catch (error: any) {
    console.log('Error in createMetaOrg:', error);
    throw error;
  }
}

async function deleteMetaOrg() {
  if (!organizationService) {
    return Promise.resolve();
  }

  try {
    await organizationService.deleteMany(getTestMetaOrgUserContext(), { filters: { isMetaOrg: { eq: true } } });
  }
  catch (error: any) {
    console.log('Error deleting meta org:', error);
    // Don't throw - cleanup should be non-blocking
  }
}

async function setupTestUser(): Promise<IUser> {
  try {
    // Clean up any existing test data, then create fresh test user
    await deleteTestUser();
    return createTestUser();
  }
  catch (error: any) {
    console.log(error);
    throw error;
  }
}

async function createTestUser(): Promise<IUser> {
  if (!authService || !organizationService) {
    throw new Error('Database not initialized. Call initialize() first.');
  }

  try {
    const existingMetaOrg = await organizationService.getMetaOrg(getTestMetaOrgUserContext());

    if (!existingMetaOrg) {
      await organizationService.create(getTestMetaOrgUserContext(), getTestMetaOrg());
    }

    const existingTestOrg = await organizationService.findOne(getTestMetaOrgUserContext(), { filters: { _id: { eq: getTestOrg()._id } } });

    if (!existingTestOrg) {
      await organizationService.create(getTestMetaOrgUserContext(), getTestOrg());
    }

    const createdUser = await authService.createUser(getTestMetaOrgUserContext(), getTestMetaOrgUser());

    if (!createdUser) {
      throw new Error('Failed to create test user');
    }

    return createdUser;
  }
  catch (error: any) {
    console.log('Error in createTestUser:', error);
    throw error;
  }
}

async function deleteTestUser() {
  // Delete test user
  await authService.deleteById(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id).catch((error: any) => {
    // Ignore errors during cleanup - entity may not exist
    return null;
  });

  // Delete test organization (regular org only, not meta)
  await organizationService.deleteById(getTestMetaOrgUserContext(), getTestOrg()._id).catch((error: any) => {
    // Ignore errors during cleanup - entity may not exist
    return null;
  });
}

/**
 * Simulates a login with the test user by directly calling AuthService.attemptLogin
 * This doesn't require controllers or API endpoints to be set up
 * @returns Authorization header value with Bearer token
 */
async function simulateloginWithTestUser() {
  // Create a simple mock request with cookies
  const req: any = {
    cookies: {}
  };

  // Use existing deviceId cookie if available
  if (deviceIdCookie) {
    req.cookies['deviceId'] = deviceIdCookie;
  }

  // Create a simple mock response that captures cookies
  const res: any = {
    cookie: function (name: string, value: string) {
      if (name === 'deviceId') {
        deviceIdCookie = value;
      }
      return res;
    }
  };

  // Call authService.attemptLogin directly
  const loginResponse = await authService.attemptLogin(
    req as Request,
    res as Response,
    getTestMetaOrgUser().email,
    getTestMetaOrgUser().password
  );

  // Make sure we got a valid response
  if (!loginResponse?.tokens?.accessToken) {
    throw new Error('Failed to login with test user');
  }

  return `Bearer ${loginResponse.tokens.accessToken}`;
}

/**
 * Get a valid JWT token for testing authentication
 * Uses the same JWT service that the real application uses
 * @returns JWT token string in Bearer format
 */
function getAuthToken(): string {
  const metaOrgUser = getTestMetaOrgUser();
  const payload = {
    user: {
      _id: metaOrgUser._id,
      email: metaOrgUser.email
    },
    _orgId: metaOrgUser._orgId
  };

  // Use JwtService to sign the token - this is what the real app uses
  const token = JwtService.sign(
    payload,
    JWT_SECRET,
    { expiresIn: 3600 }
  );

  return `Bearer ${token}`;
}

/**
 * Verify a JWT token
 * @param token JWT token string
 * @returns Decoded payload
 */
function verifyToken(token: string): any {
  return JwtService.verify(token, JWT_SECRET);
}

// Service that does NOT use aggregation
export class CategoryService extends GenericApiService<ICategory> {
  constructor(database: IDatabase) {
    super(database, 'categories', 'category', CategorySpec);
  }
}

// Controller for the service that does NOT use aggregation
export class CategoryController extends ApiController<ICategory> {
  constructor(app: Application, database: IDatabase) {
    const categoryService = new CategoryService(database);
    super('categories', app, categoryService, 'category', CategorySpec);
  }
}

// Test service with aggregation pipeline
export class ProductService extends GenericApiService<IProduct> {
  private db: IDatabase;
  constructor(database: IDatabase) {
    super(database, 'products', 'product', ProductSpec);
    this.db = database;
  }

  override prepareQuery(userContext: IUserContext, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] } {
    const newOperations = [
      ...operations,
      new Join('categories', 'categoryId', '_id', 'category')
    ];

    return super.prepareQuery(userContext, queryObject, newOperations);
  }

  override postprocessEntity(userContext: IUserContext, single: any): any {
    if (single && single.category) {
      const categoryService = new CategoryService(this.db);
      single.category = categoryService.postprocessEntity(userContext, single.category);
    }
    return super.postprocessEntity(userContext, single);
  }
}

// Controller that uses aggregation and overrides get/getById to handle it
export class ProductsController extends ApiController<IProduct> {
  constructor(app: Application, database: IDatabase) {

    const productService = new ProductService(database);

    // 1. Define the full shape of the aggregated data, including the joined category.
    const AggregatedProductSchema = Type.Intersect([
      ProductSpec.fullSchema,
      Type.Partial(Type.Object({
        category: CategorySpec.fullSchema
      }))
    ]);

    // 2. Create a public version of the aggregated schema by omitting sensitive fields.
    const PublicAggregatedProductSchema = Type.Omit(AggregatedProductSchema, ['internalNumber']);

    // 3. Pass the base ProductSpec for validation, and our new, more accurate public schema
    //    for client-facing responses. The updated apiUtils.apiResponse will use this
    //    public schema to correctly encode the final shape.
    super('products', app, productService, 'product', ProductSpec, PublicAggregatedProductSchema);
  }
}

// Service that uses MultiTenantApiService
export class MultiTenantProductService extends MultiTenantApiService<IProduct> {
  private db: IDatabase;
  constructor(database: IDatabase) {
    super(database, 'products', 'product', ProductSpec);
    this.db = database;
  }

  override prepareQuery(userContext: IUserContext, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] } {
    const newOperations = [
      ...operations,
      new Join('categories', 'categoryId', '_id', 'category')
    ];

    return super.prepareQuery(userContext, queryObject, newOperations);
  }

  override postprocessEntity(userContext: IUserContext, single: any): any {
    if (single && single.category) {
      const categoryService = new CategoryService(this.db);
      single.category = categoryService.postprocessEntity(userContext, single.category);
    }
    return super.postprocessEntity(userContext, single);
  }
}

// Controller that uses the multi-tenant service
export class MultiTenantProductsController extends ApiController<IProduct> {
  constructor(app: Application, database: IDatabase) {
    const productService = new MultiTenantProductService(database);

    const AggregatedProductSchema = Type.Intersect([
      ProductSpec.fullSchema,
      Type.Partial(Type.Object({
        category: CategorySpec.fullSchema
      }))
    ]);

    const PublicAggregatedProductSchema = Type.Omit(AggregatedProductSchema, ['internalNumber']);

    super('multi-tenant-products', app, productService, 'product', ProductSpec, PublicAggregatedProductSchema);
  }
}

/**
 * Configure JWT service to use test secret
 * This should be called before tests that use authentication
 */
function configureJwtSecret(): void {
  // Configure the application to use our test secret
  // This should be done in a setup function before tests
  const originalJwtVerify = jwt.verify;

  // Patch jwt.verify to use our test secret
  (jwt.verify as any) = function (token: string, secret: string, options?: jwt.VerifyOptions): any {
    return originalJwtVerify(token, JWT_SECRET, options);
  };
}

// actually login with the test user, using controller, etc
async function loginWithTestUser(agent: any) {
  // Set deviceId cookie first
  agent.set('Cookie', [`deviceId=${deviceIdCookie}`]);

  const testUser = getTestMetaOrgUser();

  const response = await agent
    .post('/api/auth/login')
    .send({
      email: testUser.email,
      password: testUser.password,
    });

  // Make sure we got a valid response
  if (!response.body?.data?.tokens?.accessToken) {
    console.error('Login failed:', response.body);
    throw new Error('Failed to login with test user');
  }

  const authorizationHeaderValue = `Bearer ${response.body?.data?.tokens?.accessToken}`;
  return authorizationHeaderValue;
}

async function cleanup() {
  try {
    await deleteTestUser();
    await deleteMetaOrg();
  }
  catch (error: any) {
    console.log('Error during cleanup:', error);
    // Don't throw - cleanup should be non-blocking
  }
}

const testUtils = {
  getRandomId,
  cleanup,
  configureJwtSecret,
  constDeviceIdCookie,
  createMetaOrg,
  deleteMetaOrg,
  deleteTestUser,
  getAuthToken,
  initialize,
  loginWithTestUser,
  newUser1Email,
  newUser1Password,
  setupTestUser,
  simulateloginWithTestUser,
  verifyToken
};
export default testUtils;