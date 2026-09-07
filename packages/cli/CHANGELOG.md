# Changelog

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
