import {ObjectId} from 'mongodb';
import { TSchema, Type } from '@sinclair/typebox';
import _ from 'lodash';
import {IQueryOptions, Filter} from '@loomcore/common/models';
import {entityUtils} from '@loomcore/common/utils';

import {stringUtils} from './string.utils.js';

// todo: split this into separate files based on db (mongo, sql, etc)

/**
 * List of property names that should not be converted to ObjectIds, even if they end with 'Id'
 * These properties are meant to be stored and queried as strings
 */
export const PROPERTIES_THAT_ARE_NOT_OBJECT_IDS = ['_orgId'];

/**
 * SCHEMA-DRIVEN CONVERSION FUNCTIONS
 * These functions use TypeBox schemas to determine which fields need conversion
 */

/**
 * Converts MongoDB ObjectIds to strings based on TypeBox schema definition
 * @param entity Entity from MongoDB to be used in API
 * @param schema TypeBox schema with TypeboxObjectId fields
 * @returns Entity with ObjectIds converted to strings
 */
function convertObjectIdsToStrings<T>(entity: T, schema?: TSchema): T {
	if (!entity) return entity;

	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(entity);

	// If no schema provided, just handle the _id field (legacy behavior)
	if (!schema) {
		// Basic fallback for when schema isn't provided - just handle _id
		if ((clone as any)._id && (clone as any)._id instanceof ObjectId) {
			(clone as any)._id = (clone as any)._id.toString();
		}
		return clone;
	}

	// Extract object id fields from schema
	const processEntity = (obj: any, subSchema: TSchema, path: string[] = []) => {
		// If not an object or null, nothing to process
		if (!obj || typeof obj !== 'object') return;

		// Handle 'allOf' schema composition (from Type.Intersect)
		if (subSchema.allOf && Array.isArray(subSchema.allOf)) {
			// Process each schema in the allOf array
			for (const nestedSchema of subSchema.allOf) {
				processEntity(obj, nestedSchema, path);
			}
			return;
		}

		// Schema is an object with properties
		if (subSchema.type === 'object' && subSchema.properties) {
			for (const [key, propSchema] of Object.entries(subSchema.properties)) {
				if (!propSchema || typeof propSchema !== 'object') continue;
				
				const typedPropSchema = propSchema as TSchema;
				const fullPath = [...path, key];

				// If this is an ObjectId field
				if (typedPropSchema.format === 'objectid') {
					// Skip properties that shouldn't be treated as ObjectIds
					if (path.length === 0 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
						continue;
					}

					// Convert ObjectId to string
					if (obj[key] instanceof ObjectId) {
						obj[key] = obj[key].toString();
					}
				} 
				// Process nested object
				else if (typedPropSchema.type === 'object' && obj[key]) {
					processEntity(obj[key], typedPropSchema, fullPath);
				}
				// Process array
				else if (typedPropSchema.type === 'array' && Array.isArray(obj[key])) {
					const items = typedPropSchema.items as TSchema;
					
					// Process each item in the array
					if (items) {
						for (let i = 0; i < obj[key].length; i++) {
							// If array of ObjectIds
							if (items.format === 'objectid') {
								// Skip properties that shouldn't be treated as ObjectIds
								if (path.length === 0 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
									continue;
								}
								
								if (obj[key][i] instanceof ObjectId) {
									obj[key][i] = obj[key][i].toString();
								}
							}
							// If array of objects, process each object
							else if (items.type === 'object') {
								processEntity(obj[key][i], items, [...fullPath, i.toString()]);
							}
						}
					}
				}
			}
		}
	};

	// Process the entity using the schema
	processEntity(clone, schema);
	return clone;
}

/**
 * Converts strings to MongoDB ObjectIds based on TypeBox schema definition
 * @param entity API model to be saved to MongoDB
 * @param schema TypeBox schema with TypeboxObjectId fields 
 * @returns Entity with strings converted to ObjectIds for MongoDB operations
 */
