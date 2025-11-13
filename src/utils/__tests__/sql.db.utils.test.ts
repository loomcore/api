import { describe, it, expect } from 'vitest';
import { IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { sqlDbUtils } from '../sql.db.utils.js';

describe('sqlDbUtils', () => {

  
  describe('buildSQLWhereClauseFromQueryOptions', () => {
    it('should build SQL IN clause for string array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: ['active', 'pending', 'completed']
          }
        }
      };

      const result = sqlDbUtils.buildSQLWhereClauseFromQueryOptions(queryOptions, {});

      expect(result).toBe("WHERE Status IN ('active', 'pending', 'completed')");
    });

    it('should build SQL IN clause for number array', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          priority: {
            in: [1, 2, 3]
          }
        }
      };

      const result = sqlDbUtils.buildSQLWhereClauseFromQueryOptions(queryOptions, {});

      expect(result).toBe("WHERE Priority IN (1, 2, 3)");
    });

    it('should combine IN clause with other conditions', () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          status: {
            in: ['active', 'pending']
          },
          priority: {
            eq: 1
          }
        }
      };

      const result = sqlDbUtils.buildSQLWhereClauseFromQueryOptions(queryOptions, {});

      expect(result).toBe("WHERE Status IN ('active', 'pending') AND Priority = 1");
    });
  });
}); 