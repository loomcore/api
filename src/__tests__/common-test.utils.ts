import { Collection, Db, ObjectId } from 'mongodb';
import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUser, IUserContext } from '@loomcore/common/models';

import { JwtService } from '../services/jwt.service.js';
import { passwordUtils } from '../utils/password.utils.js';
import { AuthService } from '../services/auth.service.js';

let db: Db;
let collections: any = {};
let deviceIdCookie: string;
let authService: AuthService;
let testUser: Partial<IUser>;

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
  
function initialize(database: Db) {
  db = database;
  collections = {
    users: db.collection('users'),
    organizations: db.collection('organizations'),
  };
  authService = new AuthService(db);
}

async function createIndexes(db: Db) {
  // create indexes - keep this in sync with the k8s/02-mongo-init-configmap.yaml that is used for actual deployment
  //  If we can figure out how to use a single file for both, that would be great.
  await db.command({
    createIndexes: "users", indexes: [ { key: { email: 1 }, name: 'email_index', unique: true, collation: { locale: 'en', strength: 1 } }]
  });
}
    
async function setupTestUser() {
  try {
    const result = await deleteTestUser();
    return createTestUser();
  }
  catch (error: any) {
    console.log(error);
    throw error;
  }
}

async function createTestUser() {
  if (!db || !collections.users) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  
  try {
    const hashedAndSaltedTestUserPassword = await passwordUtils.hashPassword(testUserPassword);
    
    // Create a test organization if it doesn't exist
    const existingOrg = await collections.organizations.findOne({ _id: testOrgId });
    if (!existingOrg) {
      const orgInsertResult = await collections.organizations.insertOne({ 
        _id: new ObjectId(testOrgId), 
        name: testOrgName,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system'
      });
    }
    
    const localTestUser = {
      _id: new ObjectId(testUserId),
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
    const insertResult = await collections.users.insertOne(localTestUser);
    
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
  let promise = Promise.resolve(null);
  if (testUser) {
    promise = collections.users.deleteOne({_id: testUser._id});
  }
  return promise;
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
      _id: new ObjectId(testUserId),
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

const testUtils = {
  configureJwtSecret,
  constDeviceIdCookie,
  createIndexes,
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