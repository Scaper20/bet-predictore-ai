/** Renders a JSON-LD structured-data block. `data` should be a plain,
 * JSON-serializable schema.org object (or an array via "@graph"). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
