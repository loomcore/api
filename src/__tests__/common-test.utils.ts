import { Request, Response, Application } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUser, IUserContext, IEntity, IAuditable, IQueryOptions } from '@loomcore/common/models';
import { Type } from '@sinclair/typebox';
import { TypeboxObjectId } from '@loomcore/common/validation';

import { JwtService } from '../services/jwt.service.js';
import { passwordUtils } from '../utils/password.utils.js';
import { ApiController } from '../controllers/api.controller.js';
import { entityUtils } from '@loomcore/common/utils';
import { MultiTenantApiService } from '../services/multi-tenant-api.service.js';
import { Operation } from '../databases/operations/operation.js';
import { Join } from '../databases/operations/join.operation.js';
import { Database } from '../databases/models/database.js';
import { OrganizationService } from '../services/organization.service.js';
import { IdNotFoundError } from '../errors/index.js';
import { TestMongoDb } from './test-mongo-db.js';
import { AuthService, GenericApiService } from '../services/index.js';

let deviceIdCookie: string;
let authService: AuthService;
let testUser: IUser;
let organizationService: OrganizationService;

const JWT_SECRET = 'test-secret';
const newUser1Email= 'one@test.com';
const newUser1Password = 'testone';
const testUserId = '67f33ed5b75090e0dda18a3c';
const testOrgId = '67e8e19b149f740323af93d7';
const testOrgName = 'Test Organization';
const testUserEmail = 'test@example.com';
const testUserEmailCaseInsensitive = 'tesT@example.com';
const testUserPassword = 'testPassword';
const constDeviceIdCookie = crypto.randomBytes(16).toString('hex'); // Generate a consistent device ID for tests

// Initialize with default values
const testUserContext: IUserContext = {
  user: {
    _id: testUserId,
    email: testUserEmail,
    _created: new Date(),
    _createdBy: 'system',
    _updated: new Date(),
    _updatedBy: 'system'
  },
  _orgId: testOrgId
} as IUserContext;


function initialize(database: Database) {
  authService = new AuthService(database);
  organizationService = new OrganizationService(database);
}

function getRandomId(): string {
  return TestMongoDb.getRandomId();
}

