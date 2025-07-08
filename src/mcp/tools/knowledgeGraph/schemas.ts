/**
 * @description Zod validation schemas for knowledge graph data structures
 * @module
 */

import { z } from "zod";

// Core entity schemas
export const EntitySchema = z.object({
  name: z.string().min(1, "Entity name required").max(255, "Entity name too long"),
  entityType: z.string().min(1, "Entity type required").max(100, "Entity type too long"),
  observations: z.array(z.string().max(1000, "Observation too long")).max(
    1000,
    "Too many observations",
  ),
});

export const RelationSchema = z.object({
  from: z.string().min(1, "From entity required").max(255, "From entity name too long"),
  to: z.string().min(1, "To entity required").max(255, "To entity name too long"),
  relationType: z.string().min(1, "Relation type required").max(100, "Relation type too long"),
});

export const ObservationSchema = z.object({
  entityName: z.string().min(1, "Entity name required").max(255, "Entity name too long"),
  contents: z.array(z.string().max(1000, "Content too long")).min(
    1,
    "At least one content required",
  ).max(100, "Too many contents"),
});

export const DeletionSchema = z.object({
  entityName: z.string().min(1, "Entity name required").max(255, "Entity name too long"),
  observations: z.array(z.string().max(1000, "Observation too long")).min(
    1,
    "At least one observation required",
  ).max(100, "Too many observations"),
});

// Tool argument schemas
export const CreateEntitiesArgsSchema = z.object({
  entities: z.array(EntitySchema).min(1, "At least one entity required").max(
    100,
    "Too many entities",
  ),
});

export const CreateRelationsArgsSchema = z.object({
  relations: z.array(RelationSchema).min(1, "At least one relation required").max(
    100,
    "Too many relations",
  ),
});

export const AddObservationsArgsSchema = z.object({
  observations: z.array(ObservationSchema).min(1, "At least one observation required").max(
    100,
    "Too many observations",
  ),
});

export const DeleteEntitiesArgsSchema = z.object({
  entityNames: z.array(z.string().min(1).max(255)).min(1, "At least one entity name required").max(
    100,
    "Too many entity names",
  ),
});

export const DeleteObservationsArgsSchema = z.object({
  deletions: z.array(DeletionSchema).min(1, "At least one deletion required").max(
    100,
    "Too many deletions",
  ),
});

export const DeleteRelationsArgsSchema = z.object({
  relations: z.array(RelationSchema).min(1, "At least one relation required").max(
    100,
    "Too many relations",
  ),
});

export const SearchNodesArgsSchema = z.object({
  query: z.string().min(1, "Query required").max(500, "Query too long"),
});

export const OpenNodesArgsSchema = z.object({
  names: z.array(z.string().min(1).max(255)).min(1, "At least one name required").max(
    50,
    "Too many names",
  ),
});

// JSON file parsing schemas for secure import/export
export const FileEntitySchema = z.object({
  type: z.literal("entity"),
  name: z.string().min(1).max(255),
  entityType: z.string().min(1).max(100),
  observations: z.array(z.string().max(1000)).max(1000),
});

export const FileRelationSchema = z.object({
  type: z.literal("relation"),
  from: z.string().min(1).max(255),
  to: z.string().min(1).max(255),
  relationType: z.string().min(1).max(100),
});

export const FileLineSchema = z.union([FileEntitySchema, FileRelationSchema]);
