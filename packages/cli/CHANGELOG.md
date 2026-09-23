# Changelog

## [0.4.1](https://github.com/Sayhi-bzb/CharDesk/compare/v0.4.0...v0.4.1) (2026-09-23)


### Bug Fixes

* install browser runtimes for release verification ([728157a](https://github.com/Sayhi-bzb/CharDesk/commit/728157a6b82c40ebc364033c981e3746e815e19f))

## [0.4.0](https://github.com/Sayhi-bzb/CharDesk/compare/v0.3.7...v0.4.0) (2026-09-23)


### ⚠ BREAKING CHANGES

* retire Structured canvas to Freeform CellPlane
* converge cell rendering architecture
* render Box/Block via shared cell-graphics painter

### Features

* add Badge component ([1b27150](https://github.com/Sayhi-bzb/CharDesk/commit/1b271508078555410b1a9a3f1104a82a0b122b39))
* add browser cursor overlay and sync xterm cell glyphs ([542981e](https://github.com/Sayhi-bzb/CharDesk/commit/542981e171699180f8856a0fa7d83b077c32239d))
* add Components gallery section with shared manifest navigation ([bfbfd0f](https://github.com/Sayhi-bzb/CharDesk/commit/bfbfd0fa3e0877be4b9a27223a04c114085b4293))
* add configurable Canvas cell cursor preference ([198edf9](https://github.com/Sayhi-bzb/CharDesk/commit/198edf9387890fdc8e527fdb024c5f2f4ed5a127))
* add configurable canvas font selection with runtime fallback ([ff33621](https://github.com/Sayhi-bzb/CharDesk/commit/ff3362133924c7a655f0ef88eb004642c11d5a4d))
* add grid arrow navigation with gap and disabled cell skipping ([6c819f2](https://github.com/Sayhi-bzb/CharDesk/commit/6c819f2024db1a5eb8feaa420c2579c0db0189c8))
* add grid two-dimensional navigation and state consistency ([c38a9c5](https://github.com/Sayhi-bzb/CharDesk/commit/c38a9c5e270b310ed21d4b6d07c2eb0a7a9884d5))
* add headless Cell UI runtime with browser gallery and E2E coverage ([96d9d83](https://github.com/Sayhi-bzb/CharDesk/commit/96d9d8317585dfd0a1e2d561fff0ad47e63a11f2))
* add on-demand display font switching with lazy loading ([3e878da](https://github.com/Sayhi-bzb/CharDesk/commit/3e878da72081538238879058731520796eb5e51e))
* add SEO metadata and sitemap generation ([dd339a1](https://github.com/Sayhi-bzb/CharDesk/commit/dd339a10f7b8293c96860c5181086935e20b6b3f))
* add user-selectable canvas font setting ([3936534](https://github.com/Sayhi-bzb/CharDesk/commit/3936534e488515a7234cd2917699651a535d4a46))
* **cell-ui:** add classic Macintosh basic widgets and Cell Plane ([561ed1a](https://github.com/Sayhi-bzb/CharDesk/commit/561ed1a32814bf6515b7aaf73b0ca82013b69696))
* **cell-ui:** add half-cell scrollbar geometry and shared border ([c18f5c8](https://github.com/Sayhi-bzb/CharDesk/commit/c18f5c8d3147e8e1606ef199b343c037c5fc1674))
* **cell-ui:** add overlay plane and press feedback ([56d3ede](https://github.com/Sayhi-bzb/CharDesk/commit/56d3edef2c93b20fdad917b1f4bfacb05b4c11d3))
* converge cell rendering architecture ([ed4efd9](https://github.com/Sayhi-bzb/CharDesk/commit/ed4efd9dc01ddff2ecfb82f90ee43da44de506d9))
* expand Cell graphics registry and add terminal cursor ([607e282](https://github.com/Sayhi-bzb/CharDesk/commit/607e2825ee524d51a242498274bde7b1692f0c82))
* extend component playgrounds and appearance controls ([4760281](https://github.com/Sayhi-bzb/CharDesk/commit/4760281a7e4bc1c4704271e6b540d8ba1410fab9))
* improve nested scroll and NF glyph alignment ([a0f0c96](https://github.com/Sayhi-bzb/CharDesk/commit/a0f0c96bff14959b646fc938e233e74592a543da))
* integrate canvas performance improvements ([d9acfad](https://github.com/Sayhi-bzb/CharDesk/commit/d9acfad8d835c18fc6a3477b4a133bfcf26d094b))
* integrate unified cell frame presentation ([0f1d779](https://github.com/Sayhi-bzb/CharDesk/commit/0f1d779446a72b83b77a5d05d693b93f0bd7c888))
* prepare Cell UI Registry distribution ([f0227cc](https://github.com/Sayhi-bzb/CharDesk/commit/f0227ccb999010ef7ec3b7d0e9ebbab820db7b13))
* render all foreground via Cell Unicode glyphs ([f775c17](https://github.com/Sayhi-bzb/CharDesk/commit/f775c17fc88f0947193b392daf05f16c4756d3c5))
* render box and block cell graphics without font dependency ([7288370](https://github.com/Sayhi-bzb/CharDesk/commit/728837038995a9e2e76af4874f517e5c83788008))
* render Box/Block via shared cell-graphics painter ([e444183](https://github.com/Sayhi-bzb/CharDesk/commit/e4441830e4c483b171e0d6cc0ce19681c436b381))
* **rendering:** promote cursor contracts to core root and add Button ([9bd04ef](https://github.com/Sayhi-bzb/CharDesk/commit/9bd04ef021e6f5b0117022bcc912a95d082c5244))
* replace border boolean with Block variant ([cc8f1c5](https://github.com/Sayhi-bzb/CharDesk/commit/cc8f1c59b5a141de6a34c8dfbf5c02d04b53637c))
* retire Structured canvas to Freeform CellPlane ([48d9861](https://github.com/Sayhi-bzb/CharDesk/commit/48d9861e9536da1fbb33aa9aaee008d7d9b277df))
* route cell glyphs to Core face for Surface consumers ([53e0863](https://github.com/Sayhi-bzb/CharDesk/commit/53e0863caa8bfd9d800e256b135063a7e786d421))
* split Maple font into optional package and add geometry primitives ([3bf4335](https://github.com/Sayhi-bzb/CharDesk/commit/3bf4335832d0a85b39707dd925794c49fed67ee2))
* standardize product cell metrics at 9x20 ([f0df68e](https://github.com/Sayhi-bzb/CharDesk/commit/f0df68e9083864206e93c25f7fac4143eeea1726))
* unify canvas theme appearance ([a3e66ff](https://github.com/Sayhi-bzb/CharDesk/commit/a3e66ffa66f653ff643095791da82163908a89b3))
* unify cell frame presentation ([ca65131](https://github.com/Sayhi-bzb/CharDesk/commit/ca65131a712a87a510be60447e9434f42f65f303))
* vendor Ark Pixel and Nerd Font shards for Web TUI Gallery ([77a9c22](https://github.com/Sayhi-bzb/CharDesk/commit/77a9c2253fa0246ceec8819e081516f8cc71ae48))
* vendored Xiaolai Mono as sharded package and decouple content from ([be0f138](https://github.com/Sayhi-bzb/CharDesk/commit/be0f138efcfa4661db6e83037ee194fb80820f0e))


### Bug Fixes

* allow glyph ink overhang in font raster test ([d7ce598](https://github.com/Sayhi-bzb/CharDesk/commit/d7ce598fd931f40670ff22c0e585aff5076607f4))
* assert font geometry across browser platforms ([8258344](https://github.com/Sayhi-bzb/CharDesk/commit/8258344212e506dd7f536654cc5c8a3268f5d733))
* show text input selection with underlines ([1b7c8fa](https://github.com/Sayhi-bzb/CharDesk/commit/1b7c8fa7b5bca6ab2fd308c040d2b3e829b74ec8))
* stop exporting types and hooks used only within their modules ([ceb4fef](https://github.com/Sayhi-bzb/CharDesk/commit/ceb4fef92b54f56f8354d0a34781fa7227057723))
* typecheck Cell UI Registry against workspace sources ([645cdd5](https://github.com/Sayhi-bzb/CharDesk/commit/645cdd55ca6d75e4ebff62391d8af2a48a6a97a5))
* verify asynchronous sync and platform font advances ([166ce11](https://github.com/Sayhi-bzb/CharDesk/commit/166ce11102c2f17880419f2f3b13c31c2d99d11d))

## [0.3.7](https://github.com/Sayhi-bzb/CharDesk/compare/v0.3.6...v0.3.7) (2026-09-05)


### Features

* accelerate long Unicode cell projection ([1afb297](https://github.com/Sayhi-bzb/CharDesk/commit/1afb297f0454aec72894a2bf357a743bd909f865))
* adapt managed canvas input batching ([05714b8](https://github.com/Sayhi-bzb/CharDesk/commit/05714b89bb9bac6dd19d40f151c5c309da45f1c4))
* add CellPlane performance measurement tools ([4038f31](https://github.com/Sayhi-bzb/CharDesk/commit/4038f31f0a3daf3874ed92b3cd827a9a111e76b5))
* add compact collaboration links and Unicode stress coverage ([ee2cc7f](https://github.com/Sayhi-bzb/CharDesk/commit/ee2cc7f0fd0900d16093969fdeb58d97efc373cb))
* add managed encrypted collaboration relay ([47035b9](https://github.com/Sayhi-bzb/CharDesk/commit/47035b9c80289b15ce6693569b7eb2bb8c09ad1b))
* cache CellPlane visit coordinates ([a1e930f](https://github.com/Sayhi-bzb/CharDesk/commit/a1e930f48599729de2241bdde42704c64a8c68a1))
* remove P2P collaboration and make sync server required ([65fbd31](https://github.com/Sayhi-bzb/CharDesk/commit/65fbd315146f740525f2143c85d0df4e473092b1))
* secure collaboration with encrypted managed relay ([87c318b](https://github.com/Sayhi-bzb/CharDesk/commit/87c318b097f7f689d5c74b2d0f63ef3a834475d1))
* support Panel-backed Slide packages and managed WebSocket sync ([e022940](https://github.com/Sayhi-bzb/CharDesk/commit/e022940be8d0deb3c01943aeaf3107b62cfeef15))
* **ui:** add StatusTone surfaces for persistent state ([5f8a53a](https://github.com/Sayhi-bzb/CharDesk/commit/5f8a53a85c223784e8d111425ae89587affc7350))
* **ui:** unify host visual architecture ([64384a1](https://github.com/Sayhi-bzb/CharDesk/commit/64384a1001fc9d01b8f09d21e160ce5d91d7ac88))


### Bug Fixes

* batch managed canvas input ([0b03052](https://github.com/Sayhi-bzb/CharDesk/commit/0b03052d45d0cf489ebab862f6bd37bbdfbc2418))
* rebuild replaced canvas page observers ([06b6f80](https://github.com/Sayhi-bzb/CharDesk/commit/06b6f807dec05f0396cb0f79531041b29491eb7a))
* release canvas memory owners ([65328df](https://github.com/Sayhi-bzb/CharDesk/commit/65328dfa2a5cddd6991b719486248b27fdbc9d23))
* remove origin gateway role from site tools and docs ([d10b1b5](https://github.com/Sayhi-bzb/CharDesk/commit/d10b1b52c1361439a3b313adef3a724736ae65f2))
* **ui:** harden responsive and accessible editor UX ([46e21da](https://github.com/Sayhi-bzb/CharDesk/commit/46e21dab54663e8b9d0b270a5082c8c40ce80aa9))


### Performance Improvements

* cache canvas cell occupancy ([0fb7170](https://github.com/Sayhi-bzb/CharDesk/commit/0fb7170a3d4090657c368c3d7ae0ba9f20df79d8))
* cache grapheme display metrics ([d36f86c](https://github.com/Sayhi-bzb/CharDesk/commit/d36f86c0bfa2af81f589861971928d38e73153d8))

## 0.3.6 (2026-09-03)

- Added managed local Canvas sessions for the CLI.
- Added block-aware inspection and structured CharGraph rendering.
- Improved Mermaid rendering and packed-runtime verification.
