/** Renders a JSON-LD structured-data block. `data` should be a plain,
 * JSON-serializable schema.org object (or an array via "@graph"). Field
 * values on the match page ultimately come from external football data
 * providers (team/league names), not literally "user input", but they're
 * still third-party strings this app doesn't control — escaping `<` stops
 * one containing a literal `</script>` from breaking out of the tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
