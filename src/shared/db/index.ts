// Server-only. Never import from client components.
export { closeClient, getClient, getDb, withTransaction } from "./client";
export { COLLECTION_NAMES, collectionsOf, getCollections } from "./collections";
export type { CollectionMap, CollectionName, Collections } from "./collections";
export { INDEXES, ensureIndexes } from "./indexes";
export { duplicateKeyIndexName, isDuplicateKeyError, newId } from "./helpers";
// `withTestDb` is in "@/shared/db/testing" (it imports vitest) and is not exported here.
