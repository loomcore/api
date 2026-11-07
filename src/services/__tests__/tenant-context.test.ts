import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runWithTenantContext, getTenantContext, getTenantOrgId, ITenantContext } from '../tenant-context.js';

describe('TenantContext AsyncLocalStorage', () => {
  describe('runWithTenantContext', () => {
    it('should provide tenant context within the callback', () => {
      const context: ITenantContext = { orgId: 123 };
      
      runWithTenantContext(context, () => {
        expect(getTenantContext()).toEqual(context);
        expect(getTenantOrgId()).toBe(123);
      });
    });

    it('should return the callback result', () => {
      const context: ITenantContext = { orgId: 456 };
      
      const result = runWithTenantContext(context, () => {
        return 'computed value';
      });
      
      expect(result).toBe('computed value');
    });

    it('should return undefined orgId when context has no orgId', () => {
      const context: ITenantContext = {};
      
      runWithTenantContext(context, () => {
        expect(getTenantContext()).toEqual({});
        expect(getTenantOrgId()).toBeUndefined();
      });
    });

    it('should support string orgId', () => {
      const context: ITenantContext = { orgId: 'org-abc-123' };
      
      runWithTenantContext(context, () => {
        expect(getTenantOrgId()).toBe('org-abc-123');
      });
    });
  });

  describe('nested context restoration', () => {
    it('should restore outer context after nested context completes', () => {
      const outerContext: ITenantContext = { orgId: 100 };
      const innerContext: ITenantContext = { orgId: 200 };
      
      runWithTenantContext(outerContext, () => {
        expect(getTenantOrgId()).toBe(100);
        
        runWithTenantContext(innerContext, () => {
          expect(getTenantOrgId()).toBe(200);
        });
        
        expect(getTenantOrgId()).toBe(100);
      });
    });

    it('should restore outer context after nested context throws', () => {
      const outerContext: ITenantContext = { orgId: 100 };
      const innerContext: ITenantContext = { orgId: 200 };
      
      runWithTenantContext(outerContext, () => {
        expect(getTenantOrgId()).toBe(100);
        
        try {
          runWithTenantContext(innerContext, () => {
            expect(getTenantOrgId()).toBe(200);
            throw new Error('inner error');
          });
        } catch {
          // expected
        }
        
        expect(getTenantOrgId()).toBe(100);
      });
    });

    it('should handle deeply nested contexts', () => {
      const contexts = [
        { orgId: 1 },
        { orgId: 2 },
        { orgId: 3 },
        { orgId: 4 },
      ] as ITenantContext[];
      
      runWithTenantContext(contexts[0], () => {
        expect(getTenantOrgId()).toBe(1);
        
        runWithTenantContext(contexts[1], () => {
          expect(getTenantOrgId()).toBe(2);
          
          runWithTenantContext(contexts[2], () => {
            expect(getTenantOrgId()).toBe(3);
            
            runWithTenantContext(contexts[3], () => {
              expect(getTenantOrgId()).toBe(4);
            });
            
            expect(getTenantOrgId()).toBe(3);
          });
          
          expect(getTenantOrgId()).toBe(2);
        });
        
        expect(getTenantOrgId()).toBe(1);
      });
    });
  });

  describe('context cleanup on rejection and unscoped calls', () => {
    it('should return undefined when accessed outside any context', () => {
      expect(getTenantContext()).toBeUndefined();
      expect(getTenantOrgId()).toBeUndefined();
    });

    it('should cleanup context after callback completes', () => {
      runWithTenantContext({ orgId: 999 }, () => {
        expect(getTenantOrgId()).toBe(999);
      });
      
      expect(getTenantContext()).toBeUndefined();
      expect(getTenantOrgId()).toBeUndefined();
    });

    it('should cleanup context after callback throws', () => {
      try {
        runWithTenantContext({ orgId: 888 }, () => {
          expect(getTenantOrgId()).toBe(888);
          throw new Error('test error');
        });
      } catch {
        // expected
      }
      
      expect(getTenantContext()).toBeUndefined();
      expect(getTenantOrgId()).toBeUndefined();
    });

    it('should support system/unscoped operations with empty context', () => {
      runWithTenantContext({}, () => {
        expect(getTenantOrgId()).toBeUndefined();
        expect(getTenantContext()).toEqual({});
      });
    });
  });

  describe('concurrent request isolation', () => {
    it('should isolate interleaved concurrent different-org async operations', async () => {
      const org1Results: (number | undefined)[] = [];
      const org2Results: (number | undefined)[] = [];
      const org3Results: (number | undefined)[] = [];
      
      const simulateRequest = async (orgId: number, results: (number | undefined)[], delayMs: number): Promise<void> => {
        return new Promise((resolve) => {
          runWithTenantContext({ orgId }, async () => {
            results.push(getTenantOrgId());
            
            await new Promise(r => setTimeout(r, delayMs));
            results.push(getTenantOrgId());
            
            await new Promise(r => setTimeout(r, delayMs));
            results.push(getTenantOrgId());
            
            resolve();
          });
        });
      };
      
      await Promise.all([
        simulateRequest(1, org1Results, 10),
        simulateRequest(2, org2Results, 15),
        simulateRequest(3, org3Results, 5),
      ]);
      
      expect(org1Results).toEqual([1, 1, 1]);
      expect(org2Results).toEqual([2, 2, 2]);
      expect(org3Results).toEqual([3, 3, 3]);
    });

    it('should isolate rapidly interleaved microtask operations', async () => {
      const results: Map<number, number[]> = new Map();
      
      const simulateOrgOperation = async (orgId: number): Promise<void> => {
        const orgResults: number[] = [];
        results.set(orgId, orgResults);
        
        await new Promise<void>((resolve) => {
          runWithTenantContext({ orgId }, async () => {
            for (let i = 0; i < 5; i++) {
              orgResults.push(getTenantOrgId() as number);
              await Promise.resolve();
            }
            resolve();
          });
        });
      };
      
      await Promise.all([
        simulateOrgOperation(100),
        simulateOrgOperation(200),
        simulateOrgOperation(300),
        simulateOrgOperation(400),
      ]);
      
      expect(results.get(100)).toEqual([100, 100, 100, 100, 100]);
      expect(results.get(200)).toEqual([200, 200, 200, 200, 200]);
      expect(results.get(300)).toEqual([300, 300, 300, 300, 300]);
      expect(results.get(400)).toEqual([400, 400, 400, 400, 400]);
    });

    it('should maintain isolation through setImmediate callbacks', async () => {
      const results: Map<number, number[]> = new Map();
      
      const simulateWithSetImmediate = (orgId: number): Promise<void> => {
        return new Promise((resolve) => {
          runWithTenantContext({ orgId }, () => {
            const orgResults: number[] = [];
            results.set(orgId, orgResults);
            
            orgResults.push(getTenantOrgId() as number);
            
            setImmediate(() => {
              orgResults.push(getTenantOrgId() as number);
              
              setImmediate(() => {
                orgResults.push(getTenantOrgId() as number);
                resolve();
              });
            });
          });
        });
      };
      
      await Promise.all([
        simulateWithSetImmediate(10),
        simulateWithSetImmediate(20),
        simulateWithSetImmediate(30),
      ]);
      
      expect(results.get(10)).toEqual([10, 10, 10]);
      expect(results.get(20)).toEqual([20, 20, 20]);
      expect(results.get(30)).toEqual([30, 30, 30]);
    });

    it('should maintain isolation through process.nextTick callbacks', async () => {
      const results: Map<number, number[]> = new Map();
      
      const simulateWithNextTick = (orgId: number): Promise<void> => {
        return new Promise((resolve) => {
          runWithTenantContext({ orgId }, () => {
            const orgResults: number[] = [];
            results.set(orgId, orgResults);
            
            orgResults.push(getTenantOrgId() as number);
            
            process.nextTick(() => {
              orgResults.push(getTenantOrgId() as number);
              
              process.nextTick(() => {
                orgResults.push(getTenantOrgId() as number);
                resolve();
              });
            });
          });
        });
      };
      
      await Promise.all([
        simulateWithNextTick(11),
        simulateWithNextTick(22),
        simulateWithNextTick(33),
      ]);
      
      expect(results.get(11)).toEqual([11, 11, 11]);
      expect(results.get(22)).toEqual([22, 22, 22]);
      expect(results.get(33)).toEqual([33, 33, 33]);
    });

    it('should isolate parallel Promise chains for different orgs', async () => {
      const results: Map<string, (number | string | undefined)[]> = new Map();
      
      const simulateChain = async (orgId: number): Promise<void> => {
        const key = `org-${orgId}`;
        results.set(key, []);
        
        return new Promise((resolve) => {
          runWithTenantContext({ orgId }, () => {
            const chain = results.get(key)!;
            
            Promise.resolve()
              .then(() => {
                chain.push(getTenantOrgId());
                return 'step1';
              })
              .then((prev) => {
                chain.push(getTenantOrgId());
                chain.push(prev);
                return 'step2';
              })
              .then((prev) => {
                chain.push(getTenantOrgId());
                chain.push(prev);
                resolve();
              });
          });
        });
      };
      
      await Promise.all([
        simulateChain(1000),
        simulateChain(2000),
      ]);
      
      expect(results.get('org-1000')).toEqual([1000, 1000, 'step1', 1000, 'step2']);
      expect(results.get('org-2000')).toEqual([2000, 2000, 'step1', 2000, 'step2']);
    });

    it('should handle mixed sync and async operations without context leakage', async () => {
      const results: number[] = [];
      
      const syncOp = (orgId: number): void => {
        runWithTenantContext({ orgId }, () => {
          results.push(getTenantOrgId() as number);
        });
      };
      
      const asyncOp = async (orgId: number): Promise<void> => {
        return new Promise((resolve) => {
          runWithTenantContext({ orgId }, async () => {
            await Promise.resolve();
            results.push(getTenantOrgId() as number);
            resolve();
          });
        });
      };
      
      syncOp(1);
      const p1 = asyncOp(2);
      syncOp(3);
      const p2 = asyncOp(4);
      syncOp(5);
      
      await Promise.all([p1, p2]);
      
      expect(results.slice(0, 3)).toEqual([1, 3, 5]);
      expect(results.slice(3).sort()).toEqual([2, 4]);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid context switching', () => {
      for (let i = 0; i < 100; i++) {
        runWithTenantContext({ orgId: i }, () => {
          expect(getTenantOrgId()).toBe(i);
        });
        expect(getTenantOrgId()).toBeUndefined();
      }
    });

    it('should handle zero as a valid orgId', () => {
      runWithTenantContext({ orgId: 0 }, () => {
        expect(getTenantOrgId()).toBe(0);
      });
    });

    it('should handle negative orgId', () => {
      runWithTenantContext({ orgId: -1 }, () => {
        expect(getTenantOrgId()).toBe(-1);
      });
    });

    it('should handle async/await within context', async () => {
      const result = await new Promise<number | undefined>((resolve) => {
        runWithTenantContext({ orgId: 42 }, async () => {
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
          resolve(getTenantOrgId());
        });
      });
      
      expect(result).toBe(42);
    });
  });
});
