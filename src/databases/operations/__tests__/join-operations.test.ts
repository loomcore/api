import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { TestPostgresDatabase } from '../../../__tests__/postgres.test-database.js';
import { setupTestConfig } from '../../../__tests__/common-test.utils.js';
import { PostgresDatabase } from '../../postgres/postgres.database.js';
import { Join } from '../join.operation.js';
import { JoinMany } from '../join-many.operation.js';
import { JoinThroughMany } from '../join-through-many.operation.js';
import { JoinThrough } from '../join-through.operation.js';
import { Operation } from '../operation.js';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { IClientReportsModel, clientReportsModelSpec } from './models/client-report.model.js';
import { IPersonModel } from './models/person.model.js';
import { IEmailAddressModel } from './models/email-address.model.js';
import { IPhoneNumberModel } from './models/phone-number.model.js';
import { IAgentModel } from './models/agent.model.js';
import { IPolicyModel } from './models/policy.model.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';
const isRealPostgres = process.env.USE_REAL_POSTGRES === 'true';

describe.skipIf(!isPostgres || !isRealPostgres)('Join Operations - Complex Data Joining', () => {
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

        // Clean up any existing test data first (in case of previous failed test runs)
        await client.query(`DELETE FROM clients_policies WHERE client_id IN (SELECT _id FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4)))`, ['John', 'Jane', 'Bob', 'Alice']);
        await client.query(`DELETE FROM agents_policies WHERE policy_id IN (SELECT _id FROM policies WHERE amount IN ($1, $2))`, [1000.00, 2000.00]);
        await client.query(`DELETE FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
        await client.query(`DELETE FROM agents WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3))`, ['Jane', 'Bob', 'Alice']);
        await client.query(`DELETE FROM policies WHERE amount IN ($1, $2)`, [1000.00, 2000.00]);
        await client.query(`DELETE FROM persons_schools WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
        await client.query(`DELETE FROM persons_phone_numbers WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
        await client.query(`DELETE FROM email_addresses WHERE email_address IN ($1, $2)`, ['john.doe@example.com', 'john.m.doe@example.com']);
        await client.query(`DELETE FROM phone_numbers WHERE phone_number IN ($1, $2)`, ['555-0100', '555-0200']);
        await client.query(`DELETE FROM schools WHERE name = $1`, ['Test High School']);
        await client.query(`DELETE FROM districts WHERE name = $1`, ['Test School District']);
        await client.query(`DELETE FROM states WHERE name = $1`, ['Test State']);
        await client.query(`DELETE FROM persons WHERE first_name IN ($1, $2, $3, $4)`, ['John', 'Jane', 'Bob', 'Alice']);

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

        // Create a policy
        const policyResult = await client.query(`
            INSERT INTO policies (amount, frequency, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [1000.00, 'monthly']);
        policyId = policyResult.rows[0]._id;

        // Link agents to policy via agents_policies join table
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

        // Create a second policy for testing multiple policies
        const policy2Result = await client.query(`
            INSERT INTO policies (amount, frequency, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [2000.00, 'yearly']);
        const policy2Id = policy2Result.rows[0]._id;

        // Link agents to second policy
        await client.query(`
            INSERT INTO agents_policies (policy_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [policy2Id, agentId]);

        // 2. Create a client linked to the person
        const clientResult = await client.query(`
            INSERT INTO clients (person_id, agent_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
            RETURNING _id
        `, [personId, agentId]);
        clientId = clientResult.rows[0]._id;

        // Link client to policies via clients_policies join table
        await client.query(`
            INSERT INTO clients_policies (client_id, policy_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [clientId, policyId]);

        await client.query(`
            INSERT INTO clients_policies (client_id, policy_id, _created, "_createdBy", _updated, "_updatedBy")
            VALUES ($1, $2, NOW(), 1, NOW(), 1)
        `, [clientId, policy2Id]);

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
                await client.query(`DELETE FROM clients_policies WHERE client_id IN (SELECT _id FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4)))`, ['John', 'Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM agents_policies WHERE policy_id IN (SELECT _id FROM policies WHERE amount IN ($1, $2))`, [1000.00, 2000.00]);
                await client.query(`DELETE FROM clients WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3, $4))`, ['John', 'Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM agents WHERE person_id IN (SELECT _id FROM persons WHERE first_name IN ($1, $2, $3))`, ['Jane', 'Bob', 'Alice']);
                await client.query(`DELETE FROM policies WHERE amount IN ($1, $2)`, [1000.00, 2000.00]);
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

    it('should build a client-report using all join operation types', async () => {
        // Create join operations
        // 1. One-to-one: clients -> persons
        const joinPerson = new Join('persons', 'person_id', '_id', 'client_person');

        // 2. One-to-one: clients -> agents
        const joinAgent = new Join('agents', 'agent_id', '_id', 'agent');

        // 3. One-to-one: agent -> persons (nested join)
        const joinAgentPerson = new Join('persons', 'agent.person_id', '_id', 'agent_person');

        // 4. Many-to-one: persons -> email_addresses (returns array)
        // Note: localField uses "person._id" to reference the joined person table, not the main clients table
        const joinEmailAddresses = new JoinMany('email_addresses', 'client_person._id', 'person_id', 'email_addresses');

        // 5. Many-to-many via join table: persons -> persons_phone_numbers -> phone_numbers (returns array)
        // Note: localField uses "person._id" to reference the joined person table, not the main clients table
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',           // final table
            'persons_phone_numbers',   // join table
            'client_person._id',       // local field (client_person._id) - references joined person table
            'person_id',               // join table local field
            'phone_number_id',         // join table foreign field
            '_id',                     // foreign field (phone_number._id)
            'phone_numbers'            // alias
        );

        // 6. Many-to-many via join table: clients -> clients_policies -> policies (returns array)
        const joinPolicies = new JoinThroughMany(
            'policies',                // final table
            'clients_policies',        // join table
            '_id',                     // local field (clients._id)
            'client_id',               // join table local field
            'policy_id',               // join table foreign field
            '_id',                     // foreign field (policy._id)
            'policies'                 // alias
        );

        // 7. Many-to-many via join table: policies -> agents_policies -> agents (returns array)
        const joinPolicyAgents = new JoinThroughMany(
            'agents',                  // final table
            'agents_policies',         // join table
            'policies._id',            // local field (policies._id) - references joined policies array
            'policy_id',               // join table local field
            'agent_id',               // join table foreign field
            '_id',                     // foreign field (agent._id)
            'policy_agents'            // alias (nested under each policy, different from top-level 'agents')
        );

        // Note: Person joins for agents nested in policies are handled in the SQL enrichment
        // We'll need to update build-join-clauses to handle this case
        const operations: Operation[] = [joinPerson, joinAgent, joinAgentPerson, joinEmailAddresses, joinPhoneNumbers, joinPolicies, joinPolicyAgents];

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
        expect(result!.client_person).toBeDefined();
        expect(result!.client_person._id).toBe(personId);
        expect(result!.client_person.first_name).toBe('John');
        expect(result!.client_person.middle_name).toBe('Michael');
        expect(result!.client_person.last_name).toBe('Doe');

        // Verify email addresses array
        expect(result!.client_person.email_addresses).toBeDefined();
        expect(Array.isArray(result!.client_person.email_addresses)).toBe(true);
        expect(result!.client_person.email_addresses.length).toBe(2);

        // Verify email addresses content
        const emailAddresses = result!.client_person.email_addresses as IEmailAddressModel[];
        const email1 = emailAddresses.find(e => e.email_address === 'john.doe@example.com');
        const email2 = emailAddresses.find(e => e.email_address === 'john.m.doe@example.com');

        expect(email1).toBeDefined();
        expect(email1!.person_id).toBe(personId);
        expect(email1!.is_default).toBe(true);

        expect(email2).toBeDefined();
        expect(email2!.person_id).toBe(personId);
        expect(email2!.is_default).toBe(false);

        // Verify phone numbers array
        expect(result!.client_person.phone_numbers).toBeDefined();
        expect(Array.isArray(result!.client_person.phone_numbers)).toBe(true);
        expect(result!.client_person.phone_numbers.length).toBe(2);

        // Verify phone numbers content
        const phoneNumbers = result!.client_person.phone_numbers as IPhoneNumberModel[];
        const phone1 = phoneNumbers.find(p => p.phone_number === '555-0100');
        const phone2 = phoneNumbers.find(p => p.phone_number === '555-0200');

        expect(phone1).toBeDefined();
        expect(phone1!.phone_number_type).toBe('mobile');
        expect(phone1!.is_default).toBe(true);

        expect(phone2).toBeDefined();
        expect(phone2!.phone_number_type).toBe('home');
        expect(phone2!.is_default).toBe(false);

        // Verify agent
        expect(result!.agent).toBeDefined();
        expect(result!.agent!._id).toBe(agentId);
        expect(result!.agent!.person_id).toBe(person2Id);
        expect(result!.agent!.agent_person).toBeDefined();
        expect(result!.agent!.agent_person!._id).toBe(person2Id);
        expect(result!.agent!.agent_person!.first_name).toBe('Jane');
        expect(result!.agent!.agent_person!.middle_name).toBe('Smith');
        expect(result!.agent!.agent_person!.last_name).toBe('Doe');

        // Verify policies array
        expect(result!.policies).toBeDefined();
        expect(Array.isArray(result!.policies)).toBe(true);
        expect(result!.policies!.length).toBe(2);

        // Verify first policy (monthly policy)
        const policies = result!.policies as IPolicyModel[];
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

        const monthlyPolicyAgents = monthlyPolicy!.agents as IAgentModel[];
        const agent1 = monthlyPolicyAgents.find(a => a.person_id === person2Id);
        const agent2 = monthlyPolicyAgents.find(a => a.person_id === person3Id);
        const agent3 = monthlyPolicyAgents.find(a => a.person_id === person4Id);

        expect(agent1).toBeDefined();
        expect(agent1!.agent_person).toBeDefined();
        expect(agent1!.agent_person!.first_name).toBe('Jane');
        expect(agent1!.agent_person!.last_name).toBe('Doe');

        expect(agent2).toBeDefined();
        expect(agent2!.agent_person).toBeDefined();
        expect(agent2!.agent_person!.first_name).toBe('Bob');
        expect(agent2!.agent_person!.last_name).toBe('Johnson');

        expect(agent3).toBeDefined();
        expect(agent3!.agent_person).toBeDefined();
        expect(agent3!.agent_person!.first_name).toBe('Alice');
        expect(agent3!.agent_person!.last_name).toBe('Williams');

        // Verify second policy (yearly policy)
        expect(yearlyPolicy).toBeDefined();
        expect(yearlyPolicy!.amount).toBe(2000.00);
        expect(yearlyPolicy!.frequency).toBe('yearly');

        // Verify yearly policy agents array
        expect(yearlyPolicy!.agents).toBeDefined();
        expect(Array.isArray(yearlyPolicy!.agents)).toBe(true);
        expect(yearlyPolicy!.agents!.length).toBe(1);

        const yearlyPolicyAgents = yearlyPolicy!.agents as IAgentModel[];
        const yearlyAgent1 = yearlyPolicyAgents.find(a => a.person_id === person2Id);
        expect(yearlyAgent1).toBeDefined();
        expect(yearlyAgent1!.agent_person).toBeDefined();
        expect(yearlyAgent1!.agent_person!.first_name).toBe('Jane');
        expect(yearlyAgent1!.agent_person!.last_name).toBe('Doe');
    });

    it('should handle get() query with joins and return paginated results', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'client_person');
        const joinAgent = new Join('agents', 'agent_id', '_id', 'agent');
        const joinAgentPerson = new Join('persons', 'agent.person_id', '_id', 'agent_person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'client_person._id', 'person_id', 'email_addresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',
            'persons_phone_numbers',
            'client_person._id',
            'person_id',
            'phone_number_id',
            '_id',
            'phone_numbers'
        );
        const joinPolicies = new JoinThroughMany(
            'policies',
            'clients_policies',
            '_id',
            'client_id',
            'policy_id',
            '_id',
            'policies'
        );
        const joinPolicyAgents = new JoinThroughMany(
            'agents',
            'agents_policies',
            'policies._id',
            'policy_id',
            'agent_id',
            '_id',
            'policy_agents'
        );

        const operations: Operation[] = [joinPerson, joinAgent, joinAgentPerson, joinEmailAddresses, joinPhoneNumbers, joinPolicies, joinPolicyAgents];

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
        expect(firstEntity.client_person).toBeDefined();
        expect(firstEntity.client_person.email_addresses).toBeDefined();
        expect(Array.isArray(firstEntity.client_person.email_addresses)).toBe(true);
        expect(firstEntity.client_person.phone_numbers).toBeDefined();
        expect(Array.isArray(firstEntity.client_person.phone_numbers)).toBe(true);
        expect(firstEntity.agent).toBeDefined();
        expect(firstEntity.agent!.agent_person).toBeDefined();
    });

    it('should handle getAll() query with joins', async () => {
        // Create join operations
        const joinPerson = new Join('persons', 'person_id', '_id', 'client_person');
        const joinAgent = new Join('agents', 'agent_id', '_id', 'agent');
        const joinAgentPerson = new Join('persons', 'agent.person_id', '_id', 'agent_person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'client_person._id', 'person_id', 'email_addresses');
        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',
            'persons_phone_numbers',
            'client_person._id',
            'person_id',
            'phone_number_id',
            '_id',
            'phone_numbers'
        );
        const joinPolicies = new JoinThroughMany(
            'policies',
            'clients_policies',
            '_id',
            'client_id',
            'policy_id',
            '_id',
            'policies'
        );
        const joinPolicyAgents = new JoinThroughMany(
            'agents',
            'agents_policies',
            'policies._id',
            'policy_id',
            'agent_id',
            '_id',
            'policy_agents'
        );

        const operations: Operation[] = [joinPerson, joinAgent, joinAgentPerson, joinEmailAddresses, joinPhoneNumbers, joinPolicies, joinPolicyAgents];

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
        expect(firstResult.client_person).toBeDefined();
        expect(firstResult.client_person.email_addresses).toBeDefined();
        expect(Array.isArray(firstResult.client_person.email_addresses)).toBe(true);
        expect(firstResult.client_person.phone_numbers).toBeDefined();
        expect(Array.isArray(firstResult.client_person.phone_numbers)).toBe(true);
        expect(firstResult.agent).toBeDefined();
        expect(firstResult.agent!.agent_person).toBeDefined();
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
        const joinPerson = new Join('persons', 'person_id', '_id', 'client_person');
        const joinEmailAddresses = new JoinMany('email_addresses', 'client_person._id', 'person_id', 'email_addresses');

        const joinPhoneNumbers = new JoinThroughMany(
            'phone_numbers',
            'persons_phone_numbers',
            'client_person._id',
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
        expect(result!.client_person).toBeDefined();
        expect(result!.client_person.email_addresses).toBeDefined();
        expect(Array.isArray(result!.client_person.email_addresses)).toBe(true);
        expect(result!.client_person.email_addresses.length).toBe(0);
        expect(result!.client_person.phone_numbers).toBeDefined();
        expect(Array.isArray(result!.client_person.phone_numbers)).toBe(true);
        expect(result!.client_person.phone_numbers.length).toBe(0);
    });

    it('should join through join table to get single school and then join to district and state', async () => {
        // Create join operations
        // 1. One-to-one: clients -> persons
        const joinPerson = new Join('persons', 'person_id', '_id', 'client_person');

        // 2. JoinThrough (singular): client_person -> persons_schools -> schools
        const joinSchool = new JoinThrough(
            'schools',              // final table
            'persons_schools',      // join table
            'client_person._id',    // local field (client_person._id) - references joined person table
            'person_id',            // join table local field
            'school_id',           // join table foreign field
            '_id',                 // foreign field (school._id)
            'school'               // alias (singular - returns single object)
        );

        // 3. Join: school -> district
        const joinDistrict = new Join('districts', 'school.district_id', '_id', 'district');

        // 4. Join: district -> state
        const joinState = new Join('states', 'district.state_id', '_id', 'state');

        const operations: Operation[] = [joinPerson, joinSchool, joinDistrict, joinState];

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
        expect(result!.client_person).toBeDefined();
        expect(result!.client_person._id).toBe(personId);

        // Verify school is a single object (not an array)
        const school = result!.client_person.school;
        expect(school).toBeDefined();
        expect(school).not.toBeNull();
        expect(Array.isArray(school)).toBe(false);
        if (!school) throw new Error('School should be defined');
        expect(school._id).toBe(schoolId);
        expect(school.name).toBe('Test High School');
        expect(school.district_id).toBe(districtId);

        // Verify district is joined on school
        const district = school.district;
        expect(district).toBeDefined();
        expect(district).not.toBeNull();
        if (!district) throw new Error('District should be defined');
        expect(district._id).toBe(districtId);
        expect(district.name).toBe('Test School District');
        expect(district.state_id).toBe(stateId);

        // Verify state is joined on district
        const state = district.state;
        expect(state).toBeDefined();
        expect(state).not.toBeNull();
        if (!state) throw new Error('State should be defined');
        expect(state._id).toBe(stateId);
        expect(state.name).toBe('Test State');
    });
});