function convertStringsToObjectIds(entity: any, schema: TSchema): any {
	if (!entity) return entity;
	
	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(entity);
	
	// Extract object id fields from schema and process the entity
	const processEntity = (obj: any, subSchema: TSchema, path: string[] = []): any => {
		// If not an object or null, nothing to process
		if (!obj || typeof obj !== 'object') return obj;
		
		// Handle Date objects - preserve them
		if (obj instanceof Date) {
			return obj;
		}
		
		// Handle 'allOf' schema composition (from Type.Intersect)
		if (subSchema.allOf && Array.isArray(subSchema.allOf)) {
			// Make a copy of the object to work with
			let result = { ...obj };
			
			// Process each schema in the allOf array
			for (const nestedSchema of subSchema.allOf) {
				result = processEntity(result, nestedSchema, path);
			}
			
			return result;
		}
		
		// Handle arrays
		if (Array.isArray(obj)) {
			// Get the schema for array items
			const items = subSchema.items as TSchema;
			if (!items) return obj; // No schema for items, return as is
			
			// If array of ObjectIds (items has objectid format)
			if (items.format === 'objectid') {
				// Skip properties that shouldn't be treated as ObjectIds
				if (path.length === 1 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(path[0])) {
					return obj;
				}
				
				// Convert each string to ObjectId
				return obj.map(item => {
					if (typeof item === 'string' && entityUtils.isValidObjectId(item)) {
						return new ObjectId(item);
					}
					return item;
				});
			}
			
			// For array of objects, process each item
			if (items.type === 'object') {
				return obj.map((item: any, index: number): any => 
					processEntity(item, items, [...path, index.toString()])
				);
			}
			
			// For other array types, return as is
			return obj;
		}
		
		// Process object properties
		const result: any = { ...obj };
		
		// Schema is an object with properties
		if (subSchema.type === 'object' && subSchema.properties) {
			for (const [key, propSchema] of Object.entries(subSchema.properties)) {
				if (!propSchema || typeof propSchema !== 'object' || result[key] === null || result[key] === undefined) {
					continue;
				}
				
				const typedPropSchema = propSchema as TSchema;
				const fullPath = [...path, key];
				const value = result[key];
				
				// Check if this property should be an ObjectId (has objectid format)
				const isObjectIdField = typedPropSchema.format === 'objectid';
				
				// Skip properties that shouldn't be treated as ObjectIds
				if (isObjectIdField && path.length === 0 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
					continue;
				}
				
				// Convert string to ObjectId if property is defined as objectid format
				if (isObjectIdField && typeof value === 'string' && entityUtils.isValidObjectId(value)) {
					result[key] = new ObjectId(value);
				}
				// Process arrays
				else if (typedPropSchema.type === 'array' && Array.isArray(value)) {
					result[key] = processEntity(value, typedPropSchema, fullPath);
				}
				// Process nested objects
				else if (typedPropSchema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
					result[key] = processEntity(value, typedPropSchema, fullPath);
				}
			}
		}
		
		return result;
	};
	
	// Process the entity using the schema and return result
	return processEntity(clone, schema);
}

/**
 * Converts string ID to MongoDB ObjectId for database operations
 * @param value The value to convert
 * @returns ObjectId instance or the original value if conversion not possible
 */
function convertStringToObjectId(value: any): ObjectId | any {
	// If it's already an ObjectId, return it
	if (value instanceof ObjectId) {
		return value;
	}
	
	// If it's null or undefined, return as is
	if (value === null || value === undefined) {
		return value;
	}
	
	// If it's a string and looks like a valid ObjectId, convert it
	if (typeof value === 'string' && entityUtils.isValidObjectId(value)) {
		try {
			return new ObjectId(value);
		} catch (error) {
			console.warn(`Failed to convert string "${value}" to ObjectId:`, error);
			return value; // Return original if conversion fails
		}
	}
	
	// For all other cases, return the value as is
	return value;
}

function buildMongoMatchFromQueryOptions(queryOptions: IQueryOptions) {
	// {
	// 	$match: {
	// 		categoryId: ObjectId("67777e98f48cf88db44efb27")
	// 	}
	// }
	const filters = queryOptions.filters || {};
	let match: any = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value) {
			if (value.eq !== undefined) {
				//if (!ignoredProperties.includes(key) && key.endsWith('Id') && doc[key]) {
				if (typeof value.eq === 'string' 
					&& key.endsWith('Id') 
					&& !PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key) 
					&& entityUtils.isValidObjectId(value.eq)) {
					match[key] = new ObjectId(value.eq)
				}
				// Convert numeric strings to numbers
				else if (typeof value.eq === 'string' && !isNaN(Number(value.eq))) {
					match[key] = Number(value.eq);
				}
				else {
					match[key] = value.eq;
				}
			}
		  else if (value.in !== undefined && Array.isArray(value.in)) {
				// Handle $in operator
				if (key.endsWith('Id') && !PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
					// Convert string values to ObjectIds for properties ending with 'Id'
					const objectIds = value.in
						.filter(val => typeof val === 'string' && entityUtils.isValidObjectId(val))
						.map(val => new ObjectId(val as string));
					if (objectIds.length > 0) {
						match[key] = { $in: objectIds };
					}
				} else {
					// Convert numeric strings to numbers in arrays
					const convertedValues = value.in.map(val => 
						typeof val === 'string' && !isNaN(Number(val)) ? Number(val) : val
					);
					match[key] = { $in: convertedValues };
				}
			}
			else if (value.gte !== undefined) {
				match[key] = { $gte: value.gte };
			}
			else if (value.lte !== undefined) {
				match[key] = { $lte: value.lte };
			}
			else if (value.gt !== undefined) {
				match[key] = { $gt: value.gt };
			}
			else if (value.lt !== undefined) {
				match[key] = { $lt: value.lt };
			}
			else if (value.contains !== undefined) {
				match[key] = { $regex: value.contains, $options: 'i' };
			}
		}
	}

	return { $match: match };
}

function buildSQLWhereClauseFromQueryOptions(queryOptions: IQueryOptions, columnAliasMap: { [key: string]: string }) {
	const filters = queryOptions.filters || {};
	let whereClause = '';

	for (const [key, value] of Object.entries(filters)) {
		if (value) {
			const tableAlias = (columnAliasMap && columnAliasMap[key]) || '';
			whereClause = addKeyValueToWhereClause(whereClause, key, value, tableAlias);
		}
	}

	return whereClause;
}

