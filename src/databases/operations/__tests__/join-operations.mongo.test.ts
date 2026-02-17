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
        phoneNumbersCollection = db.collection('phoneNumbers');
        personsPhoneNumbersCollection = db.collection('personsPhoneNumbers');

        // Clean up any existing test data first (in case of previous failed test runs)
        await personsPhoneNumbersCollection.deleteMany({});
        await emailAddressesCollection.deleteMany({ email_address: { $in: ['john.doe@example.com', 'john.m.doe@example.com'] } });
        await phoneNumbersCollection.deleteMany({ phoneNumber: { $in: ['555-0100', '555-0200'] } });
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
            firstName: 'John',
            middleName: 'Michael',
            lastName: 'Doe',
            isClient: true,
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
            personId: personIdObj, // Use ObjectId for foreign key reference
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
            personId: personIdObj, // Use ObjectId for foreign key reference
            emailAddress: 'john.doe@example.com',
            isDefault: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        const email2IdObj = new ObjectId();
        emailAddress2Id = email2IdObj.toString();
        await emailAddressesCollection.insertOne({
            _id: email2IdObj,
            personId: personIdObj, // Use ObjectId for foreign key reference
            emailAddress: 'john.m.doe@example.com',
            isDefault: false,
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
            phoneNumber: '555-0100',
            phoneNumberType: 'mobile',
            isDefault: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        const phone2IdObj = new ObjectId();
        phoneNumber2Id = phone2IdObj.toString();
        await phoneNumbersCollection.insertOne({
            _id: phone2IdObj,
            phoneNumber: '555-0200',
            phoneNumberType: 'home',
            isDefault: false,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // 5. Link phone numbers to person via join collection
        await personsPhoneNumbersCollection.insertOne({
            personId: personIdObj, // Use ObjectId for foreign key reference
            phoneNumberId: phone1IdObj, // Use ObjectId for foreign key reference
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        await personsPhoneNumbersCollection.insertOne({
            personId: personIdObj, // Use ObjectId for foreign key reference
            phoneNumberId: phone2IdObj, // Use ObjectId for foreign key reference
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
                await emailAddressesCollection.deleteMany({ emailAddress: { $in: ['john.doe@example.com', 'john.m.doe@example.com'] } });
                await phoneNumbersCollection.deleteMany({ phoneNumber: { $in: ['555-0100', '555-0200'] } });
                await clientsCollection.deleteMany({});
                await personsCollection.deleteMany({ firstName: 'John' });
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
        const joinPerson = new Join('persons', 'personId', '_id', 'clientPerson');

        // 2. Many-to-one: persons -> email_addresses (returns array)
        // Note: localField uses "clientPerson._id" to reference the joined person (alias from Join above)
        const joinEmailAddresses = new JoinMany('email_addresses', 'clientPerson._id', 'personId', 'clientEmailAddresses');

        // 3. Many-to-many via join table: persons -> persons_phoneNumbers -> phoneNumbers (returns array)
        // Note: localField uses "clientPerson._id" to reference the joined person (alias from Join above)
        const joinPhoneNumbers = new JoinThroughMany(
            'phoneNumbers',           // final table
            'personsPhoneNumbers',   // join table
            'clientPerson._id',       // local field - references joined person table
            'personId',               // join table local field
            'phoneNumberId',         // join table foreign field
            '_id',                     // foreign field (phoneNumber._id)
            'clientPhoneNumbers'            // alias
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
        expect(result!._joinData?.clientPerson).toBeDefined();
        expect(result!._joinData?.clientPerson._id).toBe(personId);
        expect(result!._joinData?.clientPerson.firstName).toBe('John');
        expect(result!._joinData?.clientPerson.middleName).toBe('Michael');
        expect(result!._joinData?.clientPerson.lastName).toBe('Doe');

        // Verify email addresses array
        expect(result!._joinData?.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(result!._joinData?.clientPerson.clientEmailAddresses)).toBe(true);
        expect(result!._joinData?.clientPerson.clientEmailAddresses.length).toBe(2);

        // Verify email addresses content
        const emailAddresses = result!._joinData?.clientPerson.clientEmailAddresses as ITestEmailAddressModel[];
        const email1 = emailAddresses.find(e => e.emailAddress === 'john.doe@example.com');
        const email2 = emailAddresses.find(e => e.emailAddress === 'john.m.doe@example.com');

        expect(email1).toBeDefined();
        expect(email1!.personId).toBe(personId);
        expect(email1!.isDefault).toBe(true);

        expect(email2).toBeDefined();
        expect(email2!.personId).toBe(personId);
        expect(email2!.isDefault).toBe(false);

        // Verify phone numbers array
        expect(result!._joinData?.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(result!._joinData?.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(result!._joinData?.clientPerson.clientPhoneNumbers.length).toBe(2);

        // Verify phone numbers content
        const phoneNumbers = result!._joinData?.clientPerson.clientPhoneNumbers as ITestPhoneNumberModel[];
        const phone1 = phoneNumbers.find(p => p.phoneNumber === '555-0100');
        const phone2 = phoneNumbers.find(p => p.phoneNumber === '555-0200');

        expect(phone1).toBeDefined();
        expect(phone1!.phoneNumberType).toBe('mobile');
        expect(phone1!.isDefault).toBe(true);

        expect(phone2).toBeDefined();
        expect(phone2!.phoneNumberType).toBe('home');
        expect(phone2!.isDefault).toBe(false);
    });

    it('should handle get() query with joins and return paginated results', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'personId', '_id', 'clientPerson');
        const joinEmailAddresses = new JoinMany('email_addresses', 'clientPerson._id', 'personId', 'clientEmailAddresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phoneNumbers',
            'personsPhoneNumbers',
            'clientPerson._id',
            'personId',
            'phoneNumberId',
            '_id',
            'clientPhoneNumbers'
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
        expect(firstEntity._joinData?.clientPerson).toBeDefined();
        expect(firstEntity._joinData?.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(firstEntity._joinData?.clientPerson.clientEmailAddresses)).toBe(true);
        expect(firstEntity._joinData?.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(firstEntity._joinData?.clientPerson.clientPhoneNumbers)).toBe(true);
    });

    it('should handle getAll() query with joins', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'personId', '_id', 'clientPerson');
        const joinEmailAddresses = new JoinMany('email_addresses', 'clientPerson._id', 'personId', 'clientEmailAddresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phoneNumbers',
            'personsPhoneNumbers',
            'clientPerson._id',
            'personId',
            'phoneNumberId',
            '_id',
            'clientPhoneNumbers'
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
        expect(firstResult._joinData?.clientPerson).toBeDefined();
        expect(firstResult._joinData?.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(firstResult._joinData?.clientPerson.clientEmailAddresses)).toBe(true);
        expect(firstResult._joinData?.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(firstResult._joinData?.clientPerson.clientPhoneNumbers)).toBe(true);
    });

    it('should handle empty arrays when no related records exist', async () => {
        // Create a person without email addresses or phone numbers
        const now = new Date();
        const systemUserId = 'system';
        const newPersonIdObj = new ObjectId();
        const newPersonId = newPersonIdObj.toString();

        await personsCollection.insertOne({
            _id: newPersonIdObj,
            firstName: 'Jane',
            lastName: 'Smith',
            isClient: true,
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        const newClientIdObj = new ObjectId();
        const newClientId = newClientIdObj.toString();
        await clientsCollection.insertOne({
            _id: newClientIdObj,
            personId: newPersonIdObj, // Use ObjectId for foreign key reference
            _created: now,
            _createdBy: systemUserId,
            _updated: now,
            _updatedBy: systemUserId
        });

        // Create join operations
        const joinPerson = new Join('persons', 'personId', '_id', 'clientPerson');
        const joinEmailAddresses = new JoinMany('email_addresses', 'clientPerson._id', 'personId', 'clientEmailAddresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phoneNumbers',
            'personsPhoneNumbers',
            'clientPerson._id',
            'personId',
            'phoneNumberId',
            '_id',
            'clientPhoneNumbers'
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

        console.log('result', JSON.stringify(result, null, 2));


        expect(result?._joinData?.clientPerson).toBeDefined();
        expect(result?._joinData?.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(result?._joinData?.clientPerson.clientEmailAddresses)).toBe(true);
        expect(result?._joinData?.clientPerson.clientEmailAddresses.length).toBe(0);
        expect(result?._joinData?.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(result?._joinData?.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(result?._joinData?.clientPerson.clientPhoneNumbers.length).toBe(0);

        // Clean up the test data
        await clientsCollection.deleteOne({ _id: newClientIdObj });
        await personsCollection.deleteOne({ _id: newPersonIdObj });
    });
});
