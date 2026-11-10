import type { Metadata } from "next";
import { product } from "@/config/product";

export interface PageMetaInput {
  title: string;
  description: string;
  /** Path starting with a slash, for example "/docs/billing". */
  path: string;
  noindex?: boolean;
}

export function absoluteUrl(path: string): string {
  return new URL(path, product.url).toString();
}

export const OG_IMAGE_PATH = "/opengraph-image";

/** og:image and twitter:image entries. Page-level openGraph replaces the file-convention image, so pages add these. */
export function socialImages() {
  return { og: [{ url: absoluteUrl(OG_IMAGE_PATH), width: 1200, height: 630 }], twitter: [absoluteUrl(OG_IMAGE_PATH)] };
}

export function pageMetadata({ title, description, path, noindex }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const full = `${title} · ${product.fullName}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: product.fullName, title: full, description, url, images: socialImages().og },
    twitter: { card: "summary_large_image", title: full, description, images: socialImages().twitter },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
