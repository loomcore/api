import { IQueryOptions, IModelSpec } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { TSchema } from '@sinclair/typebox';
import { Document, ObjectId } from 'mongodb';
import { PROPERTIES_THAT_ARE_NOT_OBJECT_IDS } from '../../models/constants.js';
import { getPropertySchema } from '../../utils/get-property-schema.util.js';

function isExcludedFromObjectIdConversion(key: string): boolean {
  return PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key);
}

function shouldConvertEqToObjectId(
  key: string,
  propSchema: TSchema | undefined,
  hasSchema: boolean,
): boolean {
  if (isExcludedFromObjectIdConversion(key)) {
    return false;
  }
  if (key === '_id' || propSchema?.format === 'objectid') {
    return true;
  }
  return !hasSchema && key.endsWith('Id');
}

function shouldConvertInToObjectIds(
  key: string,
  propSchema: TSchema | undefined,
  hasSchema: boolean,
): boolean {
  if (isExcludedFromObjectIdConversion(key)) {
    return false;
  }
  if (key === '_id' || propSchema?.format === 'objectid') {
    return true;
  }
  const isObjectIdArray = propSchema?.type === 'array' && (propSchema.items as TSchema)?.format === 'objectid';
  if (isObjectIdArray) {
    return true;
  }
  return !hasSchema && (key.endsWith('Id') || key.endsWith('Ids'));
}

export function buildNoSqlMatch(queryOptions: IQueryOptions, modelSpec?: IModelSpec): Document {
  const filters = queryOptions.filters || {};
  const schema = modelSpec?.fullSchema;
  const hasSchema = !!schema;
  let match: any = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      const propSchema = schema ? getPropertySchema(key, schema) : undefined;

      if (value.eq !== undefined) {
        const valueToCompare = value.eq;

        if (shouldConvertEqToObjectId(key, propSchema, hasSchema)
          && typeof valueToCompare === 'string' && entityUtils.isValidObjectId(valueToCompare)) {
          match[key] = new ObjectId(valueToCompare);
        }

        // Convert numeric strings to numbers
        else if (typeof valueToCompare === 'string' && !isNaN(Number(valueToCompare))) {
          match[key] = Number(valueToCompare);
        }
        else {
          match[key] = valueToCompare;
        }
      }
      if (value.in !== undefined && Array.isArray(value.in)) {
        if (shouldConvertInToObjectIds(key, propSchema, hasSchema)) {
          // Convert string values to ObjectIds
          const objectIds = value.in
            .filter(val => typeof val === 'string' && entityUtils.isValidObjectId(val))
            .map(val => new ObjectId(val as string));
          if (objectIds.length > 0) {
            match[key] = { $in: objectIds };
          }
        } else {
          // Convert numeric strings to numbers in arrays
          const convertedValues = value.in.map(val => typeof val === 'string' && !isNaN(Number(val)) ? Number(val) : val
          );
          match[key] = { $in: convertedValues };
        }
      }
      if (value.gte !== undefined) {
        match[key] = { $gte: value.gte };
      }
      if (value.lte !== undefined) {
        match[key] = { $lte: value.lte };
      }
      if (value.gt !== undefined) {
        match[key] = { $gt: value.gt };
      }
      if (value.lt !== undefined) {
        match[key] = { $lt: value.lt };
      }
      if (value.contains !== undefined) {
        match[key] = { $regex: value.contains, $options: 'i' };
      }
    }
  }

  return { $match: match };
}
