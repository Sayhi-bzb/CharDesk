# Changelog

## [0.6.2](https://github.com/Sayhi-bzb/CharDesk/compare/v0.6.1...v0.6.2) (2026-10-06)


### Bug Fixes

* keep packed CLI smoke test compatible ([6c376f6](https://github.com/Sayhi-bzb/CharDesk/commit/6c376f61362019df87120c30243a408366868299))

## [0.6.1](https://github.com/Sayhi-bzb/CharDesk/compare/v0.6.0...v0.6.1) (2026-10-05)


### Bug Fixes

* keep MCP version checks release-safe ([852fdb0](https://github.com/Sayhi-bzb/CharDesk/commit/852fdb0777189cc887be066851b0df97bd1b5bac))
* serialize MCP bridge tests ([e27218b](https://github.com/Sayhi-bzb/CharDesk/commit/e27218bde2c5d631d0c3e8f69e33a0193e66297a))

## [0.6.0](https://github.com/Sayhi-bzb/CharDesk/compare/v0.5.4...v0.6.0) (2026-10-05)


### ⚠ BREAKING CHANGES

* tool names no longer use the `chardesk_` prefix, and the `/discover`, `/revoke`, and `/agent` bridge protocol changed.
* address canvases by runtime ref and share the MCP bridge
* Blackboard packages, file tools, and Blackboard cloud backups are no longer supported. Existing works are migrated on first open.

### Features

* add bounded Canvas code composition tool ([79c5d17](https://github.com/Sayhi-bzb/CharDesk/commit/79c5d1759acc941ab2fb512d98703b152cc56bfc))
* add cloud workspace and account sync ([ebfb2b6](https://github.com/Sayhi-bzb/CharDesk/commit/ebfb2b6e85f9e12bb5b7c1413b6af50912aa8357))
* add exact cell clipping for text regions ([0a67287](https://github.com/Sayhi-bzb/CharDesk/commit/0a6728768cf096ac05a77c93168da62dec2bb13d))
* add mobile canvas controls and canvas reading tool ([8e19325](https://github.com/Sayhi-bzb/CharDesk/commit/8e19325d29e16ca871813fcab8d078f2e50eb15a))
* add mobile template placement and Canvas write tool ([74de26a](https://github.com/Sayhi-bzb/CharDesk/commit/74de26a88dd906caa72a9aac176623aae94f55ea))
* address canvases by runtime ref and share the MCP bridge ([fe81bb5](https://github.com/Sayhi-bzb/CharDesk/commit/fe81bb5bb805e008f6c4993827c60a57f705e400))
* auto-discover local MCP bridge from Canvas ([9d30009](https://github.com/Sayhi-bzb/CharDesk/commit/9d300093c955d069b81e76f04dc0f70f7f980e58))
* **canvas:** add Google sign-in and explicit account linking ([b35e577](https://github.com/Sayhi-bzb/CharDesk/commit/b35e57746cfc0a687d8618399bf69f9a6c79b035))
* **canvas:** move account settings into workspace footer dialog ([1fef4cc](https://github.com/Sayhi-bzb/CharDesk/commit/1fef4cc97966b0ec1b891277735510a092dc1df0))
* connect local agents to Canvas read/write ([f69521a](https://github.com/Sayhi-bzb/CharDesk/commit/f69521a9be5d7bb03c99298b34bbf881bdbcec7e))
* document local MCP setup as agent entry ([12d276f](https://github.com/Sayhi-bzb/CharDesk/commit/12d276fde70658c5bcc007df7ef9467a546ab39f))
* expose search match previews as Cell windows ([e13d382](https://github.com/Sayhi-bzb/CharDesk/commit/e13d3828a7438c720561a64707e77367fb8b85d1))
* remove MCP tenant sessions and rename canvas tools ([0527737](https://github.com/Sayhi-bzb/CharDesk/commit/05277372abea2e2f32018b579483eeb5cf6c75b0))
* rename Canvas tools and add search dialog ([5735546](https://github.com/Sayhi-bzb/CharDesk/commit/573554622284ea0db6ab3bfb32480230354629f7))
* replace canvas list with manage tool and add image reads ([42971c9](https://github.com/Sayhi-bzb/CharDesk/commit/42971c9b14e2c41c6771d88043ad3b888db9bf58))
* reshape Canvas write tools and runtime status ([76dc01a](https://github.com/Sayhi-bzb/CharDesk/commit/76dc01a286fe0a4e2803900e93ff62e0ac010a83))
* retire Blackboard authoring for native Canvas and Slides ([d605bd4](https://github.com/Sayhi-bzb/CharDesk/commit/d605bd436cefbef89adab8e1b0aecb53aaca67aa))
* support horizontal bar charts in CharGraph and concurrent reads in ([7b20c97](https://github.com/Sayhi-bzb/CharDesk/commit/7b20c9782d342828b72767271bc469fb4addf391))
* support multi-Canvas agent access, regex search, and local MCP ([523a5f2](https://github.com/Sayhi-bzb/CharDesk/commit/523a5f235d6f23d6075b26b436865d432f220b16))


### Bug Fixes

* align local agent test mock signature ([ff45b10](https://github.com/Sayhi-bzb/CharDesk/commit/ff45b1047631cd7c769c954cc1eddb1b711575f0))
* align workspace checks with shared UI contracts ([528d5b1](https://github.com/Sayhi-bzb/CharDesk/commit/528d5b1cbd25d96c55da400601bf1691dfb9b779))
* bound CI verification time ([cde0090](https://github.com/Sayhi-bzb/CharDesk/commit/cde00902713bd1ba9e69db82d379703376138fa1))
* prevent hangs on MCP shutdown and unreliable test builds ([aeb6844](https://github.com/Sayhi-bzb/CharDesk/commit/aeb68445084e82e9c373e5571340718f97aa10da))
* satisfy canvas quality architecture guards ([da9efc1](https://github.com/Sayhi-bzb/CharDesk/commit/da9efc1aa62ab5082ace7ee7ea9f58c8e6c74a08))
* unblock canvas verification ([446cedf](https://github.com/Sayhi-bzb/CharDesk/commit/446cedf3669600d01daf3e6207549de877615582))
* unify selectable row hover surfaces ([980dff1](https://github.com/Sayhi-bzb/CharDesk/commit/980dff1761da7b81822aed375f1a4764621f0271))

## [0.5.4](https://github.com/Sayhi-bzb/CharDesk/compare/v0.5.3...v0.5.4) (2026-09-29)


### Features

* add coordinate anchors to Canvas Contents ([481e251](https://github.com/Sayhi-bzb/CharDesk/commit/481e2513b2c4809102d5841144b91d5dac527fdc))

## [0.5.3](https://github.com/Sayhi-bzb/CharDesk/compare/v0.5.2...v0.5.3) (2026-09-27)


### Features

* add inline SVG icon layer and markdown inline flow ([28595fc](https://github.com/Sayhi-bzb/CharDesk/commit/28595fc35c316da354da798cc80bb6844d6c8978))


### Bug Fixes

* keep canvas text underline below CJK glyph ink ([24eb1de](https://github.com/Sayhi-bzb/CharDesk/commit/24eb1de9777e8a163b2758c1394e9b9e55a0aa97))
* keep underline raster test compatible with dependency scan ([e3fc0de](https://github.com/Sayhi-bzb/CharDesk/commit/e3fc0de90948e981b38011078a5e798750e62569))
* preserve Markdown rails and offscreen link geometry ([d9425ca](https://github.com/Sayhi-bzb/CharDesk/commit/d9425ca0dc7633d1312a46df06987ed3299a299b))

## [0.5.2](https://github.com/Sayhi-bzb/CharDesk/compare/v0.5.1...v0.5.2) (2026-09-27)


### Features

* split gallery header brand into product and Cell UI links ([bcd0ac8](https://github.com/Sayhi-bzb/CharDesk/commit/bcd0ac864bf27d25a0fc4aab7ba1bc5e75bfd4af))


### Bug Fixes

* keep table outlines intact over ghost surfaces ([9bea6f0](https://github.com/Sayhi-bzb/CharDesk/commit/9bea6f030e2614ebcf0d0e7a4bac72b1fdbe59f0))
* monitor Cell UI Stars on Pages host ([ec25b16](https://github.com/Sayhi-bzb/CharDesk/commit/ec25b16bd76317980d1471cf77cde22055fc7174))
* verify live Cell UI GitHub star endpoint ([3371d57](https://github.com/Sayhi-bzb/CharDesk/commit/3371d57c7b0e4dbca0df2a8042f128695b7db10e))

## [0.5.1](https://github.com/Sayhi-bzb/CharDesk/compare/v0.5.0...v0.5.1) (2026-09-27)


### Bug Fixes

* keep Cell UI Registry aligned with release dependencies ([5b79aca](https://github.com/Sayhi-bzb/CharDesk/commit/5b79aca9c9f3ce2a49df11e6d0e6fe96b913d5ec))
* synchronize 0.5.0 workspace release dependencies ([3fce22f](https://github.com/Sayhi-bzb/CharDesk/commit/3fce22f37224b129b136f68a0ceb7fb5ab0b1293))

## [0.5.0](https://github.com/Sayhi-bzb/CharDesk/compare/v0.4.4...v0.5.0) (2026-09-26)


### ⚠ BREAKING CHANGES

* retire CellSheet and rework overlay geometry
* `CellSheet` and `isAccordionHidden` are removed; `SelectTrigger` gains `placeholder`.
* overhaul Gallery navigation, headers, and ScrollArea

### `feat

* overhaul Gallery navigation, headers, and ScrollArea ([aa0f4f9](https://github.com/Sayhi-bzb/CharDesk/commit/aa0f4f967db86569055183a41ac5205126ca2415))


### Features

* add Field validation and danger button tone ([02e048e](https://github.com/Sayhi-bzb/CharDesk/commit/02e048e7c56dc59ff88f53138689715eaf7f4feb))
* add Markdown reading colors to Cell UI themes ([6c63e37](https://github.com/Sayhi-bzb/CharDesk/commit/6c63e37fa7b55d81a92b9bd5a688d7e6104b8b12))
* add product home, overlay host, and linear selection ([377da7f](https://github.com/Sayhi-bzb/CharDesk/commit/377da7f94bcdf5d0c35540b86313f7e58ac13bb1))
* add text presentation mode and Markdown rendering ([df05cc4](https://github.com/Sayhi-bzb/CharDesk/commit/df05cc4e46bbd345321d4523ef975acdec839a36))
* extend scrollbar rails to frame edges ([b594575](https://github.com/Sayhi-bzb/CharDesk/commit/b594575a41ef7a7d6e93a4bfb97938f826342dcf))
* highlight Markdown code in Cell UI ([3c9cc7f](https://github.com/Sayhi-bzb/CharDesk/commit/3c9cc7f420b1cb029bf6c9f7b6e33de2f19360ed))
* improve Markdown inline code and table copy ([a1646f4](https://github.com/Sayhi-bzb/CharDesk/commit/a1646f45c4c8dce95e7b0f1ae1bbcfc12b356b67))
* integrate Cell UI menu and harden verification ([4253d14](https://github.com/Sayhi-bzb/CharDesk/commit/4253d140439fbf9b7e7062f668d5f7e8dd899fe1))
* keep Markdown source visible in Cells ([9874d70](https://github.com/Sayhi-bzb/CharDesk/commit/9874d70d04eb0565a9d54040339cbafff25d484a))
* remove Sheet and unify overlay visibility ([62f6c91](https://github.com/Sayhi-bzb/CharDesk/commit/62f6c91c7662615612c33036f8c2bb122f7fe7ec))
* render Gallery docs as Cell articles ([bdcdf41](https://github.com/Sayhi-bzb/CharDesk/commit/bdcdf417e8b09cbfe17be3c31ddf5458ccb3c61b))
* retire CellSheet and rework overlay geometry ([1a31a21](https://github.com/Sayhi-bzb/CharDesk/commit/1a31a21c924c4b9b8a41d4cd4db822079271cc47))
* share semantic tones between Markdown and status surfaces ([7f495cf](https://github.com/Sayhi-bzb/CharDesk/commit/7f495cfbce7d9a466e259b5d1d4df1eb974cfc20))
* unify docs cell scenes ([37050a9](https://github.com/Sayhi-bzb/CharDesk/commit/37050a92a5f96ae7347d247ff7412dc7f799baa0))


### Bug Fixes

* align Cell UI E2E with browser behavior ([106ca35](https://github.com/Sayhi-bzb/CharDesk/commit/106ca35e8bad85c73d574f0aeb2db90e1c0f64bd))
* align scrollbar verification with resolved role colors ([89ca726](https://github.com/Sayhi-bzb/CharDesk/commit/89ca726f426d1e9a9a3572bee35509eb4b14dbd3))
* keep Cell UI editor and semantic projections consistent ([a4906a2](https://github.com/Sayhi-bzb/CharDesk/commit/a4906a23a206d821a392065367eea6fb91174d47))
* keep TextArea borders stable on focus ([2c6013f](https://github.com/Sayhi-bzb/CharDesk/commit/2c6013fe0fcd997fd90567b8c46feeda45e3c4d1))
* make Nerd font e2e wait for shard responses ([ad0e04c](https://github.com/Sayhi-bzb/CharDesk/commit/ad0e04cbad03975e693e348d316d17df5a5b49be))
* restore Canvas Host App Menu while migration is isolated ([eee5521](https://github.com/Sayhi-bzb/CharDesk/commit/eee5521e7ee37df72a40847445abeeca0bbdac87))
* route editor pointer drags through Cell selection ([793ac93](https://github.com/Sayhi-bzb/CharDesk/commit/793ac93740e984232541f6f5f3cb6fa3200bbb00))
* wait for disabled Button icon projection in E2E ([09cfaf8](https://github.com/Sayhi-bzb/CharDesk/commit/09cfaf8090edcd344e27c738365c28be745867a3))


### Performance Improvements

* **cell-ui:** cache prepared Markdown descriptors across scroll commits ([5c02260](https://github.com/Sayhi-bzb/CharDesk/commit/5c02260c46e657fbf8d456b6819ddad6f28684dc))

## [0.4.4](https://github.com/Sayhi-bzb/CharDesk/compare/v0.4.3...v0.4.4) (2026-09-24)


### Features

* add Alert component to cell-ui ([d60a92c](https://github.com/Sayhi-bzb/CharDesk/commit/d60a92cfe312f653dfb7f58587d0e3917c85bba8))
* share GitHub star snapshots across sites ([1175e94](https://github.com/Sayhi-bzb/CharDesk/commit/1175e94c1f4337297804904cc61e03f78b995606))


### Bug Fixes

* complete Alert source and gallery documentation ([35fd253](https://github.com/Sayhi-bzb/CharDesk/commit/35fd25344217d8ab83ec62252383de9022a85d34))

## [0.4.3](https://github.com/Sayhi-bzb/CharDesk/compare/v0.4.2...v0.4.3) (2026-09-23)


### Features

* add Tooltip, Spinner, and Tabs Cell primitives ([e5f48c0](https://github.com/Sayhi-bzb/CharDesk/commit/e5f48c0c528f937a9a174996cc6e0b4bbce586a4))
* **cell-ui:** add underline Tabs variant with solid fallback ([3e731c5](https://github.com/Sayhi-bzb/CharDesk/commit/3e731c5be8ad69898dd36764ecd21a71d85b8676))
* publish Cell UI Gallery ([ccadf3d](https://github.com/Sayhi-bzb/CharDesk/commit/ccadf3dd92912cf510311cb402a947baa4e8da64))


### Bug Fixes

* align public Cell UI verification and tooltip state ([150f3f2](https://github.com/Sayhi-bzb/CharDesk/commit/150f3f2053bc5396bbcd1d65df6a729af0c9e2f0))

## [0.4.2](https://github.com/Sayhi-bzb/CharDesk/compare/v0.4.1...v0.4.2) (2026-09-23)


### Features

* host Cell UI registry for shadcn directory ([#11](https://github.com/Sayhi-bzb/CharDesk/issues/11)) ([3b0dd00](https://github.com/Sayhi-bzb/CharDesk/commit/3b0dd008bc73a5838b178cabcf14f9ddc59c4133))

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
