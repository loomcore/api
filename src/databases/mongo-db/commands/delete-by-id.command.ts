import { Collection, Db, ObjectId } from "mongodb";
import { DeleteResult as GenericDeleteResult } from "../../models/delete-result.js";


export async function deleteById(db: Db, id: string, pluralResourceName: string): Promise<GenericDeleteResult> {
    const collection = db.collection(pluralResourceName);
    const objectId = new ObjectId(id);
    const baseQuery = { _id: objectId };

    const deleteResult = await collection.deleteOne(baseQuery);
    
    return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

