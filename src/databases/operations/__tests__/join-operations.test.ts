import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { TestPostgresDatabase } from '../../../__tests__/postgres.test-database.js';
import { setupTestConfig } from '../../../__tests__/common-test.utils.js';
import { PostgresDatabase } from '../../postgres/postgres.database.js';
import { Join } from '../join.operation.js';
import { JoinMany } from '../join-many.operation.js';
import { JoinThrough } from '../join-through.operation.js';
import { Operation } from '../operation.js';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { IClientReportsModel, clientReportsModelSpec } from './models/client-report.model.js';
import { IPersonModel } from './models/person.model.js';
import { IEmailAddressModel } from './models/email-address.model.js';
import { IPhoneNumberModel } from './models/phone-number.model.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';

describe.skipIf(!isPostgres)('Join Operations - Complex Data Joining', () => {
    let database: PostgresDatabase;
    let client: Client;
    let testDatabase: TestPostgresDatabase;
    let personId: number;
    let clientId: number;
    let emailAddress1Id: number;
    let emailAddress2Id: number;
    let phoneNumber1Id: number;
    let phoneNumber2Id: number;

    beforeAll(async () => {
        setupTestConfig(false, 'postgres');
        
        // Initialize test database
        testDatabase = new TestPostgresDatabase();
        const db = await testDatabase.init();
        database = db as PostgresDatabase;
        
        // Get the underlying PostgreSQL client for direct queries
        // We need direct access to insert into join tables
        client = (testDatabase as any).postgresClient as Client;

        // Clean up any existing test data first (in case of previous failed test runs)
        await client.query(`DELETE FROM persons_phone_numbers WHERE person_id IN (SELECT _id FROM persons WHERE first_name = $1)`, ['John']);
        await client.query(`DELETE FROM email_addresses WHERE email_address IN ($1, $2)`, ['john.doe@example.com', 'john.m.doe@example.com']);
        await client.query(`DELETE FROM phone_numbers WHERE phone_number IN ($1, $2)`, ['555-0100', '555-0200']);
        await client.query(`DELETE FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name = $1)`, ['John']);
        await client.query(`DELETE FROM persons WHERE first_name = $1`, ['John']);

        // Create test data
        // 1. Create a person
        const personResult = await client.query(`
            INSERT INTO persons (first_name, middle_name, last_name, is_client, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, $4, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['John', 'Michael', 'Doe', true]);
        personId = personResult.rows[0]._id;

        // 2. Create a client linked to the person
        const clientResult = await client.query(`
            INSERT INTO clients (person_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [personId]);
        clientId = clientResult.rows[0]._id;

        // 3. Create email addresses for the person
        const email1Result = await client.query(`
            INSERT INTO email_addresses (person_id, email_address, is_default, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [personId, 'john.doe@example.com', true]);
        emailAddress1Id = email1Result.rows[0]._id;

        const email2Result = await client.query(`
            INSERT INTO email_addresses (person_id, email_address, is_default, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [personId, 'john.m.doe@example.com', false]);
        emailAddress2Id = email2Result.rows[0]._id;

        // 4. Create phone numbers
        const phone1Result = await client.query(`
            INSERT INTO phone_numbers (phone_number, phone_number_type, is_default, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['555-0100', 'mobile', true]);
        phoneNumber1Id = phone1Result.rows[0]._id;

        const phone2Result = await client.query(`
            INSERT INTO phone_numbers (phone_number, phone_number_type, is_default, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['555-0200', 'home', false]);
        phoneNumber2Id = phone2Result.rows[0]._id;

        // 5. Link phone numbers to person via join table
        await client.query(`
            INSERT INTO persons_phone_numbers (person_id, phone_number_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [personId, phoneNumber1Id]);

        await client.query(`
            INSERT INTO persons_phone_numbers (person_id, phone_number_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [personId, phoneNumber2Id]);
    });

    afterAll(async () => {
        // Clean up test data before closing database connection
        if (client) {
            try {
                await client.query(`DELETE FROM persons_phone_numbers WHERE person_id IN (SELECT _id FROM persons WHERE first_name = $1)`, ['John']);
                await client.query(`DELETE FROM email_addresses WHERE email_address IN ($1, $2)`, ['john.doe@example.com', 'john.m.doe@example.com']);
                await client.query(`DELETE FROM phone_numbers WHERE phone_number IN ($1, $2)`, ['555-0100', '555-0200']);
                await client.query(`DELETE FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name = $1)`, ['John']);
                await client.query(`DELETE FROM persons WHERE first_name = $1`, ['John']);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        
        if (testDatabase) {
            await testDatabase.cleanup();
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
        const joinPhoneNumbers = new JoinThrough(
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
        const result = await database.getById<IClientReportsModel>(
            operations,
            queryOptions,
            clientId,
            'clients'
        );

        // Verify the result structure
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!._id).toBe(clientId);
        expect(result!.person).toBeDefined();
        expect(result!.person._id).toBe(personId);
        expect(result!.person.first_name).toBe('John');
        expect(result!.person.middle_name).toBe('Michael');
        expect(result!.person.last_name).toBe('Doe');

        // Verify email addresses array
        expect(result!.person.email_addresses).toBeDefined();
        expect(Array.isArray(result!.person.email_addresses)).toBe(true);
        expect(result!.person.email_addresses.length).toBe(2);
        
        // Verify email addresses content
        const emailAddresses = result!.person.email_addresses as IEmailAddressModel[];
        const email1 = emailAddresses.find(e => e.email_address === 'john.doe@example.com');
        const email2 = emailAddresses.find(e => e.email_address === 'john.m.doe@example.com');
        
        expect(email1).toBeDefined();
        expect(email1!.person_id).toBe(personId);
        expect(email1!.is_default).toBe(true);
        
        expect(email2).toBeDefined();
        expect(email2!.person_id).toBe(personId);
        expect(email2!.is_default).toBe(false);

        // Verify phone numbers array
        expect(result!.person.phone_numbers).toBeDefined();
        expect(Array.isArray(result!.person.phone_numbers)).toBe(true);
        expect(result!.person.phone_numbers.length).toBe(2);
        
        // Verify phone numbers content
        const phoneNumbers = result!.person.phone_numbers as IPhoneNumberModel[];
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
        const joinPhoneNumbers = new JoinThrough(
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

        const result = await database.get<IClientReportsModel>(
            operations,
            queryOptions,
            clientReportsModelSpec,
            'clients'
        );

        // Verify paginated result
        expect(result).toBeDefined();
        expect(result.entities).toBeDefined();
        expect(result.entities!.length).toBeGreaterThan(0);
        expect(result.total).toBeGreaterThan(0);

        // Verify first entity has proper structure
        const firstEntity = result.entities![0];
        expect(firstEntity.person).toBeDefined();
        expect(firstEntity.person.email_addresses).toBeDefined();
        expect(Array.isArray(firstEntity.person.email_addresses)).toBe(true);
        expect(firstEntity.person.phone_numbers).toBeDefined();
        expect(Array.isArray(firstEntity.person.phone_numbers)).toBe(true);
    });

    it('should handle getAll() query with joins', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');
        const joinPhoneNumbers = new JoinThrough(
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
        const results = await database.getAll<IClientReportsModel>(
            operations,
            'clients'
        );

        // Verify results
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        // Verify first result has proper structure
        const firstResult = results[0];
        expect(firstResult.person).toBeDefined();
        expect(firstResult.person.email_addresses).toBeDefined();
        expect(Array.isArray(firstResult.person.email_addresses)).toBe(true);
        expect(firstResult.person.phone_numbers).toBeDefined();
        expect(Array.isArray(firstResult.person.phone_numbers)).toBe(true);
    });

    it('should handle empty arrays when no related records exist', async () => {
        // Create a person without email addresses or phone numbers
        const personResult = await client.query(`
            INSERT INTO persons (first_name, last_name, is_client, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Jane', 'Smith', true]);
        const newPersonId = personResult.rows[0]._id;

        const clientResult = await client.query(`
            INSERT INTO clients (person_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [newPersonId]);
        const newClientId = clientResult.rows[0]._id;

        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');
        const joinPhoneNumbers = new JoinThrough(
            'phone_numbers',
            'persons_phone_numbers',
            'person._id',
            'person_id',
            'phone_number_id',
            '_id',
            'phone_numbers'
        );

        const operations: Operation[] = [joinPerson, joinEmailAddresses, joinPhoneNumbers];

        // Query the new client
        const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
        const result = await database.getById<IClientReportsModel>(
            operations,
            queryOptions,
            newClientId,
            'clients'
        );

        // Verify empty arrays are returned
        expect(result).toBeDefined();
        expect(result!.person).toBeDefined();
        expect(result!.person.email_addresses).toBeDefined();
        expect(Array.isArray(result!.person.email_addresses)).toBe(true);
        expect(result!.person.email_addresses.length).toBe(0);
        expect(result!.person.phone_numbers).toBeDefined();
        expect(Array.isArray(result!.person.phone_numbers)).toBe(true);
        expect(result!.person.phone_numbers.length).toBe(0);
    });
});
