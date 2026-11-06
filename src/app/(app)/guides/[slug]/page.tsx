import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocPage, DocCard } from "@/components/guides/doc-page";
import { JsonLd } from "@/components/seo/json-ld";
import { ARTICLES, articleBySlug } from "@/lib/guides/articles";
import { SITE_URL } from "@/lib/site-url";

type Params = Promise<{ slug: string }>;

export const dynamicParams = false;
export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const a = articleBySlug((await params).slug);
  if (!a) return {};
  return { title: a.title, description: a.description, alternates: { canonical: `/guides/${a.slug}` } };
}

export default async function GuideArticle({ params }: { params: Params }) {
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  const reviewed = new Date(a.reviewed).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.description,
          dateModified: a.reviewed,
          mainEntityOfPage: `${SITE_URL}/guides/${a.slug}`,
          author: { "@id": `${SITE_URL}/#organization` },
          publisher: { "@id": `${SITE_URL}/#organization` },
        }}
      />
      <DocPage
        eyebrow="Guides"
        title={a.title}
        intro={<>{a.answer}</>}
        aside={
          <DocCard title="More guides" href="/guides" cta="All guides">
            Every prediction type explained, with a worked example for each.
          </DocCard>
        }
        sections={[
          ...a.sections.map((s, i) => ({
            id: `s${i + 1}`,
            title: s.heading,
            body: (
              <>
                {s.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </>
            ),
          })),
          {
            id: "related",
            title: "Related",
            body: (
              <>
                <ul className="list-disc space-y-2 pl-5">
                  {a.related.map((r) => (
                    <li key={r.href}>
                      <Link href={r.href} className="font-semibold text-brand hover:underline">{r.label}</Link>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-dim">Written by the KiqStat team. Last checked against the product on {reviewed}. Predictions are probabilities, not guarantees. 18+.</p>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
