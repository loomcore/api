import { Collection, Db, InsertOneResult, InsertManyResult, Document, FindCursor, WithId, ObjectId, DeleteResult, FindOptions } from "mongodb";
import { IDatabase } from "../database.interface.js";
import { IModelSpec, IQueryOptions, IPagedResult, DefaultQueryOptions } from "@loomcore/common/models";
import { Operation } from "../operations/operation.js";
import { ServerError } from "../../errors/server.error.js";
import { BadRequestError, DuplicateKeyError, IdNotFoundError, NotFoundError } from "../../errors/index.js";
import { convertObjectIdsToStrings, convertOperationsToPipeline, convertQueryOptionsToPipeline, convertStringsToObjectIds } from "./utils/index.js";
import { apiUtils } from "../../utils/api.utils.js";
import NoSqlPipeline from "./noSqlPipeline.js";
import { DeleteResult as GenericDeleteResult } from "../types/deleteResult.js";
import { buildNoSqlMatch } from "./utils/buildNoSqlMatch.js";
import { TSchema } from "@sinclair/typebox";
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
            .addQueryOptions(queryOptions, true)
            .build();
                
        const cursor = this.collection.aggregate(pipeline);
        const aggregateResult = await cursor.next();

        const pagedResult = apiUtils.getPagedResult<T>(
            aggregateResult?.data || [],
            aggregateResult?.total || 0,
            queryOptions
        );
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
        
        const result = await this.collection.aggregate(pipeline).toArray();
        return result.length;
    }
    
    prepareData<T>(entity: T, schema: TSchema): T {
        return convertStringsToObjectIds(entity, schema);
    }

    /**
     * Transforms a single entity after retrieving from the database.
     * This method converts ObjectIds from mongodb to strings - our models use strings, not ObjectIds
     * @param single Entity retrieved from database
     * @param modelSpec Model specification
     * @returns Transformed entity with string IDs
     */
    processData<T>(single: T, schema: TSchema): T {
        if (!single) return single;

        return convertObjectIdsToStrings<T>(single, schema);
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

    async createMany<T>(entities: Partial<T>[]): Promise<{ insertedIds: any; entities: any[] }> {
        try {
            // Need to use "as any" to bypass TypeScript's strict type checking
            // This is necessary because we're changing _id from string to ObjectId
            const insertResult = await this.collection.insertMany(entities);
            
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
        // Build match document and extract the filter object
        const matchDocument = buildNoSqlMatch({ filters: { _id: { eq: id } } });
        const filter = matchDocument.$match;
        
        const replaceResult = await this.collection.replaceOne(filter, entity);
        if (replaceResult.matchedCount <= 0) {
            throw new IdNotFoundError();
        }
        
        const pipeline = new NoSqlPipeline()
            .addMatch({ filters: { _id: { eq: id } } })
            .addOperations(operations)
            .build();
            
        const updatedEntity = await this.collection.aggregate(pipeline).next();
        if (!updatedEntity) {
            throw new IdNotFoundError();
        }
        
        return updatedEntity as T;
    }

    async partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<any>): Promise<T> {
        // Build match document and extract the filter object
        const matchDocument = buildNoSqlMatch({ filters: { _id: { eq: id } } });
        const filter = matchDocument.$match;
        
        // For partial update, we use findOneAndUpdate with $set
        // The operations are used when retrieving the updated entity
        const updatedEntity = await this.collection.findOneAndUpdate(
            filter,
            { $set: entity },
            { returnDocument: 'after' }
        );
        
        if (!updatedEntity) {
            throw new IdNotFoundError();
        }
        
        const pipeline = new NoSqlPipeline()
            .addMatch({ filters: { _id: { eq: id } } })
            .addOperations(operations)
            .build();
        
        const updatedEntityWithOperations = await this.collection.aggregate(pipeline).next();
        if (!updatedEntityWithOperations) {
            throw new IdNotFoundError();
        }
        return updatedEntityWithOperations as T;
    }

    async update<T>(queryObject: IQueryOptions, entity: Partial<any>, operations: Operation[]): Promise<T[]> {
        const matchDocument = buildNoSqlMatch(queryObject);
        const filter = matchDocument.$match;
        const updateResult = await this.collection.updateMany(filter, { $set: entity });
        
        if (updateResult.matchedCount <= 0) {
            throw new NotFoundError('No records found matching update query');
        }
        
        // Build pipeline for retrieving updated entities (with operations)
        const pipeline = new NoSqlPipeline()
            .addMatch(queryObject)
            .addOperations(operations)
            .addQueryOptions(queryObject, false)
            .build();
        
        const updatedEntities = await this.collection.aggregate(pipeline).toArray();
        
        return updatedEntities as T[];
    }

    async deleteById(id: string): Promise<GenericDeleteResult> {
        const objectId = new ObjectId(id);
        const baseQuery = { _id: objectId };

        const deleteResult = await this.collection.deleteOne(baseQuery);
        
        return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
    }

    async deleteMany(queryObject: IQueryOptions): Promise<GenericDeleteResult> {
        // Build match document and extract the filter object
        const matchDocument = buildNoSqlMatch(queryObject);
        const filter = matchDocument.$match;

        const deleteResult = await this.collection.deleteMany(filter);
        return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
    }

    async find<T>(queryObject: IQueryOptions): Promise<T[]> {
        const matchDocument = buildNoSqlMatch(queryObject);
        const filter = matchDocument.$match;

        const options = buildFindOptions(queryObject);

        const entities = await this.collection.find(filter, options).toArray();
                
        return entities as T[];
    }

    async findOne<T>(queryObject: IQueryOptions): Promise<T | null> {
        const matchDocument = buildNoSqlMatch(queryObject);
        const filter = matchDocument.$match;
        const options = buildFindOptions(queryObject);

        const entity = await this.collection.findOne(filter, options);
        
        return entity as T | null;
    }
};
function buildFindOptions(queryOptions: IQueryOptions) {
    let findOptions: FindOptions = {};
    if (queryOptions) {
		if (queryOptions.orderBy) {
			findOptions.sort = {
                [queryOptions.orderBy]: queryOptions.sortDirection === 'asc' ? 1 : -1
			};
		}

		if (queryOptions.page && queryOptions.pageSize) {
			findOptions.skip = (queryOptions.page - 1) * queryOptions.pageSize;
			findOptions.limit = queryOptions.pageSize;
		}
	}
    return findOptions;
}

