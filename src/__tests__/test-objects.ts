import { IOrganization, IUser, IUserContext } from "@loomcore/common/models";

export let TEST_META_ORG_ID = '69261691f936c45f85da24d0';

export function setTestMetaOrgId(metaOrgId: string) {
    TEST_META_ORG_ID = metaOrgId;
}

export function getTestMetaOrg(): IOrganization {
    return {
        _id: TEST_META_ORG_ID,
        name: 'Test Meta Organization',
        code: 'test-meta-org',
        status: 1,
        isMetaOrg: true,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system',
    };
};

export function getTestMetaOrgUser(): IUser {
    return {
        _id: '69261672f48fb7bf76e54dfb',
        _orgId: getTestMetaOrg()._id,
        email: 'test@example.com',
        password: 'testpassword',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        authorizations: [{
            _id: '6939c54e57a1c6576a40c590',
            _orgId: getTestMetaOrg()._id,
            role: 'metaorgUser',
            feature: 'metaorgUser',
            config: {},
            _created: new Date(),
            _createdBy: 'system',
            _updated: new Date(),
            _updatedBy: 'system',
        }],
        _created: new Date(),
        _createdBy: 'system',
        _lastLoggedIn: new Date(),
        _updated: new Date(),
        _updatedBy: 'system',
    };
};

export function getTestMetaOrgUserContext(): IUserContext {
    return {
        user: getTestMetaOrgUser(),
        _orgId: getTestMetaOrg()._id,
    };
};

let TEST_ORG_ID = '6926167d06c0073a778a124f';

export function setTestOrgId(orgId: string) {
    TEST_ORG_ID = orgId;
}

export function getTestOrg(): IOrganization {
    return {
        _id: TEST_ORG_ID,
        name: 'Test Organization',
        code: 'test-org',
        status: 1,
        isMetaOrg: false,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system',
    };
};

export function getTestOrgUser(): IUser {
    return {
        _id: '6926167d06c0073a778a1250',
        _orgId: getTestOrg()._id,
        email: 'test-org-user@example.com',
        password: 'testpassword',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        authorizations: [{
            _id: '6939c54e57a1c6576a40c591',
            _orgId: getTestOrg()._id,
            role: 'testOrgUser',
            feature: 'testOrgUser',
            config: {},
            _created: new Date(),
            _createdBy: 'system',
            _updated: new Date(),
            _updatedBy: 'system',
        }],
        _created: new Date(),
        _createdBy: 'system',
        _lastLoggedIn: new Date(),
        _updated: new Date(),
        _updatedBy: 'system',
    };
};

export function getTestOrgUserContext(): IUserContext {
    return {
        user: getTestOrgUser(),
        _orgId: getTestOrg()._id,
    };
};