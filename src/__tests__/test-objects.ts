import { IOrganization, IUser, IUserContext } from "@loomcore/common/models";

export const testUser: IUser = {
    _id: '69261672f48fb7bf76e54dfb',
    email: 'test@example.com',
    password: 'testpassword',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    roles: ['user'],
    _orgId: '6926167d06c0073a778a124f',
    _created: new Date(),
    _createdBy: 'system',
    _lastLoggedIn: new Date(),
    _lastPasswordChange: new Date(),
    _updated: new Date(),
    _updatedBy: 'system',
};

export function getTestUser() {
    return { ...testUser };
}

export const testUserContext: IUserContext = {
    user: getTestUser(),
    _orgId: '6926167d06c0073a778a124f'
};

export const testMetaOrg: IOrganization = {
    _id: '69261691f936c45f85da24d0',
    name: 'Test Meta Organization',
    code: 'test-meta-org',
    status: 1,
    isMetaOrg: true,
    _created: new Date(),
    _createdBy: 'system',
    _updated: new Date(),
    _updatedBy: 'system',
};

export const testOrg: IOrganization = {
    _id: '6926167d06c0073a778a124f',
    name: 'Test Organization',
    code: 'test-org',
    status: 1,
    isMetaOrg: false,
    _created: new Date(),
    _createdBy: 'system',
    _updated: new Date(),
    _updatedBy: 'system',   
};