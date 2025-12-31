import { Request, Response, Application } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUserContext, IQueryOptions, IUser, EmptyUserContext } from '@loomcore/common/models';
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
import { MongoDBDatabase } from '../databases/mongo-db/mongo-db.database.js';
import { PostgresDatabase } from '../databases/postgres/postgres.database.js';
import * as testObjectsModule from './test-objects.js';
const {
  getTestMetaOrg,
  getTestOrg,
  getTestMetaOrgUser,
  getTestMetaOrgUserContext,
  getTestOrgUserContext,
  setTestOrgId,
  setTestMetaOrgId,
  setTestMetaOrgUserId,
  setTestOrgUserId } = testObjectsModule;
import { CategorySpec, ICategory } from './models/category.model.js';
import { IProduct, ProductSpec } from './models/product.model.js';
import { setBaseApiConfig } from '../config/index.js';
import { entityUtils } from '@loomcore/common/utils';
import { getTestOrgUser } from './test-objects.js';

let deviceIdCookie: string;
let authService: AuthService | undefined;
let organizationService: OrganizationService | undefined;

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

/**
 * Check if the database is MongoDB
 */
function isMongoDatabase(database: IDatabase): boolean {
  return database instanceof MongoDBDatabase;
}

/**
 * Check if the database is PostgreSQL
 */
function isPostgresDatabase(database: IDatabase): boolean {
  return database instanceof PostgresDatabase;
}

/**
 * Get the expected type for _id based on the database type
 * MongoDB uses string IDs, PostgreSQL uses number IDs
 */
function getExpectedIdType(database: IDatabase): 'string' | 'number' {
  return isPostgresDatabase(database) ? 'number' : 'string';
}

