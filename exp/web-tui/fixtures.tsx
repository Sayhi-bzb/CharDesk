import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { GalleryBorderToggle, GalleryFontToggle, GalleryThemeToggle } from "./appearance";

type Fixture = Readonly<{
  id: string;
  load: () => Promise<{ default: ComponentType }>;
}>;

const fixtures: Record<string, Fixture> = {
  core: {
    id: "core",
    load: () => import("./sections/core-controls").then(({ CoreControlsDemo }) => ({ default: CoreControlsDemo })),
  },
  complex: {
    id: "complex",
    load: () => import("./sections/complex-widgets").then(({ ComplexWidgetsDemo }) => ({ default: ComplexWidgetsDemo })),
  },
  editor: {
    id: "editor",
    load: () => import("./sections/text-editing").then(({ TextEditingDemo }) => ({ default: TextEditingDemo })),
  },
  overlay: {
    id: "overlay",
    load: () => import("./sections/overlay").then(({ OverlayDemo }) => ({ default: OverlayDemo })),
  },
  virtualization: {
    id: "virtualization",
    load: () => import("./sections/virtualization").then(({ VirtualizationDemo }) => ({ default: VirtualizationDemo })),
  },
};

const loadedFixtures = new Map<string, ComponentType>();
const fixtureOrder = ["core", "complex", "editor", "overlay", "virtualization"] as const;

const resolveFixture = (slug: string) => {
  const fixture = fixtures[slug];
  if (!fixture) return null;
  let Demo = loadedFixtures.get(slug);
  if (!Demo) {
    Demo = lazy(fixture.load);
    loadedFixtures.set(slug, Demo);
  }
  return { ...fixture, Demo };
};

function FixtureShell({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <>
      <header className="gallery-header">
        <span className="gallery-brand">CharDesk / Cell UI</span>
        <div className="gallery-appearance-controls"><GalleryFontToggle /><GalleryBorderToggle /><GalleryThemeToggle /></div>
      </header>
      <main className="fixture-page">
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}

export function FixturePage({ slug }: Readonly<{ slug: string }>) {
  if (slug === "all") {
    return (
      <FixtureShell title="Cell UI Fixtures">
        {fixtureOrder.map((fixtureSlug) => {
          const fixture = resolveFixture(fixtureSlug)!;
          const { Demo } = fixture;
          return (
            <section id={fixture.id} key={fixture.id}>
              <Suspense fallback={<p>Loading fixture…</p>}><Demo /></Suspense>
            </section>
          );
        })}
      </FixtureShell>
    );
  }
  const fixture = resolveFixture(slug);
  if (!fixture) return <main className="fixture-page"><h1>Fixture not found</h1></main>;
  const { Demo } = fixture;
  return (
    <FixtureShell title="Cell UI Fixture">
      <section id={fixture.id}>
        <Suspense fallback={<p>Loading fixture…</p>}><Demo /></Suspense>
      </section>
    </FixtureShell>
  );
}
