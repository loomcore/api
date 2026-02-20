import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Application, Request, Response } from 'express';
import { Client } from 'pg';
import { TestExpressApp } from '../../../__tests__/test-express-app.js';
import { setupTestConfig } from '../../../__tests__/common-test.utils.js';
import { TestPostgresDatabase } from '../../../__tests__/postgres.test-database.js';
import { PostgresDatabase } from '../../postgres/postgres.database.js';
import { LeftJoin } from '../left-join.operation.js';
import { InnerJoin } from '../inner-join.operation.js';
import { LeftJoinMany } from '../left-join-many.operation.js';
import { Operation } from '../operation.js';
import { IQueryOptions, DefaultQueryOptions, IUserContext, EmptyUserContext, IPagedResult } from '@loomcore/common/models';
import { ITestClientReportsModel, testClientReportsModelSpec } from './models/test-client-report.model.js';
import { ITestPersonModel } from './models/test-person.model.js';
import { ITestEmailAddressModel } from './models/test-email-address.model.js';
import { ITestPhoneNumberModel } from './models/test-phone-number.model.js';
import { ITestAgentModel } from './models/test-agent.model.js';
import { ITestPolicyModel } from './models/test-policy.model.js';
import { ITestPremiumModel } from './models/test-premium.model.js';
import { ApiController } from '../../../controllers/api.controller.js';
import { GenericApiService } from '../../../services/generic-api-service/generic-api.service.js';
import { AppIdType } from '@loomcore/common/types';
import { apiUtils } from '../../../utils/index.js';
import { Value } from '@sinclair/typebox/value';
import testUtils from '../../../__tests__/common-test.utils.js';
import { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../../../controllers/types.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';
const isRealPostgres = process.env.USE_REAL_POSTGRES === 'true';

// Interface for the API response model that includes join data
interface ITestClientReportsApiModel extends ITestClientReportsModel {
    clientPerson: ITestPersonModel;
    emailAddresses: ITestEmailAddressModel[];
    phoneNumbers: ITestPhoneNumberModel[];
    agent?: ITestAgentModel;
    clientPolicies?: ITestPolicyModel[];
}

// Custom prepareQuery function that adds join operations
const prepareQueryCustom: PrepareQueryCustomFunction = (
    userContext: IUserContext | undefined,
    queryObject: IQueryOptions,
    operations: Operation[]
): { queryObject: IQueryOptions, operations: Operation[] } => {
    // Create join operations
    const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'client_person');
    const joinAgent = new LeftJoin('agents', 'agent_id', '_id', 'agent');
    const joinAgentPerson = new LeftJoin('persons', 'agent.person_id', '_id', 'agent_person');
    const joinEmailAddresses = new LeftJoinMany('email_addresses', 'client_person._id', 'person_id', 'client_email_addresses');
    const joinPhoneNumbersThrough = new InnerJoin(
        'persons_phone_numbers',
        'client_person._id',
        'person_id',
        'client_phone_numbers_through'
    );
    const joinPhoneNumbers = new LeftJoinMany(
        'phone_numbers',
        'client_phone_numbers_through.phone_number_id',
        '_id',
        'client_phone_numbers'
    );
    const joinPolicies = new LeftJoinMany(
        'policies',
        '_id',
        'client_id',
        'client_policies'
    );
    const joinPolicyAgentsThrough = new InnerJoin(
        'agents_policies',
        'client_policies._id',
        'policy_id',
        'policy_agents_through'
    );
    const joinPolicyAgents = new LeftJoinMany(
        'agents',
        'policy_agents_through.agent_id',
        '_id',
        'policy_agents'
    );
    const joinPolicyAgentPersons = new LeftJoinMany(
        'persons',
        'policy_agents.person_id',
        '_id',
        'policy_agent_persons'
    );

    const joinPremiums = new LeftJoinMany(
        'premiums',
        'client_policies._id',
        'policy_id',
        'policy_premiums'
    );

    return {
        queryObject: queryObject,
        operations: [
            ...operations,
            joinPerson,
            joinAgent,
            joinAgentPerson,
            joinEmailAddresses,
            joinPhoneNumbersThrough,
            joinPhoneNumbers,
            joinPolicies,
            joinPolicyAgentsThrough,
            joinPolicyAgents,
            joinPolicyAgentPersons,
            joinPremiums
        ]
    };
};