function addKeyValueToWhereClause(whereClause: string, key: string, value: Filter, tableAlias: string = ''): string {
	let column = tableAlias ? `${tableAlias}.${stringUtils.pascalCase(key)}` : stringUtils.pascalCase(key);
	let formattedValue: string = '';
	let operator = '=';

	if (value) {
		if (value.eq !== undefined) {
			formattedValue = formatValue(value.eq);
			operator = '=';
		} else if (value.in !== undefined && Array.isArray(value.in)) {
			// Handle IN operator
			const formattedValues = value.in.map(val => formatValue(val)).join(', ');
			formattedValue = `(${formattedValues})`;
			operator = 'IN';
		} else if (value.gte !== undefined) {
			formattedValue = formatValue(value.gte);
			operator = '>=';
		} else if (value.lte !== undefined) {
			formattedValue = formatValue(value.lte);
			operator = '<=';
		} else if (value.gt !== undefined) {
			formattedValue = formatValue(value.gt);
			operator = '>';
		} else if (value.lt !== undefined) {
			formattedValue = formatValue(value.lt);
			operator = '<';
		} else if (value.contains !== undefined) {
			column = `LOWER(${column})`;
			formattedValue = formatValue(value.contains, true).toLowerCase();
			operator = 'LIKE';
		}
	}

	const condition = `${column} ${operator} ${formattedValue}`;

	return appendToWhereClause(whereClause, condition);
}

function appendToWhereClause(whereClause: string, condition: string): string {
	let newWhereClause = whereClause.trim();
	if (newWhereClause.toUpperCase() === 'WHERE' || newWhereClause === '') {
		newWhereClause = `WHERE ${condition}`;
	}
	else {
		newWhereClause = `${newWhereClause} AND ${condition}`;
	}

	return newWhereClause;
}

function formatValue(value: string | number | boolean | Date, isLikeOperator: boolean = false): string {
	if (typeof value === 'string') {
		// Check if the string is a numeric value
		if (!isNaN(Number(value))) {
			return value;
		}
		// Check if the string is 'true' or 'false' and convert to boolean
		if (value.toLowerCase() === 'true') {
			return 'TRUE';
		}
		if (value.toLowerCase() === 'false') {
			return 'FALSE';
		}
		return isLikeOperator ? `'%${value}%'` : `'${value}'`;
	} else if (typeof value === 'number') {
		return value.toString();
	} else if (typeof value === 'boolean') {
		return value ? 'TRUE' : 'FALSE';
	} else if (value instanceof Date) {
		const dateString = value.toISOString().split('T')[0]; // BigQuery does not like the time part of the date
		return `DATETIME('${dateString}')`;
	} else {
		throw new Error('Unsupported value type');
	}
}

/**
 * Convert our custom filter format to a Mongoose query
 */
// function buildMongooseQueryFromFilters(filters: { [key: string]: Filter }): any {
//  const query: any = {};
  
//  for (const key in filters) {
//    const filter = filters[key];
    
//    if (filter.eq !== undefined) {
//      // Handle ObjectIds for fields ending with 'Id'
//      if (typeof filter.eq === 'string' && key.endsWith('Id') && entityUtils.isValidObjectId(filter.eq)) {
//        query[key] = new ObjectId(filter.eq);
//      } else {
//        query[key] = filter.eq;
//      }
//    }
//    if (filter.ne !== undefined) {
//      query[key] = { $ne: filter.ne };
//    }
//    if (filter.gt !== undefined) {
//      query[key] = { ...query[key], $gt: filter.gt };
//    }
//    if (filter.gte !== undefined) {
//      query[key] = { ...query[key], $gte: filter.gte };
//    }
//    if (filter.lt !== undefined) {
//      query[key] = { ...query[key], $lt: filter.lt };
//    }
//    if (filter.lte !== undefined) {
//      query[key] = { ...query[key], $lte: filter.lte };
//    }
//    if (filter.contains !== undefined) {
//      query[key] = { $regex: filter.contains, $options: 'i' };
//    }
//    if (filter.startsWith !== undefined) {
//      query[key] = { $regex: `^${filter.startsWith}`, $options: 'i' };
//    }
//    if (filter.endsWith !== undefined) {
//      query[key] = { $regex: `${filter.endsWith}$`, $options: 'i' };
//    }
//    if (filter.any !== undefined) {
//      query[key] = { $in: filter.any };
//    }
//    if (filter.all !== undefined) {
//      query[key] = { $all: filter.all };
//    }
//  }
  
//  return query;
// }

export const dbUtils = {
	buildMongoMatchFromQueryOptions,
	buildSQLWhereClauseFromQueryOptions,
	addKeyValueToWhereClause,
	appendToWhereClause,
	formatValue,
	convertStringToObjectId,
	
	// Schema-driven functions
	convertStringsToObjectIds,
	convertObjectIdsToStrings,
}
