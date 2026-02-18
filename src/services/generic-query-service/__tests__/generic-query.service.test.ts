import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { TestPostgresDatabase } from '../../../__tests__/postgres.test-database.js';
import { setupTestConfig } from '../../../__tests__/common-test.utils.js';
import { PostgresDatabase } from '../../../databases/postgres/postgres.database.js';
import { LeftJoin } from '../../../databases/operations/left-join.operation.js';
import { LeftJoinMany } from '../../../databases/operations/left-join-many.operation.js';
import { InnerJoin } from '../../../databases/operations/inner-join.operation.js';
import { Operation } from '../../../databases/operations/operation.js';
import { IQueryOptions, DefaultQueryOptions, IUserContext } from '@loomcore/common/models';
import { GenericQueryService } from '../generic-query.service.js';
import { ITestClientReportsModel, testClientReportsModelSpec } from '../../../databases/operations/__tests__/models/test-client-report.model.js';
import { ITestPersonModel } from '../../../databases/operations/__tests__/models/test-person.model.js';
import { ITestEmailAddressModel } from '../../../databases/operations/__tests__/models/test-email-address.model.js';
import { ITestPhoneNumberModel } from '../../../databases/operations/__tests__/models/test-phone-number.model.js';
import { getTestMetaOrgUserContext } from '../../../__tests__/test-objects.js';
import { IdNotFoundError } from '../../../errors/index.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';
const isRealPostgres = process.env.USE_REAL_POSTGRES === 'true';

