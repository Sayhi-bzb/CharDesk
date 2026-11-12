import { DocumentationNavigation, DocumentationContents, type NavigationGroupData, type NavigationSection } from "@chardesk/docs-ui/navigation";
import { componentNavigationDocuments } from "./component-catalog";
import { primitiveNavigationDocuments } from "./primitive-catalog";
import { guideContent } from "./docs-content";

type Props = Readonly<{ activeRoute: string; pageTitle: string; pageSections: readonly NavigationSection[]; activeSection: string | null; requestedSection: string | null }>;
export function GalleryNavigation({ activeRoute, pageTitle, pageSections, activeSection, requestedSection }: Props) {
  const selected = activeRoute.split("/").at(-1) ?? "";
  const groups: NavigationGroupData[] = [
    { id: "sections", title: "Sections", items: guideContent.filter(item => item.slug !== "primitives").map(item => ({ id: item.slug, label: item.title, href: `#/guides/${item.slug}` })), current: activeRoute.startsWith("/guides/") ? selected : "" },
    { id: "components", title: "Components", items: componentNavigationDocuments.map(item => ({ id: item.slug, label: item.title, href: `#/components/${item.slug}` })), current: activeRoute.startsWith("/components/") ? selected : "" },
    { id: "primitives", title: "Primitives", items: primitiveNavigationDocuments.map(item => ({ id: item.slug, label: item.title, href: `#/primitives/${item.slug}` })), current: activeRoute.startsWith("/primitives/") ? selected : "" },
  ];
  return <DocumentationNavigation route={activeRoute} pageTitle={pageTitle} sections={pageSections} activeSection={activeSection}
    requestedSection={requestedSection} groups={groups} sectionHref={id => `#${activeRoute}?section=${id}`} label="Cell UI" />;
}
export function OnThisPage({ route, sections, activeSection }: Readonly<{ route: string; sections: readonly NavigationSection[]; activeSection: string | null }>) {
  return <DocumentationContents route={route} sections={sections} activeSection={activeSection} sectionHref={id => `#${route}?section=${id}`} />;
}
