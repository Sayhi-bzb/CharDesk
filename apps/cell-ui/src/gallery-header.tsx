import { DocumentationHeader } from "@chardesk/docs-ui/header";
import { repositoryUrl, useGitHubStars } from "./github-stars";
export function GalleryHeader({ brandHref = "#/guides/introduction" }: Readonly<{ brandHref?: string | null }>) {
  const stars = useGitHubStars();
  return <DocumentationHeader brandHref={brandHref} repository={{ ...stars, url: repositoryUrl }} />;
}