describe.skipIf(!isPostgres || !isRealPostgres)('GenericQueryService - Complex Data Fetching', () => {
    let database: PostgresDatabase;
    let client: Client;
    let testDatabase: TestPostgresDatabase;
    let service: GenericQueryService<ITestClientReportsModel>;
    let userContext: IUserContext;
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
        client = (testDatabase as any).postgresClient as Client;

        // Get user context for tests
        userContext = getTestMetaOrgUserContext();

        // Create default join operations for client-report
        const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
        const joinEmailAddresses = new LeftJoinMany('email_addresses', 'clientPerson._id', 'person_id', 'clientEmailAddresses');
        // Note: JoinThroughMany removed - would need to be replaced with InnerJoin + LeftJoinMany combination
        const joinPhoneNumbers = null; // TODO: Replace with InnerJoin + LeftJoinMany combination

        const defaultOperations: Operation[] = [joinPerson, joinEmailAddresses].filter(op => op !== null) as Operation[];

        // Create service instance
        service = new GenericQueryService<ITestClientReportsModel>(
            database,
            'clients',
            testClientReportsModelSpec,
            defaultOperations
        );

        // Clean up any existing test data first (in case of previous failed test runs)
        await client.query(`DELETE FROM persons_phone_numbers WHERE person_id IN (SELECT _id FROM persons WHERE first_name = $1)`, ['John']);
        await client.query(`DELETE FROM email_addresses WHERE email_address IN ($1, $2)`, ['john.doe@example.com', 'john.m.doe@example.com']);
        await client.query(`DELETE FROM phone_numbers WHERE phone_number IN ($1, $2)`, ['555-0100', '555-0200']);
        await client.query(`DELETE FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name = $1)`, ['John']);
        await client.query(`DELETE FROM persons WHERE first_name = $1`, ['John']);
    });

    beforeEach(async () => {
        // Clean up test data before each test
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

    describe('getById', () => {
        it('should fetch a client-report with all joins applied', async () => {
            const result = await service.getById(userContext, clientId);

            // Verify the result structure
            expect(result).toBeDefined();
            expect(result._id).toBe(clientId);
            expect(result.clientPerson).toBeDefined();
            expect(result.clientPerson._id).toBe(personId);
            expect(result.clientPerson.firstName).toBe('John');
            expect(result.clientPerson.middleName).toBe('Michael');
            expect(result.clientPerson.lastName).toBe('Doe');

            // Verify email addresses array
            expect(result.clientPerson.clientEmailAddresses).toBeDefined();
            expect(Array.isArray(result.clientPerson.clientEmailAddresses)).toBe(true);
            expect(result.clientPerson.clientEmailAddresses.length).toBe(2);

            // Verify email addresses content
            const emailAddresses = result.clientPerson.clientEmailAddresses as ITestEmailAddressModel[];
            const email1 = emailAddresses.find(e => e.emailAddress === 'john.doe@example.com');
            const email2 = emailAddresses.find(e => e.emailAddress === 'john.m.doe@example.com');

            expect(email1).toBeDefined();
            expect(email1!.personId).toBe(personId);
            expect(email1!.isDefault).toBe(true);

            expect(email2).toBeDefined();
            expect(email2!.personId).toBe(personId);
            expect(email2!.isDefault).toBe(false);

            // Verify phone numbers array
            expect(result.clientPerson.clientPhoneNumbers).toBeDefined();
            expect(Array.isArray(result.clientPerson.clientPhoneNumbers)).toBe(true);
            expect(result.clientPerson.clientPhoneNumbers.length).toBe(2);

            // Verify phone numbers content
            const phoneNumbers = result.clientPerson.clientPhoneNumbers as ITestPhoneNumberModel[];
            const phone1 = phoneNumbers.find(p => p.phoneNumber === '555-0100');
            const phone2 = phoneNumbers.find(p => p.phoneNumber === '555-0200');

            expect(phone1).toBeDefined();
            expect(phone1!.phoneNumberType).toBe('mobile');
            expect(phone1!.isDefault).toBe(true);

            expect(phone2).toBeDefined();
            expect(phone2!.phoneNumberType).toBe('home');
            expect(phone2!.isDefault).toBe(false);
        });

        it('should throw IdNotFoundError when client does not exist', async () => {
            const nonExistentId = 99999;

            await expect(service.getById(userContext, nonExistentId)).rejects.toThrow(IdNotFoundError);
        });
    });

    describe('get', () => {
        it('should fetch paginated client-reports with joins applied', async () => {
            const queryOptions: IQueryOptions = {
                ...DefaultQueryOptions,
                page: 1,
                pageSize: 10
            };

            const result = await service.get(userContext, queryOptions);

            // Verify paginated result
            expect(result).toBeDefined();
            expect(result.entities).toBeDefined();
            expect(result.entities!.length).toBeGreaterThan(0);
            expect(result.total).toBeGreaterThan(0);

            // Verify first entity has proper structure
            const firstEntity = result.entities![0];
            expect(firstEntity.clientPerson).toBeDefined();
            expect(firstEntity.clientPerson.clientEmailAddresses).toBeDefined();
            expect(Array.isArray(firstEntity.clientPerson.clientEmailAddresses)).toBe(true);
            expect(firstEntity.clientPerson.clientPhoneNumbers).toBeDefined();
            expect(Array.isArray(firstEntity.clientPerson.clientPhoneNumbers)).toBe(true);
        });

        it('should respect pagination options', async () => {
            const queryOptions: IQueryOptions = {
                ...DefaultQueryOptions,
                page: 1,
                pageSize: 1
            };

            const result = await service.get(userContext, queryOptions);

            expect(result.entities).toBeDefined();
            expect(result.entities!.length).toBeLessThanOrEqual(1);
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(1);
        });

        it('should respect sorting options', async () => {
            const queryOptions: IQueryOptions = {
                ...DefaultQueryOptions,
                orderBy: '_id',
                sortDirection: 'desc'
            };

            const result = await service.get(userContext, queryOptions);

            expect(result.entities).toBeDefined();
            if (result.entities!.length > 1) {
                // Verify descending order
                const ids = result.entities!.map(e => e._id as number);
                for (let i = 0; i < ids.length - 1; i++) {
                    expect(ids[i]).toBeGreaterThanOrEqual(ids[i + 1]);
                }
            }
        });
    });

    describe('getAll', () => {
        it('should fetch all client-reports with joins applied', async () => {
            const results = await service.getAll(userContext);

            // Verify results
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);

            // Verify first result has proper structure
            const firstResult = results[0];
            expect(firstResult.clientPerson).toBeDefined();
            expect(firstResult.clientPerson.clientEmailAddresses).toBeDefined();
            expect(Array.isArray(firstResult.clientPerson.clientEmailAddresses)).toBe(true);
            expect(firstResult.clientPerson.clientPhoneNumbers).toBeDefined();
            expect(Array.isArray(firstResult.clientPerson.clientPhoneNumbers)).toBe(true);
        });
    });

    describe('prepareQuery hook', () => {
        it('should allow overriding prepareQuery to add additional operations', async () => {
            // Create a service with a custom prepareQuery that adds operations dynamically
            class CustomQueryService extends GenericQueryService<ITestClientReportsModel> {
                override prepareQuery(userContext: IUserContext | undefined, queryOptions: IQueryOptions, operations: Operation[]): { queryOptions: IQueryOptions, operations: Operation[] } {
                    // Add join operations dynamically
                    const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
                    const additionalOps = [joinPerson, ...operations];
                    const { queryOptions: preparedOptions, operations: mergedOps } = super.prepareQuery(userContext, queryOptions, additionalOps);
                    return { queryOptions: preparedOptions, operations: mergedOps };
                }
            }

            const customService = new CustomQueryService(
                database,
                'clients',
                testClientReportsModelSpec,
                [] // No default operations
            );

            // Should work with joins added via prepareQuery override
            const result = await customService.getById(userContext, clientId);

            expect(result).toBeDefined();
            expect(result._id).toBe(clientId);
            // Person should be populated due to prepareQuery override
            expect(result.clientPerson).toBeDefined();
            expect(result.clientPerson._id).toBe(personId);
        });
    });

    describe('prepareQueryOptions hook', () => {
        it('should allow overriding prepareQueryOptions to modify query options', async () => {
            class CustomQueryService extends GenericQueryService<ITestClientReportsModel> {
                override prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: IQueryOptions): IQueryOptions {
                    const prepared = super.prepareQueryOptions(userContext, queryOptions);
                    // Add a filter
                    prepared.filters = {
                        ...prepared.filters,
                        _id: { eq: clientId }
                    };
                    return prepared;
                }
            }

            const customService = new CustomQueryService(
                database,
                'clients',
                testClientReportsModelSpec,
                []
            );

            const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
            const result = await customService.get(userContext, queryOptions);

            // Should only return the client with the filtered ID
            expect(result.entities).toBeDefined();
            expect(result.entities!.length).toBeGreaterThan(0);
            expect(result.entities!.every(r => r._id === clientId)).toBe(true);
        });
    });

    describe('postProcessEntity hook', () => {
        it('should allow overriding postProcessEntity to transform entities', async () => {
            class CustomQueryService extends GenericQueryService<ITestClientReportsModel> {
                override postProcessEntity(userContext: IUserContext, entity: ITestClientReportsModel): ITestClientReportsModel {
                    const processed = super.postProcessEntity(userContext, entity);
                    // Add a custom property
                    (processed as any).customProperty = 'custom-value';
                    return processed;
                }
            }

            const customService = new CustomQueryService(
                database,
                'clients',
                testClientReportsModelSpec,
                []
            );

            const result = await customService.getById(userContext, clientId);

            expect(result).toBeDefined();
            expect((result as any).customProperty).toBe('custom-value');
        });
    });

    describe('edge cases', () => {
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

            const result = await service.getById(userContext, newClientId);

            // Verify empty arrays are returned
            expect(result).toBeDefined();
            expect(result.clientPerson).toBeDefined();
            expect(result.clientPerson.clientEmailAddresses).toBeDefined();
            expect(Array.isArray(result.clientPerson.clientEmailAddresses)).toBe(true);
            expect(result.clientPerson.clientEmailAddresses.length).toBe(0);
            expect(result.clientPerson.clientPhoneNumbers).toBeDefined();
            expect(Array.isArray(result.clientPerson.clientPhoneNumbers)).toBe(true);
            expect(result.clientPerson.clientPhoneNumbers.length).toBe(0);
        });

        it('should work with service that has no default operations', async () => {
            const serviceWithoutDefaults = new GenericQueryService<ITestClientReportsModel>(
                database,
                'clients',
                testClientReportsModelSpec,
                [] // No default operations
            );

            // Should still work but without joins
            const result = await serviceWithoutDefaults.getById(userContext, clientId);

            expect(result).toBeDefined();
            expect(result._id).toBe(clientId);
            // Without joins, person won't be populated - just verify basic structure
            expect(result).toHaveProperty('_id');
        });
    });
});
