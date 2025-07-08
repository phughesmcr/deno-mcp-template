/**
 * @description An implementation of the example Memory Server using Deno KV
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import { join } from "@std/path";

export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface Observation {
  entityName: string;
  contents: string[];
}

export interface Deletion {
  entityName: string;
  observations: string[];
}

export interface AddObservationResult {
  entityName: string;
  addedObservations: string[];
}

async function readGraphFromFile(path: string): Promise<KnowledgeGraph> {
  const data = await Deno.readTextFile(path);
  const lines = data.split("\n").filter((line) => line.trim() !== "");
  return lines.reduce((graph: KnowledgeGraph, line) => {
    const item = JSON.parse(line);
    if (item.type === "entity") graph.entities.push(item as Entity);
    if (item.type === "relation") graph.relations.push(item as Relation);
    return graph;
  }, { entities: [], relations: [] });
}

function isNewEntity(graph: KnowledgeGraph) {
  return (entity: Entity) => {
    return !graph.entities.some((e) => e.name === entity.name);
  };
}

function isNewRelationship(graph: KnowledgeGraph) {
  return (relation: Relation) => {
    return !graph.relations.some((existingRelation) =>
      existingRelation.from === relation.from &&
      existingRelation.to === relation.to &&
      existingRelation.relationType === relation.relationType
    );
  };
}

export class KnowledgeGraphManager {
  #kv: Deno.Kv;

  /**
   * The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
   * @param kv - The KV store to use
   */
  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  /** Returns the path to the local file that stores the knowledge graph */
  get localPath(): string {
    return join(import.meta.dirname ?? "", "memory.json");
  }

  /** Returns a copy of the knowledge graph */
  async readGraph(): Promise<KnowledgeGraph> {
    // Read entities and relations from KV
    const entitiesIter = this.#kv.list<Entity>({ prefix: ["entities"] });
    const relationsIter = this.#kv.list<Relation>({ prefix: ["relations"] });

    // Unroll iterators into arrays
    const entities: Entity[] = [];
    for await (const entry of entitiesIter) {
      entities.push(entry.value);
    }

    const relations: Relation[] = [];
    for await (const entry of relationsIter) {
      relations.push(entry.value);
    }

    return { entities, relations };
  }

  /**
   * Creates new entities in the knowledge graph
   * @param entities - The entities to create
   * @returns An array of any entities that were created; existing entities are not returned
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    // Filter out entities that already exist
    const graph = await this.readGraph();
    const exists = isNewEntity(graph);
    const newEntities = entities.filter(exists);

    // If no new entities, return early
    if (newEntities.length === 0) {
      return [];
    }

    // Create new entities in KV
    const transaction = this.#kv.atomic();
    for (const entity of newEntities) {
      transaction.set(["entities", entity.name], entity);
    }

    const result = await transaction.commit();
    if (!result.ok) {
      throw new Error("Failed to commit entity creation transaction");
    }

    return newEntities;
  }

  /**
   * Creates new relations in the knowledge graph
   * @param relations - The relations to create
   * @returns An array of any relations that were created; existing relations are not returned
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    // Filter out relations that already exist
    const graph = await this.readGraph();
    const exists = isNewRelationship(graph);
    const newRelations = relations.filter(exists);

    // If no new relations, return early
    if (newRelations.length === 0) {
      return [];
    }

    // Create new relations in KV
    const transaction = this.#kv.atomic();
    for (const relation of newRelations) {
      transaction.set(["relations", relation.from, relation.to, relation.relationType], relation);
    }
    await transaction.commit();

    return newRelations;
  }

  /**
   * Adds observations to existing entities in the knowledge graph
   * @param observations - The observations to add
   * @returns An array of any observations that were added; existing observations are not returned
   */
  async addObservations(observations: Observation[]): Promise<AddObservationResult[]> {
    const results: AddObservationResult[] = [];
    const transaction = this.#kv.atomic();

    for (const obs of observations) {
      const entityResult = await this.#kv.get<Entity>(["entities", obs.entityName]);

      if (!entityResult.value) {
        throw new Error(`Entity with name ${obs.entityName} not found`);
      }

      const entity = entityResult.value;
      const newObservations = obs.contents.filter((content) =>
        !entity.observations.includes(content)
      );

      if (newObservations.length > 0) {
        entity.observations.push(...newObservations);
        transaction.set(["entities", obs.entityName], entity);
        results.push({ entityName: obs.entityName, addedObservations: newObservations });
      }
    }

    await transaction.commit();
    return results;
  }

  /**
   * Deletes entities from the knowledge graph
   * @param entityNames - The names of the entities to delete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    if (entityNames.length === 0) return;

    const transaction = this.#kv.atomic();

    // Delete the entities
    for (const name of entityNames) {
      transaction.delete(["entities", name]);
    }

    // Get all relations first
    const relationsEntries = await this.getRelations(entityNames);

    // Delete relations involving these entities
    for (const key of relationsEntries) {
      transaction.delete(key);
    }

    await transaction.commit();
  }

  /**
   * Returns the keys of all relations that involve the given entities
   * @param entityNames - The names of the entities to get relations for
   * @returns An array of relations that involve the given entities
   */
  async getRelations(entityNames: string[]): Promise<Deno.KvKey[]> {
    const result: Deno.KvKey[] = [];
    const relationsIter = this.#kv.list({ prefix: ["relations"] });

    for await (const entry of relationsIter) {
      const key = entry.key;
      // key structure is ["relations", from, to, relationType]
      const from = key[1];
      const to = key[2];

      if (typeof from === "string" && typeof to === "string") {
        if (entityNames.includes(from) || entityNames.includes(to)) {
          result.push(key);
        }
      }
    }

    return result;
  }

  /**
   * Deletes observations from existing entities in the knowledge graph
   * @param deletions - The observations to delete
   */
  async deleteObservations(deletions: Deletion[]): Promise<void> {
    const transaction = this.#kv.atomic();

    for (const d of deletions) {
      const entityResult = await this.#kv.get<Entity>(["entities", d.entityName]);

      if (entityResult.value) {
        const entity = entityResult.value;
        entity.observations = entity.observations.filter((o) => !d.observations.includes(o));
        transaction.set(["entities", d.entityName], entity);
      }
    }

    await transaction.commit();
  }

  /**
   * Deletes relations from the knowledge graph
   * @param relations - The relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    const transaction = this.#kv.atomic();

    for (const relation of relations) {
      transaction.delete(["relations", relation.from, relation.to, relation.relationType]);
    }

    await transaction.commit();
  }

  /**
   * Searches the knowledge graph for nodes that match the given query
   * @param query - The query to search for
   * @returns A copy of the knowledge graph with only the nodes that match the query
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.readGraph();
    const lowercaseQuery = query.toLowerCase();

    // Filter entities
    const filteredEntities = graph.entities.filter((e) =>
      e.name.toLowerCase().includes(lowercaseQuery) ||
      e.entityType.toLowerCase().includes(lowercaseQuery) ||
      e.observations.some((o) => o.toLowerCase().includes(lowercaseQuery))
    );

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter((r) =>
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );

    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Opens nodes in the knowledge graph
   * @param names - The names of the nodes to open
   * @returns A copy of the knowledge graph with only the nodes that are open
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.readGraph();

    // Filter entities
    const filteredEntities = graph.entities.filter((e) => names.includes(e.name));

    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));

    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter((r) =>
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );

    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Exports the current KV data to a file
   */
  async exportToFile(): Promise<void> {
    try {
      const graph = await this.readGraph();
      const lines = [
        ...graph.entities.map((e) => JSON.stringify({ type: "entity", ...e })),
        ...graph.relations.map((r) => JSON.stringify({ type: "relation", ...r })),
      ];
      await Deno.writeTextFile(this.localPath, lines.join("\n"));
    } catch (error) {
      const message = `Error exporting graph to file: ${
        error instanceof Error ? error.message : String(error)
      }`;
      throw new Error(message);
    }
  }

  /**
   * Imports data from a file to the KV store
   */
  async importFromFile(): Promise<void> {
    let graph: KnowledgeGraph;

    try {
      graph = await readGraphFromFile(this.localPath);
    } catch (error) {
      if (
        error instanceof Error && "code" in error &&
        error.code === "ENOENT"
      ) {
        graph = { entities: [], relations: [] };
      } else {
        const message = `Error reading graph from file: ${
          error instanceof Error ? error.message : String(error)
        }`;
        throw new Error(message);
      }
    }

    // Clear existing data first
    const entityEntries = this.#kv.list({ prefix: ["entities"] });
    const relationEntries = this.#kv.list({ prefix: ["relations"] });

    const transaction = this.#kv.atomic();

    for await (const entry of entityEntries) {
      transaction.delete(entry.key);
    }

    for await (const entry of relationEntries) {
      transaction.delete(entry.key);
    }

    // Add entities from file
    for (const entity of graph.entities) {
      transaction.set(["entities", entity.name], entity);
    }

    // Add relations from file
    for (const relation of graph.relations) {
      transaction.set(
        ["relations", relation.from, relation.to, relation.relationType],
        relation,
      );
    }

    await transaction.commit();
  }
}
