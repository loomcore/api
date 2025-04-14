import { Collection, Db, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { IUserContext } from '../../models/user-context.model.js';
import { JwtService } from '../../services/jwt.service.js';
import crypto from 'crypto';
import { IUser } from '../../models/user.model.js';
import { passwordUtils } from '../../utils/password.utils.js';
import { AuthService } from '../../services/auth.service.js';
import { Request, Response } from 'express';

/**
 * Utility class for common test functions that don't depend on external modules
 */
export class CommonTestUtils {
  private static JWT_SECRET = 'test-secret';
  private static testUserId = '67f33ed5b75090e0dda18a3c';
  private static testOrgId = '67e8e19b149f740323af93d7';
  private static testOrgName = 'Test Organization';
  private static testUserEmail = 'test@example.com';
  private static testUserPassword = 'testPassword';
  private static deviceIdCookie = crypto.randomBytes(16).toString('hex'); // Generate a consistent device ID for tests
  private static testUser: Partial<IUser>;
  private static db: Db;
  private static collections: any = {};
  private static authService: AuthService;
  
  static initialize(db: Db) {
    this.db = db;
    this.collections = {
      users: db.collection('users'),
      organizations: db.collection('organizations'),
    };
    this.authService = new AuthService(db);
  }
    
  static async setupTestUser() {
    try {
      const result = await this.deleteTestUser();
      return this.createTestUser();
    }
    catch (error: any) {
      console.log(error);
      throw error;
    }
  }

  static async createTestUser() {
    if (!this.db || !this.collections.users) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  
    try {
      const hashedAndSaltedTestUserPassword = await passwordUtils.hashPassword(this.testUserPassword);
      
      // Create a test organization if it doesn't exist
      const existingOrg = await this.collections.organizations.findOne({ _id: this.testOrgId });
      if (!existingOrg) {
        const orgInsertResult = await this.collections.organizations.insertOne({ 
          _id: new ObjectId(this.testOrgId), 
          name: this.testOrgName,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system'
        });
      }
      
      const testUser = {
        _id: new ObjectId(this.testUserId),
        email: this.testUserEmail, 
        password: hashedAndSaltedTestUserPassword,
        _orgId: this.testOrgId,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system'
      };
  
      // const insertResults = await Promise.all([
      //   this.collections.users.insertMany(testUsers),
      // ]);
      const insertResult = await this.collections.users.insertOne(testUser);
      
      // mongoDb mutates the entity passed into insertOne to have an _id property
      this.testUser = testUser;
      // since this is a simulation, and we aren't using an actual controller, our normal mechanism for filtering out sensitive
      //  properties is not being called. We will have to manually remove the password property here...
      delete this.testUser['password'];

      return this.testUser;
    }
    catch (error: any) {
      console.log('Error in createTestUser:', error);
      throw error;
    }
  }

  static async deleteTestUser() {
    let promise = Promise.resolve(null);
    if (this.testUser) {
      promise = this.collections.users.deleteOne({_id: this.testUser._id});
    }
    return promise;
  }
  
  /**
   * Simulates a login with the test user by directly calling AuthService.attemptLogin
   * This doesn't require controllers or API endpoints to be set up
   * @returns Authorization header value with Bearer token
   */
  static async simulateloginWithTestUser() {
    // Create a simple mock request with cookies
    const req: any = {
      cookies: {}
    };
    
    // Use existing deviceId cookie if available
    if (this.deviceIdCookie) {
      req.cookies['deviceId'] = this.deviceIdCookie;
    }
    
    // Create a simple mock response that captures cookies
    const res: any = {
      cookie: function(name: string, value: string) {
        if (name === 'deviceId') {
          CommonTestUtils.deviceIdCookie = value;
        }
        return res;
      }
    };
    
    // Call authService.attemptLogin directly
    const loginResponse = await this.authService.attemptLogin(
      req as Request, 
      res as Response, 
      this.testUserEmail, 
      this.testUserPassword
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
  static getAuthToken(): string {
    const payload = { 
      user: { 
        _id: new ObjectId(this.testUserId),
        email: this.testUserEmail
      }, 
      _orgId: this.testOrgId 
    };
    
    // Use JwtService to sign the token - this is what the real app uses
    const token = JwtService.sign(
      payload, 
      this.JWT_SECRET, 
      { expiresIn: 3600 }
    );
    
    return `Bearer ${token}`;
  }

  /**
   * Get the test user ID
   * @returns User ID string
   */
  static getUserId(): string {
    return this.testUserId;
  }

  /**
   * Get the test organization ID
   * @returns Organization ID string
   */
  static getOrgId(): string {
    return this.testOrgId;
  }

  /**
   * Get a user context object for testing
   * @returns User context object
   */
  static getUserContext(): IUserContext {
    return {
      user: {
        _id: new ObjectId(this.testUserId),
        email: this.testUserEmail,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system'
      },
      _orgId: this.testOrgId
    } as IUserContext;
  }

  /**
   * Verify a JWT token
   * @param token JWT token string
   * @returns Decoded payload
   */
  static verifyToken(token: string): any {
    return JwtService.verify(token, this.JWT_SECRET);
  }

  /**
   * Configure JWT service to use test secret
   * This should be called before tests that use authentication
   */
  static configureJwtSecret(): void {
    // Configure the application to use our test secret
    // This should be done in a setup function before tests
    const originalJwtVerify = jwt.verify;
    
    // Patch jwt.verify to use our test secret
    (jwt.verify as any) = function(token: string, secret: string, options?: jwt.VerifyOptions): any {
      return originalJwtVerify(token, CommonTestUtils.JWT_SECRET, options);
    };
  }
} 