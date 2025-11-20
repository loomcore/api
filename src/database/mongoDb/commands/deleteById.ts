import { Collection, ObjectId } from "mongodb";
import { DeleteResult as GenericDeleteResult } from "../../models/deleteResult.js";


export async function deleteById(collection: Collection, id: string): Promise<GenericDeleteResult> {
    const objectId = new ObjectId(id);
    const baseQuery = { _id: objectId };

    const deleteResult = await collection.deleteOne(baseQuery);
    
    return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

