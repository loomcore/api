import { Collection, Db, InsertOneResult, InsertManyResult, Document } from "mongodb";
import { IDatabase } from "./database.interface.js";
import { IModelSpec, IQueryOptions, IPagedResult, DefaultQueryOptions } from "@loomcore/common/models";
import { Operation } from "../operations/operations.js";
import { ServerError } from "../../errors/server.error.js";
import { BadRequestError, DuplicateKeyError } from "../../errors/index.js";
import { convertObjectIdsToStrings, convertOperationsToPipeline, convertStringToObjectId, buildMongoMatchFromQueryOptions, convertQueryOptionsToPipeline } from "../../utils/mongo/index.js";
import { apiUtils } from "../../utils/api.utils.js";
import utils from 'util';
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

    async get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>> {
        let pipeline: Document[] = [];
        // Convert operations to pipeline stages (e.g., joins)
        const operationsDocuments = convertOperationsToPipeline(operations);
        // Build match conditions from query options
        const matchDocument = buildMongoMatchFromQueryOptions(queryOptions, modelSpec);
        // Build query options pipeline stages (e.g., sorting, pagination)
        const queryOptionsDocuments = convertQueryOptionsToPipeline(queryOptions);
        

        // Combine all pipeline stages into a single pipeline
        if (matchDocument) {
            pipeline.push(matchDocument);
        }
        if (operationsDocuments.length > 0) {
            pipeline = pipeline.concat(operationsDocuments);
        }
        if (queryOptionsDocuments.length > 0) {
            pipeline = pipeline.concat(queryOptionsDocuments);
        }

        console.log('pipeline', utils.inspect(pipeline, false, null, true));
        
        // Execute the aggregation
        const cursor = this.collection.aggregate(pipeline);
        const aggregateResult = await cursor.next();
        
        // Build the paged result
        let pagedResult: IPagedResult<T> = apiUtils.getPagedResult<T>([], 0, queryOptions);
        
        if (aggregateResult) {
            let total = 0;
            if (aggregateResult.total && aggregateResult.total.length > 0) {
                total = aggregateResult.total[0].total;
            }
            const entities = aggregateResult.results || [];
            pagedResult = apiUtils.getPagedResult<T>(entities, total, queryOptions);
        }
        
        return pagedResult;
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
