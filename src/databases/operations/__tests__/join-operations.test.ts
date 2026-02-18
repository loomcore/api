import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { TestPostgresDatabase } from '../../../__tests__/postgres.test-database.js';
import { setupTestConfig } from '../../../__tests__/common-test.utils.js';
import { PostgresDatabase } from '../../postgres/postgres.database.js';
import { LeftJoin } from '../left-join.operation.js';
import { InnerJoin } from '../inner-join.operation.js';
import { LeftJoinMany } from '../left-join-many.operation.js';
import { Operation } from '../operation.js';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { ITestClientReportsModel, testClientReportsModelSpec } from './models/test-client-report.model.js';
import { ITestPersonModel } from './models/test-person.model.js';
import { ITestEmailAddressModel } from './models/test-email-address.model.js';
import { ITestPhoneNumberModel } from './models/test-phone-number.model.js';
import { ITestAgentModel } from './models/test-agent.model.js';
import { ITestPolicyModel } from './models/test-policy.model.js';
import { ITestPremiumModel } from './models/test-premium.model.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';
const isRealPostgres = process.env.USE_REAL_POSTGRES === 'true';

describe.skipIf(!isPostgres)('Join Operations - Complex Data Joining', () => {
    let database: PostgresDatabase;
    let client: Client;
    let testDatabase: TestPostgresDatabase;
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
    let schoolId: number;
    let districtId: number;
    let stateId: number;

    beforeAll(async () => {
        setupTestConfig(false, 'postgres');

        // Initialize test database
        testDatabase = new TestPostgresDatabase();
        const db = await testDatabase.init();
        database = db as PostgresDatabase;

        // Get the underlying PostgreSQL client for direct queries
        // We need direct access to insert into join tables
        client = (testDatabase as any).postgresClient as Client;

        // Create test data
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

        // 6. Create state, district, school, and link person to school
        const stateResult = await client.query(`
            INSERT INTO states (name, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Test State']);
        stateId = stateResult.rows[0]._id;

        const districtResult = await client.query(`
            INSERT INTO districts (name, state_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Test School District', stateId]);
        districtId = districtResult.rows[0]._id;

        const schoolResult = await client.query(`
            INSERT INTO schools (name, district_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, ['Test High School', districtId]);
        schoolId = schoolResult.rows[0]._id;

        // Link person to school via join table
        await client.query(`
            INSERT INTO persons_schools (person_id, school_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [personId, schoolId]);
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
                await client.query(`DELETE FROM persons_schools WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM persons_phone_numbers WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM email_addresses WHERE email_address IN ($1, $2)`, ['john.doe@example.com', 'john.m.doe@example.com']);
                await client.query(`DELETE FROM phone_numbers WHERE phone_number IN ($1, $2)`, ['555-0100', '555-0200']);
                await client.query(`DELETE FROM schools WHERE name = $1`, ['Test High School']);
                await client.query(`DELETE FROM districts WHERE name = $1`, ['Test School District']);
                await client.query(`DELETE FROM states WHERE name = $1`, ['Test State']);
                await client.query(`DELETE FROM persons WHERE first_name IN ($1, $2, $3, $4)`, ['John', 'Jane', 'Bob', 'Alice']);
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        if (testDatabase) {
            await testDatabase.cleanup();
        }
    });

    it.skip('should build a client-report using all join operation types', async () => {
        // Create join operations
        // 1. One-to-one: clients -> persons
        const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');

        // 2. One-to-one: clients -> agents
        const joinAgent = new LeftJoin('agents', 'agent_id', '_id', 'agent');

        // 3. One-to-one: agent -> persons (nested join)
        const joinAgentPerson = new LeftJoin('persons', 'agent.person_id', '_id', 'agentPerson');

        // 4. Many-to-one: persons -> email_addresses (returns array)
        // Note: localField uses "person._id" to reference the joined person table, not the main clients table
        const joinEmailAddresses = new LeftJoinMany('email_addresses', 'clientPerson._id', 'person_id', 'clientEmailAddresses');

        // 5. Many-to-many via join table: persons -> persons_phone_numbers -> phone_numbers (returns array)
        // Note: localField uses "person._id" to reference the joined person table, not the main clients table
        const joinPhoneNumbersThrough = new InnerJoin(
            'persons_phone_numbers',   // join table
            'clientPerson._id',       // local field (clientPerson._id) - references joined person table
            'person_id',               // join table local field
            'clientPhoneNumbers_through' // alias for through table
        );
        const joinPhoneNumbers = new LeftJoinMany(
            'phone_numbers',           // final table
            'clientPhoneNumbers_through.phone_number_id', // local field from through table
            '_id',                     // foreign field (phone_number._id)
            'clientPhoneNumbers'     // alias
        );

        // 6. Many-to-one: clients -> policies (returns array)
        const joinPolicies = new LeftJoinMany(
            'policies',                // final table
            '_id',                     // local field (clients._id)
            'client_id',               // foreign field (policy.client_id)
            'clientPolicies'         // alias
        );

        // 7. Many-to-many via join table: policies -> agents_policies -> agents (returns array)
        const joinPolicyAgentsThrough = new InnerJoin(
            'agents_policies',         // join table
            'clientPolicies._id',     // local field (clientPolicies._id) - references joined policies array
            'policy_id',               // join table local field
            'policyAgents_through'    // alias for through table
        );
        const joinPolicyAgents = new LeftJoinMany(
            'agents',                  // final table
            'policyAgents_through.agent_id', // local field from through table
            '_id',                     // foreign field (agent._id)
            'policyAgents'            // alias (nested under each policy, different from top-level 'agents')
        );

        // 8. Many-to-one: policies -> premiums (returns array)
        const joinPremiums = new LeftJoinMany(
            'premiums',                // final table
            'clientPolicies._id',     // local field (clientPolicies._id) - references joined policies array
            'policy_id',               // foreign field (premium.policy_id)
            'policyPremiums'          // alias
        );

        // Note: Person joins for agents nested in policies are handled in the SQL enrichment
        // We'll need to update build-join-clauses to handle this case
        const operations: Operation[] = [joinPerson, joinAgent, joinAgentPerson, joinEmailAddresses, joinPhoneNumbersThrough, joinPhoneNumbers, joinPolicies, joinPolicyAgentsThrough, joinPolicyAgents, joinPremiums];

        // Query using getById
        const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
        const result = await database.getById<ITestClientReportsModel>(
            operations,
            queryOptions,
            clientId,
            'clients'
        );

        // Verify the result structure
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!._id).toBe(clientId);
        expect(result!.clientPerson).toBeDefined();
        expect(result!.clientPerson._id).toBe(personId);
        expect(result!.clientPerson.firstName).toBe('John');
        expect(result!.clientPerson.middleName).toBe('Michael');
        expect(result!.clientPerson.lastName).toBe('Doe');

        // Verify email addresses array
        expect(result!.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(result!.clientPerson.clientEmailAddresses)).toBe(true);
        expect(result!.clientPerson.clientEmailAddresses.length).toBe(2);

        // Verify email addresses content
        const emailAddresses = result!.clientPerson.clientEmailAddresses as ITestEmailAddressModel[];
        const email1 = emailAddresses.find(e => e.emailAddress === 'john.doe@example.com');
        const email2 = emailAddresses.find(e => e.emailAddress === 'john.m.doe@example.com');

        expect(email1).toBeDefined();
        expect(email1!.personId).toBe(personId);
        expect(email1!.isDefault).toBe(true);

        expect(email2).toBeDefined();
        expect(email2!.personId).toBe(personId);
        expect(email2!.isDefault).toBe(false);

        // Verify phone numbers array
        expect(result!.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(result!.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(result!.clientPerson.clientPhoneNumbers.length).toBe(2);

        // Verify phone numbers content
        const phoneNumbers = result!.clientPerson.clientPhoneNumbers as ITestPhoneNumberModel[];
        const phone1 = phoneNumbers.find(p => p.phoneNumber === '555-0100');
        const phone2 = phoneNumbers.find(p => p.phoneNumber === '555-0200');

        expect(phone1).toBeDefined();
        expect(phone1!.phoneNumberType).toBe('mobile');
        expect(phone1!.isDefault).toBe(true);

        expect(phone2).toBeDefined();
        expect(phone2!.phoneNumberType).toBe('home');
        expect(phone2!.isDefault).toBe(false);

        // Verify agent
        expect(result!.agent).toBeDefined();
        expect(result!.agent!._id).toBe(agentId);
        expect(result!.agent!.personId).toBe(person2Id);
        expect(result!.agent!.agentPerson).toBeDefined();
        expect(result!.agent!.agentPerson!._id).toBe(person2Id);
        expect(result!.agent!.agentPerson!.firstName).toBe('Jane');
        expect(result!.agent!.agentPerson!.middleName).toBe('Smith');
        expect(result!.agent!.agentPerson!.lastName).toBe('Doe');

        // Verify policies array
        expect(result!.clientPolicies).toBeDefined();
        expect(Array.isArray(result!.clientPolicies)).toBe(true);
        expect(result!.clientPolicies!.length).toBe(2);

        // Verify first policy (monthly policy)
        const policies = result!.clientPolicies as ITestPolicyModel[];
        const monthlyPolicy = policies.find(p => p.amount === 1000.00);
        const yearlyPolicy = policies.find(p => p.amount === 2000.00);

        expect(monthlyPolicy).toBeDefined();
        expect(monthlyPolicy!._id).toBe(policyId);
        expect(monthlyPolicy!.amount).toBe(1000.00);
        expect(monthlyPolicy!.frequency).toBe('monthly');

        // Verify monthly policy agents array
        expect(monthlyPolicy!.agents).toBeDefined();
        expect(Array.isArray(monthlyPolicy!.agents)).toBe(true);
        expect(monthlyPolicy!.agents!.length).toBe(3);

        const monthlyPolicyAgents = monthlyPolicy!.agents as ITestAgentModel[];
        const agent1 = monthlyPolicyAgents.find(a => a.personId === person2Id);
        const agent2 = monthlyPolicyAgents.find(a => a.personId === person3Id);
        const agent3 = monthlyPolicyAgents.find(a => a.personId === person4Id);

        expect(agent1).toBeDefined();
        expect(agent1!.agentPerson).toBeDefined();
        expect(agent1!.agentPerson!.firstName).toBe('Jane');
        expect(agent1!.agentPerson!.lastName).toBe('Doe');

        expect(agent2).toBeDefined();
        expect(agent2!.agentPerson).toBeDefined();
        expect(agent2!.agentPerson!.firstName).toBe('Bob');
        expect(agent2!.agentPerson!.lastName).toBe('Johnson');

        expect(agent3).toBeDefined();
        expect(agent3!.agentPerson).toBeDefined();
        expect(agent3!.agentPerson!.firstName).toBe('Alice');
        expect(agent3!.agentPerson!.lastName).toBe('Williams');

        // Verify monthly policy premiums array
        expect(monthlyPolicy!.policyPremiums).toBeDefined();
        expect(Array.isArray(monthlyPolicy!.policyPremiums)).toBe(true);
        expect(monthlyPolicy!.policyPremiums!.length).toBe(2);

        const monthlyPolicyPremiums = monthlyPolicy!.policyPremiums as ITestPremiumModel[];
        const premium1 = monthlyPolicyPremiums.find(p => p.amount === 100.00 && String(p.date).startsWith('2024-01-15'));
        const premium2 = monthlyPolicyPremiums.find(p => p.amount === 100.00 && String(p.date).startsWith('2024-02-15'));

        expect(premium1).toBeDefined();
        expect(premium1!.policyId).toBe(policyId);
        expect(premium1!.amount).toBe(100.00);

        expect(premium2).toBeDefined();
        expect(premium2!.policyId).toBe(policyId);
        expect(premium2!.amount).toBe(100.00);

        // Verify second policy (yearly policy)
        expect(yearlyPolicy).toBeDefined();
        expect(yearlyPolicy!.amount).toBe(2000.00);
        expect(yearlyPolicy!.frequency).toBe('yearly');

        // Verify yearly policy agents array
        expect(yearlyPolicy!.agents).toBeDefined();
        expect(Array.isArray(yearlyPolicy!.agents)).toBe(true);
        expect(yearlyPolicy!.agents!.length).toBe(1);

        const yearlyPolicyAgents = yearlyPolicy!.agents as ITestAgentModel[];
        const yearlyAgent1 = yearlyPolicyAgents.find(a => a.personId === person2Id);
        expect(yearlyAgent1).toBeDefined();
        expect(yearlyAgent1!.agentPerson).toBeDefined();
        expect(yearlyAgent1!.agentPerson!.firstName).toBe('Jane');
        expect(yearlyAgent1!.agentPerson!.lastName).toBe('Doe');

        // Verify yearly policy premiums array
        expect(yearlyPolicy!.policyPremiums).toBeDefined();
        expect(Array.isArray(yearlyPolicy!.policyPremiums)).toBe(true);
        expect(yearlyPolicy!.policyPremiums!.length).toBe(1);

        const yearlyPolicyPremiums = yearlyPolicy!.policyPremiums as ITestPremiumModel[];
        const yearlyPremium1 = yearlyPolicyPremiums.find(p => p.amount === 2000.00);
        expect(yearlyPremium1).toBeDefined();
        expect(yearlyPremium1!.policyId).toBe(policy2Id);
        expect(yearlyPremium1!.amount).toBe(2000.00);
        expect(String(yearlyPremium1!.date).startsWith('2024-01-01')).toBe(true);
    });

    it.skip('should handle get() query with joins and return paginated results', async () => {
        // Create join operations
        const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
        const joinAgent = new LeftJoin('agents', 'agent_id', '_id', 'agent');
        const joinAgentPerson = new LeftJoin('persons', 'agent.person_id', '_id', 'agentPerson');
        const joinEmailAddresses = new LeftJoinMany('email_addresses', 'clientPerson._id', 'person_id', 'clientEmailAddresses');
        const joinPhoneNumbersThrough = new InnerJoin(
            'persons_phone_numbers',
            'clientPerson._id',
            'person_id',
            'clientPhoneNumbers_through'
        );
        const joinPhoneNumbers = new LeftJoinMany(
            'phone_numbers',
            'clientPhoneNumbers_through.phone_number_id',
            '_id',
            'clientPhoneNumbers'
        );
        const joinPolicies = new LeftJoinMany(
            'policies',
            '_id',
            'client_id',
            'clientPolicies'
        );
        const joinPolicyAgentsThrough = new InnerJoin(
            'agents_policies',
            'clientPolicies._id',
            'policy_id',
            'policyAgents_through'
        );
        const joinPolicyAgents = new LeftJoinMany(
            'agents',
            'policyAgents_through.agent_id',
            '_id',
            'policyAgents'
        );
        const joinPremiums = new LeftJoinMany(
            'premiums',
            'clientPolicies._id',
            'policy_id',
            'policyPremiums'
        );

        const operations: Operation[] = [joinPerson, joinAgent, joinAgentPerson, joinEmailAddresses, joinPhoneNumbersThrough, joinPhoneNumbers, joinPolicies, joinPolicyAgentsThrough, joinPolicyAgents, joinPremiums];

        // Query using get with pagination
        const queryOptions: IQueryOptions = {
            ...DefaultQueryOptions,
            page: 1,
            pageSize: 10
        };

        const result = await database.get<ITestClientReportsModel>(
            operations,
            queryOptions,
            testClientReportsModelSpec,
            'clients'
        );

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
        expect(firstEntity.agent).toBeDefined();
        expect(firstEntity.agent!.agentPerson).toBeDefined();
    });

    it.skip('should handle getAll() query with joins', async () => {
        // Create join operations
        const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
        const joinAgent = new LeftJoin('agents', 'agent_id', '_id', 'agent');
        const joinAgentPerson = new LeftJoin('persons', 'agent.person_id', '_id', 'agentPerson');
        const joinEmailAddresses = new LeftJoinMany('email_addresses', 'clientPerson._id', 'person_id', 'clientEmailAddresses');
        const joinPhoneNumbersThrough = new InnerJoin(
            'persons_phone_numbers',
            'clientPerson._id',
            'person_id',
            'clientPhoneNumbers_through'
        );
        const joinPhoneNumbers = new LeftJoinMany(
            'phone_numbers',
            'clientPhoneNumbers_through.phone_number_id',
            '_id',
            'clientPhoneNumbers'
        );
        const joinPolicies = new LeftJoinMany(
            'policies',
            '_id',
            'client_id',
            'clientPolicies'
        );
        const joinPolicyAgentsThrough = new InnerJoin(
            'agents_policies',
            'clientPolicies._id',
            'policy_id',
            'policyAgents_through'
        );
        const joinPolicyAgents = new LeftJoinMany(
            'agents',
            'policyAgents_through.agent_id',
            '_id',
            'policyAgents'
        );
        const joinPremiums = new LeftJoinMany(
            'premiums',
            'clientPolicies._id',
            'policy_id',
            'policyPremiums'
        );

        const operations: Operation[] = [joinPerson, joinAgent, joinAgentPerson, joinEmailAddresses, joinPhoneNumbersThrough, joinPhoneNumbers, joinPolicies, joinPolicyAgentsThrough, joinPolicyAgents, joinPremiums];

        // Query using getAll
        const results = await database.getAll<ITestClientReportsModel>(
            operations,
            'clients'
        );

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
        expect(firstResult.agent).toBeDefined();
        expect(firstResult.agent!.agentPerson).toBeDefined();
    });

    it.skip('should handle empty arrays when no related records exist', async () => {
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
        const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
        const joinEmailAddresses = new LeftJoinMany('email_addresses', 'clientPerson._id', 'person_id', 'clientEmailAddresses');

        const joinPhoneNumbersThrough = new InnerJoin(
            'persons_phone_numbers',
            'clientPerson._id',
            'person_id',
            'clientPhoneNumbers_through'
        );
        const joinPhoneNumbers = new LeftJoinMany(
            'phone_numbers',
            'clientPhoneNumbers_through.phone_number_id',
            '_id',
            'clientPhoneNumbers'
        );

        const operations: Operation[] = [joinPerson, joinEmailAddresses, joinPhoneNumbersThrough, joinPhoneNumbers];

        // Query the new client
        const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
        const result = await database.getById<ITestClientReportsModel>(
            operations,
            queryOptions,
            newClientId,
            'clients'
        );

        // Verify empty arrays are returned
        expect(result).toBeDefined();
        expect(result!.clientPerson).toBeDefined();
        expect(result!.clientPerson.clientEmailAddresses).toBeDefined();
        expect(Array.isArray(result!.clientPerson.clientEmailAddresses)).toBe(true);
        expect(result!.clientPerson.clientEmailAddresses.length).toBe(0);
        expect(result!.clientPerson.clientPhoneNumbers).toBeDefined();
        expect(Array.isArray(result!.clientPerson.clientPhoneNumbers)).toBe(true);
        expect(result!.clientPerson.clientPhoneNumbers.length).toBe(0);
    });

    it.skip('should join through join table to get single school and then join to district and state', async () => {
        // Create join operations
        // 1. One-to-one: clients -> persons
        const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');

        // 2. JoinThrough (singular): clientPerson -> persons_schools -> schools
        const joinSchoolThrough = new InnerJoin(
            'persons_schools',      // join table
            'clientPerson._id',    // local field (clientPerson._id) - references joined person table
            'person_id',            // join table local field
            'school_through'        // alias for through table
        );
        const joinSchool = new LeftJoin(
            'schools',              // final table
            'school_through.school_id', // local field from through table
            '_id',                 // foreign field (school._id)
            'school'               // alias (singular - returns single object)
        );

        // 3. Join: school -> district
        const joinDistrict = new LeftJoin('districts', 'school.district_id', '_id', 'district');

        // 4. Join: district -> state
        const joinState = new LeftJoin('states', 'district.state_id', '_id', 'state');

        const operations: Operation[] = [joinPerson, joinSchoolThrough, joinSchool, joinDistrict, joinState];

        // Query using getById
        const queryOptions: IQueryOptions = { ...DefaultQueryOptions };
        const result = await database.getById<ITestClientReportsModel>(
            operations,
            queryOptions,
            clientId,
            'clients'
        );

        // Verify the result structure
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!._id).toBe(clientId);
        expect(result!.clientPerson).toBeDefined();
        expect(result!.clientPerson._id).toBe(personId);

        // Verify school is a single object (not an array)
        const school = result!.clientPerson.school;
        expect(school).toBeDefined();
        expect(school).not.toBeNull();
        expect(Array.isArray(school)).toBe(false);
        if (!school) throw new Error('School should be defined');
        expect(school._id).toBe(schoolId);
        expect(school.name).toBe('Test High School');
        expect(school.districtId).toBe(districtId);

        // Verify district is joined on school
        const district = school.district;
        expect(district).toBeDefined();
        expect(district).not.toBeNull();
        if (!district) throw new Error('District should be defined');
        expect(district._id).toBe(districtId);
        expect(district.name).toBe('Test School District');
        expect(district.stateId).toBe(stateId);

        // Verify state is joined on district
        const state = district.state;
        expect(state).toBeDefined();
        expect(state).not.toBeNull();
        if (!state) throw new Error('State should be defined');
        expect(state._id).toBe(stateId);
        expect(state.name).toBe('Test State');
    });
});