async function createMetaOrg() {
  if (!organizationService) {
    throw new Error('OrganizationService not initialized. Call initialize() first.');
  }
  try {
    // Create a meta organization (required for system user context)
    const existingMetaOrg = await organizationService.findOne(testUserContext, { filters: { isMetaOrg: { eq: true } } });
    if (!existingMetaOrg) {
      const metaOrgInsertResult = await organizationService.create(testUserContext, { 
        name: 'Meta Organization',
        code: 'meta-org',
        isMetaOrg: true
      });
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
    await organizationService.deleteMany(testUserContext, { filters: { isMetaOrg: { eq: true } } });
  }
  catch (error: any) {
    console.log('Error deleting meta org:', error);
    // Don't throw - cleanup should be non-blocking
  }
}
    
async function setupTestUser() {
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

async function createTestUser() {
  if (!authService || !organizationService) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  
  try {
    const hashedAndSaltedTestUserPassword = await passwordUtils.hashPassword(testUserPassword);
    
    // Create a test organization if it doesn't exist
    let existingOrg;
    try {
      existingOrg = await organizationService.getById(testUserContext, testOrgId);
    } catch (error: any) {
      // If organization doesn't exist, create it
      if (error instanceof IdNotFoundError) {
        existingOrg = null;
      } else {
        throw error;
      }
    }
    
    if (!existingOrg) {
      await organizationService.create(testUserContext, { 
        _id: testOrgId,
        name: testOrgName,
        code: 'test-org',
        isMetaOrg: false
      });
    }
    
    const localTestUser = {
      _id: testUserId,
      email: testUserEmail, 
      password: hashedAndSaltedTestUserPassword,
      _orgId: testOrgId,
      _created: new Date(),
      _createdBy: 'system',
      _updated: new Date(),
      _updatedBy: 'system'
    };

    // const insertResults = await Promise.all([
    //   collections.users.insertMany(testUsers),
    // ]);
    const insertResult = await authService.create(testUserContext, {
      _id: testUserId,
      email: testUserEmail,
      password: testUserPassword,
      _orgId: testOrgId
    });
    
    // since this is a simulation, and we aren't using an actual controller, our normal mechanism for filtering out sensitive
    //  properties is not being called. We will have to manually remove the password property here...
    delete (localTestUser as any)['password'];

    // mongoDb mutates the entity passed into insertOne to have an _id property
    testUser = {...localTestUser, _id: localTestUser._id.toString()};

    return localTestUser;
  }
  catch (error: any) {
    console.log('Error in createTestUser:', error);
    throw error;
  }
}

function deleteTestUser() {
  let promises: Promise<any>[] = [];
  
  // Delete test user
  if (testUser) {
    promises.push(authService.deleteById(testUserContext, testUser._id).catch((error: any) => {
      // Ignore errors during cleanup - entity may not exist
      return null;
    }));
  }
  
  // Delete test organization (regular org only, not meta)
  if (organizationService) {
    promises.push(organizationService.deleteById(testUserContext, testOrgId).catch((error: any) => {
      // Ignore errors during cleanup - entity may not exist
      return null;
    }));
  }
  
  return Promise.all(promises);
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
    cookie: function(name: string, value: string) {
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
    testUserEmail, 
    testUserPassword
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
  const payload = { 
    user: { 
      _id: testUserId,
      email: testUserEmail
    }, 
    _orgId: testOrgId 
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

// Mock models for testing aggregation
export interface ICategory extends IEntity {
  name: string;
}

export interface IProduct extends IEntity, IAuditable {
  name: string;
  description?: string;
  internalNumber?: string; // a sensitive property
  categoryId: string;
  category?: ICategory;
}

export const CategorySchema = Type.Object({
  _id: Type.Optional(TypeboxObjectId()),
  name: Type.String(),
});
export const CategorySpec = entityUtils.getModelSpec(CategorySchema);


export const ProductSchema = Type.Object({
  _id: Type.Optional(TypeboxObjectId()),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  internalNumber: Type.Optional(Type.String()),
  categoryId: TypeboxObjectId({ title: 'Category ID' }),
});
export const ProductSpec = entityUtils.getModelSpec(ProductSchema, { isAuditable: true });

// Create a public schema for products that omits the sensitive internalNumber
export const PublicProductSchema = Type.Omit(ProductSpec.fullSchema, ['internalNumber']);

// Service that does NOT use aggregation
export class CategoryService extends GenericApiService<ICategory> {
  constructor(database: Database) {
    super(database, 'categories', 'category', CategorySpec);
  }
}

// Controller for the service that does NOT use aggregation
export class CategoryController extends ApiController<ICategory> {
  constructor(app: Application, database: Database) {
    const categoryService = new CategoryService(database);
    super('categories', app, categoryService, 'category', CategorySpec);
  }
}

// Test service with aggregation pipeline
export class ProductService extends GenericApiService<IProduct> {
  private db: Database;
  constructor(database: Database) {
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
  constructor(app: Application, database: Database) {

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
  private db: Database;
  constructor(database: Database) {
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
  constructor(app: Application, database: Database) {
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

function getTestUser(): Partial<IUser> {
  return testUser;
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
  (jwt.verify as any) = function(token: string, secret: string, options?: jwt.VerifyOptions): any {
    return originalJwtVerify(token, JWT_SECRET, options);
  };
}

// actually login with the test user, using controller, etc
async function loginWithTestUser(agent: any) {
  // Set deviceId cookie first
  agent.set('Cookie', [`deviceId=${deviceIdCookie}`]);
  
  const response = await agent
    .post('/api/auth/login')
    .send({
      email: testUserEmail,
      password: testUserPassword,
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
  getTestUser,
  initialize,
  loginWithTestUser,
  newUser1Email,
  newUser1Password,
  setupTestUser,
  simulateloginWithTestUser,
  testUserContext,
  testUserId,
  testUserEmail,
  testUserEmailCaseInsensitive,
  testUserPassword,
  testOrgId,
  testOrgName,
  verifyToken
};
export default testUtils;