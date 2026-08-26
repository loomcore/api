/**
 * Property names that stay JSON strings in Mongo even when getIdSchema() / TypeboxObjectId
 * would otherwise mark them as format: 'objectid'.
 * These are not join keys: tenant id and audit actors.
 */
export const PROPERTIES_THAT_ARE_NOT_OBJECT_IDS = [
  '_orgId',
  '_createdBy',
  '_updatedBy',
  '_deletedBy',
];
