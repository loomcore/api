import { FeatureModelSpec, IFeature, IUserContext } from "@loomcore/common/models";
import { IDatabase } from "../databases/index.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";
import { assertUserHasFeature } from "../utils/index.js";


export class FeaturesService extends MultiTenantApiService<IFeature> {
    constructor(database: IDatabase) {
        super(database, "features", "feature", FeatureModelSpec);
    }

    override async preProcessEntity(userContext: IUserContext, entity: Partial<IFeature>, isCreate: boolean, allowId: boolean = true): Promise<Partial<IFeature>> {
        assertUserHasFeature(userContext, ['admin', 'system', 'features']);
        return super.preProcessEntity(userContext, entity, isCreate, allowId);
    }
}
