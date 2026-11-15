## Rubik's Cube — 3D Interactive Solver
Create a complete, single-file HTML application (using HTML5, Tailwind CSS via CDN, and Three.js, cubejs via CDN) that renders a 3D, interactive 3x3x3 Rubik's Cube simulation in the browser. It must run 100% client-side with no external backend required.

1. Visuals & Rendering (Three.js):
- Render 27 individual "cubies" in a 3x3x3 grid with rounded or clean edges and black internal spacing.
- Apply standard Rubik's Cube face colors: White (U), Yellow (D), Blue (F), Green (B), Orange (L), and Red (R).
- Include orbit/camera controls (rotate view with mouse drag, zoom with scroll).
- Implement smooth 3D slice-rotation animations when a face or layer turns.
- Making sure the internal represenation matches the standard notation

2. User Interactions & Controls:
- Allow users to click and drag or use on-screen UI buttons to rotate individual layers (U, D, L, R, F, B and their prime variants).
- Add a "Scramble" button that applies a random sequence of valid moves with a quick visual animation.
- Add a "Reset" button to return the cube to its solved state.

3. The Solver Logic:
- Add a "Solve" button that finds the solution sequence using cubejs and animates the cube moving step-by-step back to the solved state.
- Display the sequence of move notations (e.g., R, U, R', U') in a clean text log on the screen, highlighting the current move being executed.
- add as slider to allow use set the animation speed.

4. The Scrambled the File Loader
- create three text files under docs/scrambled folder that represents the scramble squence from a solved cube, using standard notation
- Add a "Load" button to load one of the scrambled file, animate the scramble sequence from the solved state.
- Display the sequence of move notations (e.g., R, U, R', U') in a clean text log on the screen, highlighting the current move being executed.


5. Keyboard Shortcuts
**Keyboard shortcuts**

| Key | Action |
| --- | ------ |
| `Space` | Solve |
| `S`     | Scramble |
| `R`     | Reset |
| `→`     | Step forward |
| `←`     | Step backward |


`U`, `D`, `L`, `R`, `F`, `B` and Shift + [`U`, `D`, `L`, `R`, `F`, `B`] for the layer rotations


5. UI & Polish:
- Provide a clean, modern dark-mode UI overlay with clear buttons for Scramble, Solve, Step Forward, Step Backward, and Reset.
- Include a move counter and a status indicator (e.g., "Solved", "Scrambled", "Solving...").
- Ensure the code is self-contained in a single index.html file with embedded CSS and JS, well-commented, and free of placeholder/missing functions.


6. README and Screenshots
- Create a README.md file in the project root directory.  Provide a description of the program, and instruction on how to play
- create a docs/screenshots folder, take three screenshots of the program, at the start when the cube is in solved state, after the scramble, and after solve.  Add an index.html to show the three screenshots in sequence with captions