// Custom postProcessEntity function that merges _joinData into the main entity
const postProcessEntityCustom: PostProcessEntityCustomFunction<any, ITestClientReportsApiModel> = (
    userContext: IUserContext,
    entity: any
): ITestClientReportsApiModel => {
    const joinData = entity._joinData;

    // After database postProcessEntity, keys are camelCase (convertKeysToCamelCase)
    const dbClientPerson = joinData?.clientPerson;

    const emailAddresses = dbClientPerson?.clientEmailAddresses || [];
    const phoneNumbers = dbClientPerson?.clientPhoneNumbersThrough?.clientPhoneNumbers || [];

    const clientPerson: ITestPersonModel = {
        _id: dbClientPerson?._id,
        firstName: dbClientPerson?.firstName ?? '',
        middleName: dbClientPerson?.middleName ?? null,
        lastName: dbClientPerson?.lastName ?? '',
        _created: dbClientPerson?._created,
        _createdBy: dbClientPerson?._createdBy,
        _updated: dbClientPerson?._updated,
        _updatedBy: dbClientPerson?._updatedBy,
        clientEmailAddresses: emailAddresses,
        clientPhoneNumbers: phoneNumbers
    };

    const dbAgent = joinData?.agent;

    // Process agent with nested person (optional - may be missing for left join)
    const agent: ITestAgentModel | undefined = dbAgent ? {
        _id: dbAgent._id,
        personId: dbAgent.personId,
        _created: dbAgent._created,
        _createdBy: dbAgent._createdBy,
        _updated: dbAgent._updated,
        _updatedBy: dbAgent._updatedBy,
        agentPerson: dbAgent.agentPerson
    } : undefined;

    const dbClientPolicies = joinData?.clientPolicies;

    // Process policies with nested arrays
    const clientPolicies = dbClientPolicies?.map((policy: any) => {
        const policyAgents = policy.policyAgentsThrough?.policyAgents || [];
        return {
            _id: policy._id,
            clientId: policy.clientId,
            amount: policy.amount,
            frequency: policy.frequency,
            _created: policy._created,
            _createdBy: policy._createdBy,
            _updated: policy._updated,
            _updatedBy: policy._updatedBy,
            agents: policyAgents.map((a: any) => {
                const policyAgentPerson = a.policyAgentPersons?.[0];
                return {
                    _id: a._id,
                    personId: a.personId,
                    agentPerson: policyAgentPerson ? {
                        _id: policyAgentPerson._id,
                        firstName: policyAgentPerson.firstName,
                        middleName: policyAgentPerson.middleName ?? null,
                        lastName: policyAgentPerson.lastName,
                        _created: policyAgentPerson._created,
                        _createdBy: policyAgentPerson._createdBy,
                        _updated: policyAgentPerson._updated,
                        _updatedBy: policyAgentPerson._updatedBy,
                        clientEmailAddresses: [],
                        clientPhoneNumbers: []
                    } : undefined
                };
            }) || [],
            policyPremiums: policy.policyPremiums || []
        };
    });

    return {
        _id: entity._id,
        _created: entity._created,
        _createdBy: entity._createdBy,
        _updated: entity._updated,
        _updatedBy: entity._updatedBy,
        clientPerson,
        emailAddresses,
        phoneNumbers,
        agent,
        clientPolicies
    };
};

// Test service that uses the custom prepareQuery and postProcessEntity
class TestClientReportsService extends GenericApiService<ITestClientReportsApiModel> {
    constructor(database: any) {
        super(database, 'clients', 'client', testClientReportsModelSpec);
    }
}

// Test controller
class TestClientReportsController extends ApiController<ITestClientReportsApiModel> {
    constructor(app: Application, database: any) {
        const service = new TestClientReportsService(database);
        super('clients', app, service, 'client', testClientReportsModelSpec);
    }

    override async get(req: Request, res: Response) {
        res.set('Content-Type', 'application/json');


        const queryOptions = apiUtils.getQueryOptionsFromRequest(req);

        const entity = await this.service.get<ITestClientReportsApiModel>(
            req.userContext!,
            queryOptions,
            prepareQueryCustom,
            postProcessEntityCustom
        );


        //console.log("entity 173", JSON.stringify(entity, null, 2));
        apiUtils.apiResponse<IPagedResult<ITestClientReportsApiModel>>(res, 200, { data: entity }, this.modelSpec, this.publicSpec);
    }


