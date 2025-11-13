import { Collection, Db, InsertOneResult, InsertManyResult } from "mongodb";
import { IDatabase } from "./database.interface.js";
import { IModelSpec } from "@loomcore/common/models";
import { Operation } from "../operations/operations.js";
import { ServerError } from "../../errors/server.error.js";
import { BadRequestError, DuplicateKeyError } from "../../errors/index.js";
import { convertObjectIdsToStrings, convertOperationsToPipeline, convertStringToObjectId } from "../../utils/mongo/index.js";

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

    async prepareEntity<T>(entity: T): Promise<T> {
        return convertStringToObjectId(entity);
    }

    /**
     * Transforms a single entity after retrieving from the database.
     * This method converts ObjectIds from mongodb to strings - our models use strings, not ObjectIds
     * @param single Entity retrieved from database
     * @param modelSpec Model specification
     * @returns Transformed entity with string IDs
     */
    transformSingle<T>(single: T, modelSpec: IModelSpec): T {
        if (!single) return single;

        if (!modelSpec.fullSchema)
            throw new ServerError(`Cannot transform entity: No model specification with schema provided for ${this.pluralResourceName}`);

        return convertObjectIdsToStrings<T>(single, modelSpec.fullSchema);
    }

    async create<T>(entity: any): Promise<{ insertedId: any; entity: any }> {
        try {
            // Need to use "as any" to bypass TypeScript's strict type checking
            // This is necessary because we're changing _id from string to ObjectId
            const insertResult: InsertOneResult = await this.collection.insertOne(entity as any);
            
            // mongoDb mutates the entity passed into insertOne to have an _id property
            return {
                insertedId: insertResult.insertedId,
                entity: entity
            };
        }
        catch (err: any) {
            if (err.code === 11000) { // this is the MongoDb error code for duplicate key
                throw new DuplicateKeyError(`${this.pluralResourceName} already exists`);
            }
            throw new BadRequestError(`Error creating ${this.pluralResourceName}`);
        }
    }

    async createMany<T>(entities: any[]): Promise<{ insertedIds: any; entities: any[] }> {
        try {
            // Need to use "as any" to bypass TypeScript's strict type checking
            // This is necessary because we're changing _id from string to ObjectId
            const insertResult: InsertManyResult = await this.collection.insertMany(entities as any);
            
            // mongoDb mutates the entities passed into insertMany to have an _id property
            return {
                insertedIds: insertResult.insertedIds,
                entities: entities
            };
        }
        catch (err: any) {
            if (err.code === 11000) { // this is the MongoDb error code for duplicate key
                throw new DuplicateKeyError(`One or more ${this.pluralResourceName} already exist`);
            }
            throw new BadRequestError(`Error creating ${this.pluralResourceName}`);
        }
    }
};
