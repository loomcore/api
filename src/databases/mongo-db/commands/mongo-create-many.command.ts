import { Db } from "mongodb";
import { BadRequestError, DuplicateKeyError } from "../../../errors/index.js";

export async function createMany<T>(db: Db, pluralResourceName: string, entities: Partial<T>[]): Promise<{ insertedIds: any; entities: any[] }> {
    try {
        const collection = db.collection(pluralResourceName);
        // Need to use "as any" to bypass TypeScript's strict type checking
        // This is necessary because we're changing _id from string to ObjectId
        const insertResult = await collection.insertMany(entities);
        
        // mongoDb mutates the entities passed into insertMany to have an _id property
        return {
            insertedIds: insertResult.insertedIds,
            entities: entities
        };
    }
    catch (err: any) {
        if (err.code === 11000) { // this is the MongoDb error code for duplicate key
            throw new DuplicateKeyError(`One or more ${pluralResourceName} already exist`);
        }
        throw new BadRequestError(`Error creating ${pluralResourceName}`);
    }
}

