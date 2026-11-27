# Ring Canyon

[Video](ring-canyon.mp4) · [Editable Canvas](ring-canyon.chardesk) · [Timing verification](verification.json)

[The artwork generator](source/art.mjs) produces the 224 × 64 half-block canvas. [The simulation](source/diffuse.mjs) assigns writes to 104 simulated Agents. [The renderer](source/render.mjs) keeps the camera moving until the final write, and [the sound generator](source/sound.mjs) uses writes visible in each frame.

Run `./rebuild.sh [output-directory]` on macOS with the workspace dependencies installed, Node.js, the `chardesk` CLI, and the Swift command-line tools. It regenerates the full-resolution `ring-canyon-smooth.mov`, the editable Canvas, and the timing report. The script uses a temporary directory inside the checkout for frame images and other intermediates.
