import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db, ObjectId, Collection } from 'mongodb';
import { TestExpressApp } from '../../../__tests__/test-express-app.js';
import { MongoDBDatabase } from '../../mongo-db/mongo-db.database.js';
import { convertObjectIdsToStrings } from '../../mongo-db/utils/convert-object-ids-to-strings.util.js';
import { Join } from '../join.operation.js';
import { JoinMany } from '../join-many.operation.js';
import { JoinThroughMany } from '../join-through-many.operation.js';
import { Operation } from '../operation.js';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { ITestClientReportsModel, testClientReportsModelSpec } from './models/test-client-report.model.js';
import { ITestPersonModel } from './models/test-person.model.js';
import { ITestEmailAddressModel } from './models/test-email-address.model.js';
import { ITestPhoneNumberModel } from './models/test-phone-number.model.js';

// Skip this test suite if not running with MongoDB
const isMongo = process.env.TEST_DATABASE === 'mongodb';

describe.skipIf(!isMongo)('Join Operations - Complex Data Joining (MongoDB)', () => {
    let mongoServer: MongoMemoryServer;
    let mongoClient: MongoClient;
    let db: Db;
    let database: MongoDBDatabase;
    let personId: string;
    let clientId: string;
    let emailAddress1Id: string;
    let emailAddress2Id: string;
    let phoneNumber1Id: string;
    let phoneNumber2Id: string;

    // Collections for direct MongoDB access
    let personsCollection: Collection;
    let clientsCollection: Collection;
    let emailAddressesCollection: Collection;
    let phoneNumbersCollection: Collection;
    let personsPhoneNumbersCollection: Collection;

    beforeAll(async () => {
        // Create our own MongoDB instance for direct collection access
        mongoServer = await MongoMemoryServer.create({
            instance: {
                ip: '127.0.0.1', // Use localhost to avoid permission issues
                port: 0, // Use dynamic port allocation
            },
        });
        const uri = mongoServer.getUri();
        mongoClient = new MongoClient(uri);
        await mongoClient.connect();
        db = mongoClient.db('test-db');
        database = new MongoDBDatabase(db);

        // Initialize TestExpressApp for test infrastructure (this sets up system user context, etc.)
        await TestExpressApp.init(true);

        // Get collections
        personsCollection = db.collection('persons');
        clientsCollection = db.collection('clients');
        emailAddressesCollection = db.collection('email_addresses');
        phoneNumbersCollection = db.collection('phone_numbers');
        personsPhoneNumbersCollection = db.collection('persons_phone_numbers');

        // Clean up any existing test data first (in case of previous failed test runs)
        await personsPhoneNumbersCollection.deleteMany({});
        await emailAddressesCollection.deleteMany({ email_address: { $in: ['john.doe@example.com', 'john.m.doe@example.com'] } });
        await phoneNumbersCollection.deleteMany({ phone_number: { $in: ['555-0100', '555-0200'] } });
        await clientsCollection.deleteMany({});
        await personsCollection.deleteMany({ first_name: 'John' });

        // Create test data
        const now = new Date();
        const systemUserId = 'system';

        // 1. Create a person
        const personIdObj = new ObjectId();
        personId = personIdObj.toString();
        // Keep personIdObj for foreign key references
        await personsCollection.insertOne({
            _id: personIdObj,
            first_name: 'John',
            middle_name: 'Michael',
            last_name: 'Doe',
            is_client: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // 2. Create a client linked to the person
        const clientIdObj = new ObjectId();
        clientId = clientIdObj.toString();
        await clientsCollection.insertOne({
            _id: clientIdObj,
            person_id: personIdObj, // Use ObjectId for foreign key reference
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // 3. Create email addresses for the person
        const email1IdObj = new ObjectId();
        emailAddress1Id = email1IdObj.toString();
        await emailAddressesCollection.insertOne({
            _id: email1IdObj,
            person_id: personIdObj, // Use ObjectId for foreign key reference
            email_address: 'john.doe@example.com',
            is_default: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        const email2IdObj = new ObjectId();
        emailAddress2Id = email2IdObj.toString();
        await emailAddressesCollection.insertOne({
            _id: email2IdObj,
            person_id: personIdObj, // Use ObjectId for foreign key reference
            email_address: 'john.m.doe@example.com',
            is_default: false,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // 4. Create phone numbers
        const phone1IdObj = new ObjectId();
        phoneNumber1Id = phone1IdObj.toString();
        await phoneNumbersCollection.insertOne({
            _id: phone1IdObj,
            phone_number: '555-0100',
            phone_number_type: 'mobile',
            is_default: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        const phone2IdObj = new ObjectId();
        phoneNumber2Id = phone2IdObj.toString();
        await phoneNumbersCollection.insertOne({
            _id: phone2IdObj,
            phone_number: '555-0200',
            phone_number_type: 'home',
            is_default: false,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // 5. Link phone numbers to person via join collection
        await personsPhoneNumbersCollection.insertOne({
            person_id: personIdObj, // Use ObjectId for foreign key reference
            phone_number_id: phone1IdObj, // Use ObjectId for foreign key reference
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        await personsPhoneNumbersCollection.insertOne({
            person_id: personIdObj, // Use ObjectId for foreign key reference
            phone_number_id: phone2IdObj, // Use ObjectId for foreign key reference
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });
    });

    afterAll(async () => {
        // Clean up test data before closing database connection
        if (db) {
            try {
                await personsPhoneNumbersCollection.deleteMany({});
                await emailAddressesCollection.deleteMany({ email_address: { $in: ['john.doe@example.com', 'john.m.doe@example.com'] } });
                await phoneNumbersCollection.deleteMany({ phone_number: { $in: ['555-0100', '555-0200'] } });
                await clientsCollection.deleteMany({});
                await personsCollection.deleteMany({ first_name: 'John' });
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        if (mongoClient) {
            await mongoClient.close();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    it('should build a client-report using all join operation types', async () => {
        // Create join operations
        // 1. One-to-one: clients -> persons
        const joinPerson = new Join('persons', 'person_id', '_id', 'person');

        // 2. Many-to-one: persons -> email_addresses (returns array)
        // Note: localField uses "person._id" to reference the joined person table, not the main clients table
        const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');

        // 3. Many-to-many via join table: persons -> persons_phone_numbers -> phone_numbers (returns array)
        // Note: localField uses "person._id" to reference the joined person table, not the main clients table
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',           // final table
            'persons_phone_numbers',   // join table
            'person._id',              // local field (person._id) - references joined person table
            'person_id',               // join table local field
            'phone_number_id',         // join table foreign field
            '_id',                     // foreign field (phone_number._id)
            'phone_numbers'            // alias
        );

        const operations: Operation[] = [joinPerson, joinEmailAddresses, joinPhoneNumbers];

        // Query using getById
        const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
        const rawResult = await database.getById<ITestClientReportsModel>(
            operations,
            queryOptions,
            clientId,
            'clients'
        );

        // Convert ObjectIds to strings (MongoDB returns raw ObjectIds)
        const result = rawResult ? convertObjectIdsToStrings(rawResult) : null;

        // Verify the result structure
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!._id).toBe(clientId);
        expect(result!.client_person).toBeDefined();
        expect(result!.client_person._id).toBe(personId);
        expect(result!.client_person.first_name).toBe('John');
        expect(result!.client_person.middle_name).toBe('Michael');
        expect(result!.client_person.last_name).toBe('Doe');

        // Verify email addresses array
        expect(result!.client_person.client_email_addresses).toBeDefined();
        expect(Array.isArray(result!.client_person.client_email_addresses)).toBe(true);
        expect(result!.client_person.client_email_addresses.length).toBe(2);

        // Verify email addresses content
        const emailAddresses = result!.client_person.client_email_addresses as ITestEmailAddressModel[];
        const email1 = emailAddresses.find(e => e.email_address === 'john.doe@example.com');
        const email2 = emailAddresses.find(e => e.email_address === 'john.m.doe@example.com');

        expect(email1).toBeDefined();
        expect(email1!.person_id).toBe(personId);
        expect(email1!.is_default).toBe(true);

        expect(email2).toBeDefined();
        expect(email2!.person_id).toBe(personId);
        expect(email2!.is_default).toBe(false);

        // Verify phone numbers array
        expect(result!.client_person.client_phone_numbers).toBeDefined();
        expect(Array.isArray(result!.client_person.client_phone_numbers)).toBe(true);
        expect(result!.client_person.client_phone_numbers.length).toBe(2);

        // Verify phone numbers content
        const phoneNumbers = result!.client_person.client_phone_numbers as ITestPhoneNumberModel[];
        const phone1 = phoneNumbers.find(p => p.phone_number === '555-0100');
        const phone2 = phoneNumbers.find(p => p.phone_number === '555-0200');

        expect(phone1).toBeDefined();
        expect(phone1!.phone_number_type).toBe('mobile');
        expect(phone1!.is_default).toBe(true);

        expect(phone2).toBeDefined();
        expect(phone2!.phone_number_type).toBe('home');
        expect(phone2!.is_default).toBe(false);
    });

    it('should handle get() query with joins and return paginated results', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',
            'persons_phone_numbers',
            'person._id',
            'person_id',
            'phone_number_id',
            '_id',
            'phone_numbers'
        );

        const operations: Operation[] = [joinPerson, joinEmailAddresses, joinPhoneNumbers];

        // Query using get with pagination
        const queryOptions: IQueryOptions = {
            ...DefaultQueryOptions,
            page: 1,
            pageSize: 10
        };

        const rawResult = await database.get<ITestClientReportsModel>(
            operations,
            queryOptions,
            testClientReportsModelSpec,
            'clients'
        );

        // Convert ObjectIds to strings (MongoDB returns raw ObjectIds)
        const result = {
            ...rawResult,
            entities: rawResult.entities?.map(e => convertObjectIdsToStrings(e))
        };

        // Verify paginated result
        expect(result).toBeDefined();
        expect(result.entities).toBeDefined();
        expect(result.entities!.length).toBeGreaterThan(0);
        expect(result.total).toBeGreaterThan(0);

        // Verify first entity has proper structure
        const firstEntity = result.entities![0];
        expect(firstEntity.client_person).toBeDefined();
        expect(firstEntity.client_person.client_email_addresses).toBeDefined();
        expect(Array.isArray(firstEntity.client_person.client_email_addresses)).toBe(true);
        expect(firstEntity.client_person.client_phone_numbers).toBeDefined();
        expect(Array.isArray(firstEntity.client_person.client_phone_numbers)).toBe(true);
    });

    it('should handle getAll() query with joins', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',
            'persons_phone_numbers',
            'person._id',
            'person_id',
            'phone_number_id',
            '_id',
            'phone_numbers'
        );

        const operations: Operation[] = [joinPerson, joinEmailAddresses, joinPhoneNumbers];

        // Query using getAll
        const rawResults = await database.getAll<ITestClientReportsModel>(
            operations,
            'clients'
        );

        // Convert ObjectIds to strings (MongoDB returns raw ObjectIds)
        const results = rawResults.map(r => convertObjectIdsToStrings(r));

        // Verify results
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        // Verify first result has proper structure
        const firstResult = results[0];
        expect(firstResult.client_person).toBeDefined();
        expect(firstResult.client_person.client_email_addresses).toBeDefined();
        expect(Array.isArray(firstResult.client_person.client_email_addresses)).toBe(true);
        expect(firstResult.client_person.client_phone_numbers).toBeDefined();
        expect(Array.isArray(firstResult.client_person.client_phone_numbers)).toBe(true);
    });

    it('should handle empty arrays when no related records exist', async () => {
        // Create a person without email addresses or phone numbers
        const now = new Date();
        const systemUserId = 'system';
        const newPersonIdObj = new ObjectId();
        const newPersonId = newPersonIdObj.toString();

        await personsCollection.insertOne({
            _id: newPersonIdObj,
            first_name: 'Jane',
            last_name: 'Smith',
            is_client: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        const newClientIdObj = new ObjectId();
        const newClientId = newClientIdObj.toString();
        await clientsCollection.insertOne({
            _id: newClientIdObj,
            person_id: newPersonIdObj, // Use ObjectId for foreign key reference
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'client_email_addresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',
            'persons_phone_numbers',
            'person._id',
            'person_id',
            'phone_number_id',
            '_id',
            'client_phone_numbers'
        );

        const operations: Operation[] = [joinPerson, joinEmailAddresses, joinPhoneNumbers];

        // Query the new client
        const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
        const rawResult = await database.getById<ITestClientReportsModel>(
            operations,
            queryOptions,
            newClientId,
            'clients'
        );

        // Convert ObjectIds to strings (MongoDB returns raw ObjectIds)
        const result = rawResult ? convertObjectIdsToStrings(rawResult) : null;

        // Verify empty arrays are returned
        expect(result).toBeDefined();
        expect(result!.client_person).toBeDefined();
        expect(result!.client_person.client_email_addresses).toBeDefined();
        expect(Array.isArray(result!.client_person.client_email_addresses)).toBe(true);
        expect(result!.client_person.client_email_addresses.length).toBe(0);
        expect(result!.client_person.client_phone_numbers).toBeDefined();
        expect(Array.isArray(result!.client_person.client_phone_numbers)).toBe(true);
        expect(result!.client_person.client_phone_numbers.length).toBe(0);

        // Clean up the test data
        await clientsCollection.deleteOne({ _id: newClientIdObj });
        await personsCollection.deleteOne({ _id: newPersonIdObj });
    });
});
