import { serializeJsonLd, type JsonLdGraph } from "@/lib/json-ld";

export function JsonLd({ graph }: { graph: JsonLdGraph }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }} />;
}
