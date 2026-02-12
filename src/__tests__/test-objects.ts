import { IOrganization, IUserContext, IUser, IPersonModel } from "@loomcore/common/models";

export let TEST_META_ORG_ID: string | number = '69261691f936c45f85da24d0';
export let TEST_META_ORG_USER_ID: string | number = '69261672f48fb7bf76e54dfb';
export let TEST_META_ORG_USER_PERSON_ID: string | number = '69261672f48fb7bf76e54dfc';

export function setTestMetaOrgId(metaOrgId: string | number) {
    TEST_META_ORG_ID = metaOrgId;
}

export function setTestMetaOrgUserId(userId: string | number) {
    TEST_META_ORG_USER_ID = userId;
}

export function setTestMetaOrgUserPersonId(personId: string | number) {
    TEST_META_ORG_USER_PERSON_ID = personId;
}

export const TEST_META_ORG_USER_PASSWORD = 'test-meta-org-user-password';

export function getTestMetaOrg(): IOrganization {
    // NOTE: The hardcoded 'system' values for _createdBy and _updatedBy are intentionally incorrect.
    // These values will be stripped by stripSenderProvidedSystemProperties() in preProcessEntity()
    // and then replaced with correct values by auditForCreate() or auditForUpdate().
    // This ensures that client-provided audit fields are always ignored and replaced with server-generated values.
    // See: src/services/utils/strip-sender-provided-system-properties.util.ts
    // See: src/services/utils/audit-for-create.util.ts
    // See: src/services/utils/audit-for-update.util.ts
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
    // NOTE: The hardcoded 'system' values for _createdBy and _updatedBy are intentionally incorrect.
    // These values will be stripped by stripSenderProvidedSystemProperties() in preProcessEntity()
    // and then replaced with correct values by auditForCreate() or auditForUpdate().
    // This ensures that client-provided audit fields are always ignored and replaced with server-generated values.
    // The 'as any' cast is needed because IUser._createdBy expects AppIdType (string | number), but we're using
    // a hardcoded string to verify it gets stripped. In practice, this value is never used.
    // See: src/services/utils/strip-sender-provided-system-properties.util.ts
    // See: src/services/utils/audit-for-create.util.ts
    // See: src/services/utils/audit-for-update.util.ts
    return {
        _id: TEST_META_ORG_USER_ID,
        _orgId: getTestMetaOrg()._id,
        externalId: 'test-meta-org-user-external-id',
        personId: TEST_META_ORG_USER_PERSON_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        password: TEST_META_ORG_USER_PASSWORD,
        _created: new Date(),
        _createdBy: 'system' as any,
        _updated: new Date(),
        _updatedBy: 'system' as any,
    };
}

export function getTestMetaOrgUserPerson(): IPersonModel {
    const person: IPersonModel = {
        _id: TEST_META_ORG_USER_PERSON_ID,
        _orgId: getTestMetaOrg()._id,
        externalId: 'test-meta-org-user-person-external-id',
        firstName: 'Test',
        middleName: null,
        lastName: 'User',
        isAgent: false,
        isClient: false,
        isEmployee: false,
        dateOfBirth: null,
        extendedTypes: null,
        _created: new Date(),
        _createdBy: 'system' as any,
        _updated: new Date(),
        _updatedBy: 'system' as any,
    };
    return person;
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
let TEST_ORG_USER_PERSON_ID: string | number = '6926167d06c0073a778a1251';
export function setTestOrgId(orgId: string | number) {
    TEST_ORG_ID = orgId;
}

export function setTestOrgUserId(userId: string | number) {
    TEST_ORG_USER_ID = userId;
}

export function setTestOrgUserPersonId(personId: string | number) {
    TEST_ORG_USER_PERSON_ID = personId;
}

export function getTestOrg(): IOrganization {
    // NOTE: The hardcoded 'system' values for _createdBy and _updatedBy are intentionally incorrect.
    // These values will be stripped by stripSenderProvidedSystemProperties() in preProcessEntity()
    // and then replaced with correct values by auditForCreate() or auditForUpdate().
    // This ensures that client-provided audit fields are always ignored and replaced with server-generated values.
    // See: src/services/utils/strip-sender-provided-system-properties.util.ts
    // See: src/services/utils/audit-for-create.util.ts
    // See: src/services/utils/audit-for-update.util.ts
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
    // NOTE: The hardcoded 'system' values for _createdBy and _updatedBy are intentionally incorrect.
    // These values will be stripped by stripSenderProvidedSystemProperties() in preProcessEntity()
    // and then replaced with correct values by auditForCreate() or auditForUpdate().
    // This ensures that client-provided audit fields are always ignored and replaced with server-generated values.
    // The 'as any' cast is needed because IUser._createdBy expects AppIdType (string | number), but we're using
    // a hardcoded string to verify it gets stripped. In practice, this value is never used.
    // See: src/services/utils/strip-sender-provided-system-properties.util.ts
    // See: src/services/utils/audit-for-create.util.ts
    // See: src/services/utils/audit-for-update.util.ts
    return {
        _id: TEST_ORG_USER_ID,
        _orgId: getTestOrg()._id,
        externalId: 'test-org-user-external-id',
        email: 'test-org-user@example.com',
        personId: TEST_ORG_USER_PERSON_ID,
        displayName: 'Test User',
        password: TEST_ORG_USER_PASSWORD,
        _created: new Date(),
        _createdBy: 'system' as any,
        _updated: new Date(),
        _updatedBy: 'system' as any,
    };
}

export function getTestOrgUserPerson(): IPersonModel {
    return {
        _id: TEST_ORG_USER_PERSON_ID,
        _orgId: getTestOrg()._id,
        externalId: 'test-org-user-person-external-id',
        middleName: null,
        firstName: 'Test',
        lastName: 'User',
        isAgent: false,
        isClient: false,
        isEmployee: false,
        dateOfBirth: null,
        extendedTypes: null,
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