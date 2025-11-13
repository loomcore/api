import { Collection, Db } from "mongodb";
import { IDatabase } from "./database.interface.js";
import { IModelSpec } from "@loomcore/common/models";
import { Operation } from "../operations/operations.js";
import { ServerError } from "../../errors/server.error.js";
import { convertObjectIdsToStrings, convertOperationsToPipeline } from "../../utils/mongo/index.js";

export class MongoDBDatabase implements IDatabase {
    private collection: Collection;
    private pluralResourceName: string;

    constructor(
        db: Db,
        pluralResourceName: string,
    ) {
        this.collection = db.collection(pluralResourceName);
        this.pluralResourceName = pluralResourceName;
    }

    async getAll(operations: Operation[]): Promise<any[]> {
        const pipeline = convertOperationsToPipeline(operations);
        return await this.collection.aggregate(pipeline).toArray();
    }

    /**
     * Transforms a single entity after retrieving from the database.
     * This method converts ObjectIds from mongodb to strings - our models use strings, not ObjectIds
     * @param single Entity retrieved from database
     * @returns Transformed entity with string IDs
     */
    transformSingle<T>(single: any, modelSpec: IModelSpec): T {
        if (!single) return single;

        if (!modelSpec.fullSchema)
            throw new ServerError(`Cannot transform entity: No model specification with schema provided for ${this.pluralResourceName}`);

        return convertObjectIdsToStrings<T>(single, modelSpec.fullSchema);
    }
};
