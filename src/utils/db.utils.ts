import {IQueryOptions, Filter} from '../models/query-options.model.js';
import {stringUtils} from './string.utils.js';
import {ObjectId} from 'mongodb';
import {entityUtils} from './entity.utils.js';

// todo: split this into separate files based on db (mongo, sql, etc)

/**
 * List of property names that should not be converted to ObjectIds, even if they end with 'Id'
 * These properties are meant to be stored and queried as strings
 */
export const PROPERTIES_THAT_ARE_NOT_OBJECT_IDS = ['_orgId'];

/**
 * Convert our custom filter format to a Mongoose query
 */
// function buildMongooseQueryFromFilters(filters: { [key: string]: Filter }): any {
// 	const query: any = {};
	
// 	for (const key in filters) {
// 		const filter = filters[key];
		
// 		if (filter.eq !== undefined) {
// 			// Handle ObjectIds for fields ending with 'Id'
// 			if (typeof filter.eq === 'string' && key.endsWith('Id') && entityUtils.isValidObjectId(filter.eq)) {
// 				query[key] = new ObjectId(filter.eq);
// 			} else {
// 				query[key] = filter.eq;
// 			}
// 		}
// 		if (filter.ne !== undefined) {
// 			query[key] = { $ne: filter.ne };
// 		}
// 		if (filter.gt !== undefined) {
// 			query[key] = { ...query[key], $gt: filter.gt };
// 		}
// 		if (filter.gte !== undefined) {
// 			query[key] = { ...query[key], $gte: filter.gte };
// 		}
// 		if (filter.lt !== undefined) {
// 			query[key] = { ...query[key], $lt: filter.lt };
// 		}
// 		if (filter.lte !== undefined) {
// 			query[key] = { ...query[key], $lte: filter.lte };
// 		}
// 		if (filter.contains !== undefined) {
// 			query[key] = { $regex: filter.contains, $options: 'i' };
// 		}
// 		if (filter.startsWith !== undefined) {
// 			query[key] = { $regex: `^${filter.startsWith}`, $options: 'i' };
// 		}
// 		if (filter.endsWith !== undefined) {
// 			query[key] = { $regex: `${filter.endsWith}$`, $options: 'i' };
// 		}
// 		if (filter.any !== undefined) {
// 			query[key] = { $in: filter.any };
// 		}
// 		if (filter.all !== undefined) {
// 			query[key] = { $all: filter.all };
// 		}
// 	}
	
// 	return query;
// }

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
				if (typeof value.eq === 'string' && !PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key) 
					&& key.endsWith('Id') && entityUtils.isValidObjectId(value.eq)) {
					match[key] = new ObjectId(value.eq)
				}
				else {
					match[key] = value.eq;
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

// function sanitizeMongoInput(input: any) {
// 	if (input instanceof Object) {
// 		for (let key in input) {
// 			if (/^\$/.test(key)) {
// 				delete input[key];
// 			} else {
// 				sanitizeMongoInput(input[key]);
// 			}
// 		}
// 	}
// 	return input;
// }

export const dbUtils = {
	buildMongoMatchFromQueryOptions,
	buildSQLWhereClauseFromQueryOptions,
	addKeyValueToWhereClause,
	appendToWhereClause,
	formatValue,
	// buildMongooseQueryFromFilters,
	// sanitizeMongoInput,
}
