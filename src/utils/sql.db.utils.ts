import _ from 'lodash';
import {IQueryOptions, Filter, IModelSpec} from '@loomcore/common/models';

import {stringUtils} from './string.utils.js';

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

export const sqlDbUtils = {
	buildSQLWhereClauseFromQueryOptions,
	addKeyValueToWhereClause,
	appendToWhereClause,
	formatValue,
}
