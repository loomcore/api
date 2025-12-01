import { Db, InsertOneResult } from "mongodb";
import { BadRequestError, DuplicateKeyError } from "../../../errors/index.js";

export async function create<T>(db: Db, pluralResourceName: string, entity: Partial<T>): Promise<{ insertedId: any; entity: T }> {
    try {
        const collection = db.collection(pluralResourceName);
        // Need to use "as any" to bypass TypeScript's strict type checking
        // This is necessary because we're changing _id from string to ObjectId
        const insertResult: InsertOneResult = await collection.insertOne(entity);
        
        // mongoDb mutates the entity passed into insertOne to have an _id property
        return {
            insertedId: insertResult.insertedId,
            entity: entity as T
        };
    }
    catch (err: any) {
        if (err.code === 11000) { // this is the MongoDb error code for duplicate key
            throw new DuplicateKeyError(`${pluralResourceName} already exists`);
        }
        throw new BadRequestError(`Error creating ${pluralResourceName}`);
    }
}