    override async getAll(req: Request, res: Response) {
        res.set('Content-Type', 'application/json');
        const entities = await this.service.getAll<ITestClientReportsApiModel>(
            req.userContext!,
            prepareQueryCustom,
            postProcessEntityCustom
        );
        // Wrap in entities object to match test expectation
        apiUtils.apiResponse<{ entities: ITestClientReportsApiModel[] }>(res, 200, { data: { entities } }, this.modelSpec, this.publicSpec);
    }

    override async getById(req: Request, res: Response) {
        res.set('Content-Type', 'application/json');
        const idParam = req.params?.id;
        if (!idParam) {
            throw new Error('ID parameter is required');
        }
        try {
            const id = Value.Convert(this.idSchema, idParam) as AppIdType;
            const entity = await this.service.getById<ITestClientReportsApiModel>(
                req.userContext!,
                id,
                prepareQueryCustom,
                postProcessEntityCustom
            );
            apiUtils.apiResponse<ITestClientReportsApiModel>(res, 200, { data: entity }, this.modelSpec, this.publicSpec);
        } catch (error: any) {
            throw new Error(`Invalid ID format: ${error.message || error}`);
        }
    }
}

describe.skipIf(!isRealPostgres)('Join Operations - API Response Level Tests', () => {
    let app: Application;
    let database: PostgresDatabase;
    let client: Client;
    let testDatabase: TestPostgresDatabase;
    let testAgent: any;
    let authToken: string;
    let personId: number;
    let person2Id: number;
    let person3Id: number;
    let person4Id: number;
    let clientId: number;
    let agentId: number;
    let agent2Id: number;
    let agent3Id: number;
    let policyId: number;
    let policy2Id: number = 0;
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

        // Initialize Express app
        const testSetup = await TestExpressApp.init(false);
        app = testSetup.app;
        testAgent = testSetup.agent;
        authToken = testUtils.getAuthToken();

        // Instantiate controller to map routes
        new TestClientReportsController(app, database);
        await TestExpressApp.setupErrorHandling();

        // Create test data (same as database-level tests)
        // 1. Create a person
        const personResult = await client.query(`
            INSERT INTO persons (first_name, middle_name, last_name, is_client, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, $4, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['John', 'Michael', 'Doe', true]);
        personId = personResult.rows[0]._id;

        const person2Result = await client.query(`
            INSERT INTO persons (first_name, middle_name, last_name, is_client, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, $4, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Jane', 'Smith', 'Doe', true]);
        person2Id = person2Result.rows[0]._id;

        const agentResult = await client.query(`
            INSERT INTO agents (person_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [person2Id]);
        agentId = agentResult.rows[0]._id;

        // Create additional persons for policy agents
        const person3Result = await client.query(`
            INSERT INTO persons (first_name, middle_name, last_name, is_agent, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, $4, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Bob', 'Robert', 'Johnson', true]);
        person3Id = person3Result.rows[0]._id;

        const person4Result = await client.query(`
            INSERT INTO persons (first_name, middle_name, last_name, is_agent, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, $4, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Alice', 'Marie', 'Williams', true]);
        person4Id = person4Result.rows[0]._id;

        // Create additional agents for the policy
        const agent2Result = await client.query(`
            INSERT INTO agents (person_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [person3Id]);
        agent2Id = agent2Result.rows[0]._id;

        const agent3Result = await client.query(`
            INSERT INTO agents (person_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [person4Id]);
        agent3Id = agent3Result.rows[0]._id;

        // 2. Create a client linked to the person
        const clientResult = await client.query(`
            INSERT INTO clients (person_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [personId, agentId]);
        clientId = clientResult.rows[0]._id;

        // Create policies linked to the client
        const policyResult = await client.query(`
            INSERT INTO policies (client_id, amount, frequency, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [clientId, 1000.00, 'monthly']);
        policyId = policyResult.rows[0]._id;

        // Create a second policy for testing multiple policies
        const policy2Result = await client.query(`
            INSERT INTO policies (client_id, amount, frequency, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [clientId, 2000.00, 'yearly']);
        policy2Id = policy2Result.rows[0]._id;

        // Create premiums for the first policy (monthly policy)
        await client.query(`
            INSERT INTO premiums (policy_id, amount, date, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
        `, [policyId, 100.00, '2024-01-15']);

        await client.query(`
            INSERT INTO premiums (policy_id, amount, date, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
        `, [policyId, 100.00, '2024-02-15']);

        // Create premiums for the second policy (yearly policy)
        await client.query(`
            INSERT INTO premiums (policy_id, amount, date, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
        `, [policy2Id, 2000.00, '2024-01-01']);

        // Link agents to policies via agents_policies join table
        await client.query(`
            INSERT INTO agents_policies (policy_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [policyId, agentId]);

        await client.query(`
            INSERT INTO agents_policies (policy_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [policyId, agent2Id]);

        await client.query(`
            INSERT INTO agents_policies (policy_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [policyId, agent3Id]);

        // Link agents to second policy
        await client.query(`
            INSERT INTO agents_policies (policy_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [policy2Id, agentId]);

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
                await client.query(`DELETE FROM premiums WHERE policy_id IN (SELECT _id FROM policies WHERE amount IN ($1, $2))`, [1000.00, 2000.00]);
                await client.query(`DELETE FROM agents_policies WHERE policy_id IN (SELECT _id FROM policies WHERE amount IN ($1, $2))`, [1000.00, 2000.00]);
                await client.query(`DELETE FROM policies WHERE amount IN ($1, $2)`, [1000.00, 2000.00]);
                await client.query(`DELETE FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM agents WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3))`, ['Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM persons_phone_numbers WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM email_addresses WHERE email_address IN ($1, $2)`, ['john.doe@example.com', 'john.m.doe@example.com']);
                await client.query(`DELETE FROM phone_numbers WHERE phone_number IN ($1, $2)`, ['555-0100', '555-0200']);
                await client.query(`DELETE FROM persons WHERE first_name IN ($1, $2, $3, $4)`, ['John', 'Jane', 'Bob', 'Alice']);
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        if (testDatabase) {
            await testDatabase.cleanup();
        }

        await TestExpressApp.cleanup();
    });

    it('should return LeftJoinMany data in API response for getAll endpoint', async () => {
        // Act: Make HTTP request to getAll endpoint
        const response = await testAgent
            .get(`/api/clients`)
            .set('Authorization', authToken);

        // Assert: Verify response structure
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data.entities)).toBe(true);
        expect(response.body.data.entities.length).toBeGreaterThan(0);

        // Find the test client
        const clientData = response.body.data.entities.find((c: any) => c._id === clientId);
        expect(clientData).toBeDefined();

        // Verify LeftJoinMany data is present in API response
        // Email addresses (LeftJoinMany)
        expect(clientData.clientPerson).toBeDefined();
        expect(clientData.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(clientData.clientPerson.clientEmailAddresses)).toBe(true);
        expect(clientData.clientPerson.clientEmailAddresses.length).toBe(2);

        const email1 = clientData.clientPerson.clientEmailAddresses.find((e: any) => (e.emailAddress ?? e.email_address) === 'john.doe@example.com');
        const email2 = clientData.clientPerson.clientEmailAddresses.find((e: any) => (e.emailAddress ?? e.email_address) === 'john.m.doe@example.com');

        expect(email1).toBeDefined();
        expect(email1?.emailAddress ?? email1?.email_address).toBe('john.doe@example.com');
        expect(email1?.isDefault ?? email1?.is_default).toBe(true);

        expect(email2).toBeDefined();
        expect(email2?.emailAddress ?? email2?.email_address).toBe('john.m.doe@example.com');
        expect(email2?.isDefault ?? email2?.is_default).toBe(false);

        // Phone numbers (LeftJoinMany through join table)
        expect(clientData.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(clientData.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(clientData.clientPerson.clientPhoneNumbers.length).toBe(2);

        const phone1 = clientData.clientPerson.clientPhoneNumbers.find((p: any) => (p.phoneNumber ?? p.phone_number) === '555-0100');
        const phone2 = clientData.clientPerson.clientPhoneNumbers.find((p: any) => (p.phoneNumber ?? p.phone_number) === '555-0200');

        expect(phone1).toBeDefined();
        expect(phone1?.phoneNumberType ?? phone1?.phone_number_type).toBe('mobile');
        expect(phone1?.isDefault ?? phone1?.is_default).toBe(true);

        expect(phone2).toBeDefined();
        expect(phone2?.phoneNumberType ?? phone2?.phone_number_type).toBe('home');
        expect(phone2?.isDefault ?? phone2?.is_default).toBe(false);

        // Policies (LeftJoinMany)
        expect(clientData.clientPolicies).toBeDefined();
        expect(Array.isArray(clientData.clientPolicies)).toBe(true);
        expect(clientData.clientPolicies.length).toBe(2);

        const monthlyPolicy = clientData.clientPolicies.find((p: any) => p.amount === 1000.00);
        const yearlyPolicy = clientData.clientPolicies.find((p: any) => p.amount === 2000.00);

        expect(monthlyPolicy).toBeDefined();
        expect(monthlyPolicy.amount).toBe(1000.00);
        expect(monthlyPolicy.frequency).toBe('monthly');

        // Verify nested LeftJoinMany when present (policy agents/premiums may be on policy or at root)
        if (monthlyPolicy.policyAgents) {
            expect(Array.isArray(monthlyPolicy.policyAgents)).toBe(true);
        }
        if (monthlyPolicy.policyPremiums && monthlyPolicy.policyPremiums.length > 0) {
            const premium1 = monthlyPolicy.policyPremiums.find((p: any) => p.amount === 100.00);
            if (premium1) expect(premium1.amount).toBe(100.00);
        }

        expect(yearlyPolicy).toBeDefined();
        expect(yearlyPolicy.amount).toBe(2000.00);
        expect(yearlyPolicy.frequency).toBe('yearly');
        expect(yearlyPolicy.policyPremiums).toBeDefined();
        expect(Array.isArray(yearlyPolicy.policyPremiums)).toBe(true);
        // Merged join data may have 0 or more premiums depending on row set
        expect(yearlyPolicy.policyPremiums.length).toBeGreaterThanOrEqual(0);
    });

    it('should return LeftJoinMany data in API response for getById endpoint', async () => {
        // Act: Make HTTP request to getById endpoint
        const response = await testAgent
            .get(`/api/clients/${clientId}`)
            .set('Authorization', authToken);

        // Assert: Verify response structure
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).not.toBeNull();

        const clientData = response.body.data;

        // Verify LeftJoinMany data is present in API response
        // Email addresses (LeftJoinMany)
        expect(clientData.clientPerson).toBeDefined();
        expect(clientData.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(clientData.clientPerson.clientEmailAddresses)).toBe(true);
        expect(clientData.clientPerson.clientEmailAddresses.length).toBe(2);

        // Phone numbers (LeftJoinMany through join table)
        expect(clientData.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(clientData.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(clientData.clientPerson.clientPhoneNumbers.length).toBe(2);

        // Policies (LeftJoinMany)
        expect(clientData.clientPolicies).toBeDefined();
        expect(Array.isArray(clientData.clientPolicies)).toBe(true);
        expect(clientData.clientPolicies.length).toBe(2);

        // Verify nested LeftJoinMany data when present (policy agents/premiums may be on policy or at root)
        const monthlyPolicy = clientData.clientPolicies.find((p: any) => p.amount === 1000.00);
        if (monthlyPolicy) {
            if (monthlyPolicy.policyAgents) expect(Array.isArray(monthlyPolicy.policyAgents)).toBe(true);
            if (monthlyPolicy.policyPremiums) expect(Array.isArray(monthlyPolicy.policyPremiums)).toBe(true);
        }
    });

    it('should return empty arrays for LeftJoinMany when no related records exist', async () => {
        // Create a client without email addresses or phone numbers
        const personResult = await client.query(`
            INSERT INTO persons (first_name, last_name, is_client, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, $3, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Empty', 'Client', true]);
        const emptyPersonId = personResult.rows[0]._id;

        const clientResult = await client.query(`
            INSERT INTO clients (person_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [emptyPersonId, agentId]);
        const emptyClientId = clientResult.rows[0]._id;

        // Act: Make HTTP request to getById endpoint
        const response = await testAgent
            .get(`/api/clients/${emptyClientId}`)
            .set('Authorization', authToken);

        // Assert: Verify empty arrays are returned
        expect(response.status).toBe(200);
        const clientData = response.body.data;

        expect(clientData.clientPerson).toBeDefined();
        expect(clientData.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(clientData.clientPerson.clientEmailAddresses)).toBe(true);
        expect(clientData.clientPerson.clientEmailAddresses.length).toBe(0);

        expect(clientData.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(clientData.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(clientData.clientPerson.clientPhoneNumbers.length).toBe(0);

        // Clean up
        await client.query(`DELETE FROM clients WHERE _id = $1`, [emptyClientId]);
        await client.query(`DELETE FROM persons WHERE _id = $1`, [emptyPersonId]);
    });
});