async function createMetaOrg() {
  if (!organizationService) {
    throw new Error('OrganizationService not initialized. Call initialize() first.');
  }
  try {
    // Create a meta organization (required for system user context)
    // Use EmptyUserContext to avoid the org check when querying/creating
    const existingMetaOrg = await organizationService.getMetaOrg(EmptyUserContext);
    if (!existingMetaOrg) {
      // Use EmptyUserContext when creating the meta org (no org check needed for first meta org)
      const metaOrgInsertResult = await organizationService.create(EmptyUserContext, getTestMetaOrg());
      if (metaOrgInsertResult) {
        setTestMetaOrgId(metaOrgInsertResult._id);
      }
    } else {
      // Update test objects with the actual meta org ID from database
      setTestMetaOrgId(existingMetaOrg._id);
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

async function setupTestUsers(): Promise<{ metaOrgUser: IUser, testOrgUser: IUser }> {
  try {
    // Ensure meta org exists (may have been deleted by clearCollections)
    await createMetaOrg();
    // Clean up any existing test data, then create fresh test user
    await deleteTestUser();
    return createTestUsers();
  }
  catch (error: any) {
    console.log(error);
    throw error;
  }
}

async function createTestUsers(): Promise<{ metaOrgUser: IUser, testOrgUser: IUser }> {
  if (!authService || !organizationService) {
    throw new Error('Database not initialized. Call initialize() first.');
  }

  try {
    // Get the actual meta org from the database (should exist from migrations/createMetaOrg)
    // Use EmptyUserContext to avoid the org check when querying
    const existingMetaOrg = await organizationService.getMetaOrg(EmptyUserContext);

    if (!existingMetaOrg) {
      throw new Error('Meta organization does not exist. Test setup is incorrect - meta org should be created by migrations or createMetaOrg().');
    }

    // Update test objects with the actual meta org ID from database
    setTestMetaOrgId(existingMetaOrg._id);

    const existingTestOrg = await organizationService.findOne(getTestMetaOrgUserContext(), { filters: { _id: { eq: getTestOrg()._id } } });

    if (!existingTestOrg) {
      const createdTestOrg = await organizationService.create(getTestMetaOrgUserContext(), getTestOrg());
      if (!createdTestOrg) {
        throw new Error('Failed to create test organization');
      }
      setTestOrgId(createdTestOrg._id);
    } else {
      setTestOrgId(existingTestOrg._id);
    }

    const createdTestOrgUser = await authService.createUser(getTestOrgUserContext(), getTestOrgUser());
    const createdMetaOrgUser = await authService.createUser(getTestMetaOrgUserContext(), getTestMetaOrgUser());

    if (!createdTestOrgUser || !createdMetaOrgUser) {
      throw new Error('Failed to create test user');
    }

    // Update test objects with the actual created user IDs (correct type for current database)
    setTestMetaOrgUserId(createdMetaOrgUser._id);
    setTestOrgUserId(createdTestOrgUser._id);

    return { metaOrgUser: createdMetaOrgUser, testOrgUser: createdTestOrgUser };
  }
  catch (error: any) {
    console.log('Error in createTestUser:', error);
    throw error;
  }
}

async function deleteTestUser() {
  // Only delete if services are initialized
  if (!authService || !organizationService) {
    return;
  }

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
  if (!authService) {
    throw new Error('AuthService not initialized. Call initialize() first.');
  }
  const loginResponse = await authService.attemptLogin(
    req as Request,
    res as Response,
    getTestMetaOrgUser().email,
    testObjectsModule.TEST_META_ORG_USER_PASSWORD
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
  const userContext = getTestMetaOrgUserContext();

  // Use JwtService to sign the token - this is what the real app uses
  const token = JwtService.sign(
    userContext,
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

// todo: alter to accept the app property values add provide in each specific test (isMultiTenant, dbType)
export function setupTestConfig(isMultiTenant: boolean = true) {
  setBaseApiConfig({
    env: 'test',
    hostName: 'localhost',
    appName: 'test-app',
    clientSecret: 'test-secret',
    database: {
      name: 'test-db',
    },
    externalPort: 4000,
    internalPort: 8083,
    corsAllowedOrigins: ['*'],
    saltWorkFactor: 10,
    jobTypes: '',
    deployedBranch: '',
    debug: {
      showErrors: false
    },
    app: { 
      isMultiTenant: isMultiTenant,
      // Provide metaOrgName and metaOrgCode for multi-tenant setups so meta-org migration runs
      ...(isMultiTenant && {
        metaOrgName: 'Test Meta Organization',
        metaOrgCode: 'TEST_META_ORG'
      })
    },
    auth: {
      jwtExpirationInSeconds: 3600,
      refreshTokenExpirationInDays: 7,
      deviceIdCookieMaxAgeInDays: 730,
      passwordResetTokenExpirationInMinutes: 20
    },
    email: {
      emailApiKey: 'WeDontHaveAKeyYet',
      emailApiSecret: 'WeDontHaveASecretYet',
      fromAddress: 'test@test.com',
      systemEmailAddress: 'system@test.com'
    },
    adminUser: {
      email: 'admin@test.com',
      password: 'admin-password'
    }
  });
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

  override postProcessEntity(userContext: IUserContext, single: any): any {
    if (single && single.category) {
      const categoryService = new CategoryService(this.db);
      single.category = categoryService.postProcessEntity(userContext, single.category);
    }
    return super.postProcessEntity(userContext, single);
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

    const PublicAggregatedProductSpec = entityUtils.getModelSpec(PublicAggregatedProductSchema);
    // 3. Pass the base ProductSpec for validation, and our new, more accurate public schema
    //    for client-facing responses. The updated apiUtils.apiResponse will use this
    //    public schema to correctly encode the final shape.
    super('products', app, productService, 'product', ProductSpec, PublicAggregatedProductSpec);
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

  override postProcessEntity(userContext: IUserContext, single: any): any {
    if (single && single.category) {
      const categoryService = new CategoryService(this.db);
      single.category = categoryService.postProcessEntity(userContext, single.category);
    }
    return super.postProcessEntity(userContext, single);
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


    const PublicAggregatedProductSpec = entityUtils.getModelSpec(PublicAggregatedProductSchema);
    super('multi-tenant-products', app, productService, 'product', ProductSpec, PublicAggregatedProductSpec);
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
  SetupTestConfig: setupTestConfig,
  loginWithTestUser,
  newUser1Email,
  newUser1Password,
  setupTestUsers,
  simulateloginWithTestUser,
  verifyToken,
  isMongoDatabase,
  isPostgresDatabase,
  getExpectedIdType
};
export default testUtils;