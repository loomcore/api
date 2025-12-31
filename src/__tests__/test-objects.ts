import { IOrganization, IUserContext, IUser } from "@loomcore/common/models";

export let TEST_META_ORG_ID: string | number = '69261691f936c45f85da24d0';
export let TEST_META_ORG_USER_ID: string | number = '69261672f48fb7bf76e54dfb';

export function setTestMetaOrgId(metaOrgId: string | number) {
    TEST_META_ORG_ID = metaOrgId;
}

export function setTestMetaOrgUserId(userId: string | number) {
    TEST_META_ORG_USER_ID = userId;
}

export const TEST_META_ORG_USER_PASSWORD = 'test-meta-org-user-password';

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
        _id: TEST_META_ORG_USER_ID,
        _orgId: getTestMetaOrg()._id,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        password: TEST_META_ORG_USER_PASSWORD,
        _created: new Date(),
        _createdBy: 'system' as any,
        _updated: new Date(),
        _updatedBy: 'system' as any,
    };
}

export function getTestMetaOrgUserContext(): IUserContext {
    return {
        user: getTestMetaOrgUser(),
        organization: getTestMetaOrg(),
        authorizations: [{
            _id: '6939c54e57a1c6576a40c590',
            _orgId: getTestMetaOrg()._id,
            role: 'metaorgUser',
            feature: 'metaorgUser',
            config: {},
        }],
    };
};

let TEST_ORG_ID: string | number = '6926167d06c0073a778a124f';
let TEST_ORG_USER_ID: string | number = '6926167d06c0073a778a1250';

export function setTestOrgId(orgId: string | number) {
    TEST_ORG_ID = orgId;
}

export function setTestOrgUserId(userId: string | number) {
    TEST_ORG_USER_ID = userId;
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
export const TEST_ORG_USER_PASSWORD = 'test-org-user-password';

export function getTestOrgUser(): IUser {
    return {
        _id: TEST_ORG_USER_ID,
        _orgId: getTestOrg()._id,
        email: 'test-org-user@example.com',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        password: TEST_ORG_USER_PASSWORD,
        _created: new Date(),
        _createdBy: 'system' as any,
        _updated: new Date(),
        _updatedBy: 'system' as any,
    };
}

export function getTestOrgUserContext(): IUserContext {
    return {
        user: getTestOrgUser(),
        organization: getTestOrg(),
        authorizations: [{
            _id: '6939c54e57a1c6576a40c591',
            _orgId: getTestOrg()._id,
            role: 'testOrgUser',
            feature: 'testOrgUser',
            config: {},
        }],
    };
};