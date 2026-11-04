/**
 * MongoDB duplicate-key errors use code 11000.
 * bulkWrite surfaces the same code on MongoBulkWriteError and/or individual writeErrors.
 */
export function isMongoDuplicateKeyError(err: any): boolean {
  if (err?.code === 11000) { // this is the MongoDb error code for duplicate key
    return true;
  }
  return Array.isArray(err?.writeErrors) && err.writeErrors.some((writeError: any) => writeError?.code === 11000);
}
