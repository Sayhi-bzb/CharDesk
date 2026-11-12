import { ArticleSurface, type ArticleSurfaceProps } from "./article-surface";
import { DocumentationSurface } from "./appearance";
export function DocumentationArticleSurface(props: Omit<ArticleSurfaceProps, "Surface">) {
  return <ArticleSurface {...props} Surface={DocumentationSurface} />;
}
