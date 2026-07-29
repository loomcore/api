import { AuthorizationModelSpec, IAuthorization, IQueryOptions, IUserContext } from "@loomcore/common/models";
import { IDatabase, Operation } from "../databases/index.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";
import { assertAdmin, assertUserHasFeature } from "../utils/index.js";


export class AuthorizationsService extends MultiTenantApiService<IAuthorization> {
    constructor(database: IDatabase) {
        super(database, "authorizations", "authorization", AuthorizationModelSpec);
    }

    override async preProcessEntity(userContext: IUserContext, entity: Partial<IAuthorization>, isCreate: boolean, allowId: boolean = true): Promise<Partial<IAuthorization>> {
        assertUserHasFeature(userContext, ['admin', 'system', 'authorizations']);
        return super.preProcessEntity(userContext, entity, isCreate, allowId);
    }
}