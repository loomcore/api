import { IEntity, IModelSpec } from '@loomcore/common/models';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { IDatabase } from '../databases/models/database.interface.js';

export class SimpleApiService<T extends IEntity> extends GenericApiService<T, T> {
    constructor(
        database: IDatabase,
        pluralResourceName: string,
        singularResourceName: string,
        modelSpec: IModelSpec
    ) {
        super(database, pluralResourceName, singularResourceName, modelSpec);
    }
}
