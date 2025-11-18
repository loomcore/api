import { entityUtils } from "@loomcore/common/utils";
import { ObjectId } from "mongodb";

  /**
   * Converts string IDs in a query object to ObjectIds where appropriate.
   * This is a helper method for preparing query objects.
   * @param queryObject The query object to convert
   * @returns The query object with string IDs converted to ObjectIds
   */
  export function convertQueryObjectIds(queryObject: any): any {
    if (!queryObject || typeof queryObject !== 'object') {
      return queryObject;
    }

    const converted: any = {};

    for (const [key, value] of Object.entries(queryObject)) {
      if (key === '_id' && value instanceof ObjectId) {
        // Already an ObjectId, keep it as is
        converted[key] = value;
      } else if (key === '_id' && typeof value === 'string' && entityUtils.isValidObjectId(value)) {
        converted[key] = new ObjectId(value);
      } else if (key === '_id' && value && typeof value === 'object' && !(value instanceof ObjectId)) {
        // Handle _id with operators like $in, $ne, etc. (but not ObjectId instances)
        const convertedId: any = {};
        for (const [op, opValue] of Object.entries(value as any)) {
          if (op === '$in' && Array.isArray(opValue)) {
            convertedId[op] = opValue.map((v: any) => 
              typeof v === 'string' && entityUtils.isValidObjectId(v) 
                ? new ObjectId(v) 
                : v instanceof ObjectId
                ? v
                : v
            );
          } else if (typeof opValue === 'string' && entityUtils.isValidObjectId(opValue)) {
            convertedId[op] = new ObjectId(opValue);
          } else {
            convertedId[op] = opValue;
          }
        }
        converted[key] = convertedId;
      } else if (key.endsWith('Id') && typeof value === 'string' && entityUtils.isValidObjectId(value)) {
        // Convert fields ending with 'Id' to ObjectId if they're valid ObjectId strings
        converted[key] = new ObjectId(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof ObjectId)) {
        // Recursively convert nested objects (but not ObjectId instances)
        converted[key] = convertQueryObjectIds(value);
      } else {
        converted[key] = value;
      }
    }

    return converted;
  }