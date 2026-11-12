# Shared documentation portal

The product manual and Cell UI portal consume the same appearance provider,
header, font controls, navigation, mobile Accordion, contents, article Surface
and code blocks. Apps own content, URLs, catalogs, search results and document
commands. The default font and interaction behavior are shared; preferences
use an app-specific storage prefix.

The appearance provider supports server rendering without reading browser
preferences until hydration. Article geometry, Cell selection, semantic DOM,
fonts, theme and input remain owned by Cell UI. Source-backed HTML is generated
by the product manual for no-script, printing, Find and load recovery.
