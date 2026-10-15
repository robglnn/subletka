import { z } from "zod";
import { RATE_LIMIT_NOTE } from "@/lib/agent-http";
import { dropSafeIntegerBounds, jsonSchema, OPERATIONS, type OperationName } from "@/lib/agent-query";
import { ApiError, CitiesResult, PublicListing, SearchResult } from "@/lib/agent-response";
import { SUPPORT_EMAIL } from "@/lib/support";

type ParamSchema = { type?: string; description?: string; example?: unknown; [key: string]: unknown };

const OPERATION_META: Record<OperationName, { operationId: string; response: z.ZodType }> = {
  search_listings: { operationId: "searchListings", response: SearchResult },
  get_listing: { operationId: "getListing", response: PublicListing },
  list_cities: { operationId: "listCities", response: CitiesResult },
};

const SCHEMA_URI = (id: string) => `#/components/schemas/${id}`;
const idOf = (schema: z.ZodType) => String(z.globalRegistry.get(schema)?.id);
const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: SCHEMA_URI(idOf(schema)) } } },
});

const parameters = (name: OperationName) => {
  const { path, schema } = OPERATIONS[name];
  const { properties, required = [] } = jsonSchema(schema) as { properties: Record<string, ParamSchema>; required?: string[] };
  return Object.entries(properties).map(([key, { description, example, ...rest }]) => {
    const inPath = path.includes(`{${key}}`);
    return {
      name: key,
      in: inPath ? "path" : "query",
      required: inPath || required.includes(key),
      ...(description ? { description } : {}),
      ...(example === undefined ? {} : { example }),
      schema: rest,
      ...(rest.type === "array" ? { style: "form", explode: false } : {}),
    };
  });
};

const componentSchemas = () => {
  const { schemas } = z.toJSONSchema(z.globalRegistry, { uri: SCHEMA_URI, override: dropSafeIntegerBounds });
  for (const schema of Object.values(schemas)) {
    delete schema.$schema;
    delete schema.$id;
  }
  return schemas;
};

export const openApiSpec = (site: string) => ({
  openapi: "3.1.0",
  info: {
    title: "Subletka",
    version: "1.0.0",
    summary: "Rooms and flats for long-term stays in Warsaw and Kraków.",
    description: `Read-only search over every active Subletka listing. No key needed. lang=pl returns prices in zł (PLN) and lang=en returns prices in € (EUR); max is in that currency. Each listing has a url on subletka.com where the person contacts the lister. ${RATE_LIMIT_NOTE}`,
    contact: { name: "Subletka", email: SUPPORT_EMAIL, url: site },
  },
  servers: [{ url: site }],
  security: [],
  externalDocs: { description: "Guide for AI agents", url: `${site}/llms.txt` },
  paths: Object.fromEntries(
    (Object.keys(OPERATIONS) as OperationName[]).map((name) => [
      OPERATIONS[name].path,
      {
        get: {
          operationId: OPERATION_META[name].operationId,
          summary: OPERATIONS[name].title,
          description: OPERATIONS[name].description,
          parameters: parameters(name),
          responses: {
            "200": json(OPERATION_META[name].response, "OK"),
            "400": json(ApiError, "Invalid query. issues names each bad parameter."),
            ...(name === "get_listing" ? { "404": json(ApiError, "No active listing with this id.") } : {}),
            "429": json(ApiError, "Rate limited. Retry after the Retry-After header."),
          },
        },
      },
    ]),
  ),
  components: { schemas: componentSchemas() },
});
