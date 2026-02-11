import { IPersonModel, personModelSpec } from "@loomcore/common/models";
import { IDatabase } from "../databases/index.js";
import { GenericApiService } from "./generic-api-service/generic-api.service.js";

export class PersonService extends GenericApiService<IPersonModel> {
    constructor(database: IDatabase) {
        super(database, 'persons', 'person', personModelSpec);
    }
}