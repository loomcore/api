import { Collection, Db, InsertOneResult, InsertManyResult, Document, FindCursor, WithId, ObjectId } from "mongodb";
import { IDatabase } from "../database.interface.js";
import { IModelSpec, IQueryOptions, IPagedResult, DefaultQueryOptions } from "@loomcore/common/models";
import { Operation } from "../../operations/operations.js";
import { ServerError } from "../../../errors/server.error.js";
import { BadRequestError, DuplicateKeyError, IdNotFoundError, NotFoundError } from "../../../errors/index.js";
import { convertObjectIdsToStrings, convertOperationsToPipeline, convertStringToObjectId, convertQueryOptionsToPipeline } from "../../../utils/mongo/index.js";
import { apiUtils } from "../../../utils/api.utils.js";
import utils from 'util';
import NoSqlPipeline from "./noSqlPipeline.js";
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

    async getAll<T>(operations: Operation[]): Promise<T[]> {
        const pipeline = new NoSqlPipeline()
            .addOperations(operations)
            .build();

        let aggregateResult: Document[];

        if (pipeline.length === 0) {
            // Use existing simple find approach if no additional stages
            // This is more efficient than using aggregate for simple queries
            const cursor = this.collection.find();
            aggregateResult = await cursor.toArray();
        } else {
            const cursor = this.collection.aggregate(pipeline);
            aggregateResult = await cursor.toArray();
        }
        return aggregateResult as T[];
    }

    async get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>> {
        const pipeline = new NoSqlPipeline()
            .addMatch(queryOptions, modelSpec)
            .addOperations(operations)
            .addPagination(queryOptions)
            .build();
                
        const cursor = this.collection.aggregate(pipeline);
        const aggregateResult = await cursor.next();
        
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

    async getById<T>(operations: Operation[], id: string): Promise<T | null> {
        const objectId = new ObjectId(id);
        const baseQuery = { _id: objectId };
        
        // Convert operations to pipeline stages
        const operationsDocuments = convertOperationsToPipeline(operations);
        
        let entity: Document | null = null;
        
        if (operationsDocuments.length > 0) {
            // Use aggregation pipeline if there are operations
            const pipeline = [
                { $match: baseQuery },
                ...operationsDocuments
            ];
            entity = await this.collection.aggregate(pipeline).next();
        } else {
            // Use simple findOne if no operations
            entity = await this.collection.findOne(baseQuery);
        }
        
        return entity as T | null;
    }

    async getCount(operations: Operation[]): Promise<number> {
        const pipeline = new NoSqlPipeline()
            .addOperations(operations)
            .build();
        
        console.log('pipeline', pipeline);
        const result = await this.collection.aggregate(pipeline).toArray();
        console.log('result', result);
        return result.length;
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

    async batchUpdate<T>(entities: Partial<T>[], operations: Operation[]): Promise<T[]> {
        if (!entities || entities.length === 0) {
            return [];
        }

        const bulkOperations = [];
        const entityIds: ObjectId[] = [];

        for (const entity of entities) {
            // The entity should have been prepared by prepareDataForDb, which converts string _id to ObjectId
            const { _id, ...updateData } = entity as any;

            if (!_id || !(_id instanceof ObjectId)) {
                throw new BadRequestError('Each entity in a batch update must have a valid _id that has been converted to an ObjectId.');
            }
            
            entityIds.push(_id);

            bulkOperations.push({
                updateOne: {
                    filter: { _id },
                    update: { $set: updateData },
                },
            });
        }

        if (bulkOperations.length > 0) {
            await this.collection.bulkWrite(bulkOperations);
        }

        // Build query to retrieve updated entities
        const baseQuery = { _id: { $in: entityIds } };
        
        // Convert operations to pipeline stages
        const operationsDocuments = convertOperationsToPipeline(operations);
        
        let updatedEntities: Document[];
        
        if (operationsDocuments.length > 0) {
            // Use aggregation pipeline if there are operations
            const pipeline = [
                { $match: baseQuery },
                ...operationsDocuments
            ];
            updatedEntities = await this.collection.aggregate(pipeline).toArray();
        } else {
            // Use simple find if no operations
            updatedEntities = await this.collection.find(baseQuery).toArray();
        }

        return updatedEntities as T[];
    }

    async fullUpdateById<T>(operations: Operation[], id: string, entity: any): Promise<T> {
        const objectId = new ObjectId(id);
        const baseQuery = { _id: objectId };
        
        // Convert operations to pipeline stages for query building
        const operationsDocuments = convertOperationsToPipeline(operations);
        
        // Build the query filter - operations might modify the query, but for replaceOne we use the base query
        // The operations are used when retrieving the updated entity
        const replaceResult = await this.collection.replaceOne(baseQuery, entity);
        
        if (replaceResult.matchedCount <= 0) {
            throw new IdNotFoundError();
        }
        
        // Retrieve the updated entity using the same pattern as getById
        let updatedEntity: Document | null = null;
        
        if (operationsDocuments.length > 0) {
            // Use aggregation pipeline if there are operations
            const pipeline = [
                { $match: baseQuery },
                ...operationsDocuments
            ];
            updatedEntity = await this.collection.aggregate(pipeline).next();
        } else {
            // Use simple findOne if no operations
            updatedEntity = await this.collection.findOne(baseQuery);
        }
        
        if (!updatedEntity) {
            throw new IdNotFoundError();
        }
        
        return updatedEntity as T;
    }

    async partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<any>): Promise<T> {
        const objectId = new ObjectId(id);
        const baseQuery = { _id: objectId };
        
        // Convert operations to pipeline stages for query building
        const operationsDocuments = convertOperationsToPipeline(operations);
        
        // For partial update, we use findOneAndUpdate with $set
        // The operations are used when retrieving the updated entity
        const updatedEntity = await this.collection.findOneAndUpdate(
            baseQuery,
            { $set: entity },
            { returnDocument: 'after' }
        );
        
        if (!updatedEntity) {
            throw new IdNotFoundError();
        }
        
        // If there are operations, we need to apply them to the retrieved entity
        // by fetching it again through the pipeline
        if (operationsDocuments.length > 0) {
            const pipeline = [
                { $match: baseQuery },
                ...operationsDocuments
            ];
            const entityWithOperations = await this.collection.aggregate(pipeline).next();
            if (!entityWithOperations) {
                throw new IdNotFoundError();
            }
            return entityWithOperations as T;
        }
        
        return updatedEntity as T;
    }

    async update<T>(queryObject: any, entity: Partial<any>, operations: Operation[]): Promise<T[]> {
        // Use updateMany with $set to update all matching entities
        const updateResult = await this.collection.updateMany(queryObject, { $set: entity });
        
        if (updateResult.matchedCount <= 0) {
            throw new NotFoundError('No records found matching update query');
        }
        
        // Convert operations to pipeline stages for retrieving updated entities
        const operationsDocuments = convertOperationsToPipeline(operations);
        
        let updatedEntities: Document[];
        
        if (operationsDocuments.length > 0) {
            // Use aggregation pipeline if there are operations
            const pipeline = [
                { $match: queryObject },
                ...operationsDocuments
            ];
            updatedEntities = await this.collection.aggregate(pipeline).toArray();
        } else {
            // Use simple find if no operations
            updatedEntities = await this.collection.find(queryObject).toArray();
        }
        
        return updatedEntities as T[];
    }

    async deleteById(operations: Operation[], id: string): Promise<{ acknowledged: boolean; deletedCount: number }> {
        const objectId = new ObjectId(id);
        const baseQuery = { _id: objectId };
        
        // Convert operations to pipeline stages for query building
        // For delete operations, we typically use the base query directly
        // Operations might be used for additional filtering in the future
        
        // Perform delete operation
        const deleteResult = await this.collection.deleteOne(baseQuery);
        
        return {
            acknowledged: deleteResult.acknowledged,
            deletedCount: deleteResult.deletedCount
        };
    }

    async deleteMany(queryObject: any, operations: Operation[]): Promise<{ acknowledged: boolean; deletedCount: number }> {
        // Convert operations to pipeline stages for query building
        // For deleteMany, we use the queryObject directly
        // Operations might be used for additional filtering in the future
        
        // Perform deleteMany operation
        const deleteResult = await this.collection.deleteMany(queryObject);
        
        return {
            acknowledged: deleteResult.acknowledged,
            deletedCount: deleteResult.deletedCount
        };
    }
};
