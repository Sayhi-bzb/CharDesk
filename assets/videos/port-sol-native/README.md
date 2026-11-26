# Port Sol · native TUI recording

[Final video](port-sol-native.mp4) · [Editable Canvas](port-sol.chardesk) · [Recording verification](verification.json)

The [recording script](source/record.ts) writes the [ANSI scene states](materials/frames/) into a local CharDesk session and captures the TUI's native write effects. The [scene generator](materials/source/build.mjs) owns the island geometry, build order, and camera path.

Run `./rebuild.sh` on macOS from this checkout with workspace dependencies installed, Bun, Node.js, and the Swift command-line tools. It regenerates the recording, soundtrack, and MP4 in this directory. The recorder uses the checkout's CharDesk runtime. The video encoder requires access to macOS video encoding.

To regenerate the ANSI states from the geometry, run `node materials/source/build.mjs --material-only`. Frame images, the silent encode, build output, and the local recording database are generated files.
