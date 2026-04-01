Build CYLview-NG iteratively and stay tightly aligned with the product vision.

This is not a generic molecular viewer. It is a modern open-source successor to CYLview, with emphasis on:
- the distinctive cylindrical-bond aesthetic
- publication-quality default renders
- single-window usability
- chemistry-first workflows
- clean, readable 3D structure presentation

Rules:
- Work one step at a time.
- Complete the current milestone before advancing.
- Do not overengineer for hypothetical future needs.
- Do not jump to plugins, web, headless, or ecosystem features early.
- Keep the Rust core central and the UI shell thin.
- Treat rendering style as a core product feature, not later polish.
- Favor usable, testable increments over broad scaffolding.

Current instruction:
Focus on Step 3: implement the wgpu renderer and the foundations of the CYLview look.
Renderer quality matters more right now than shell/UI breadth.
Choose the simplest approach that moves the project toward faithful CYLview-style rendering.

For every update:
1. State the goal of the step.
2. Explain how it supports the CYLview-NG vision.
3. Implement only the needed scope.
4. Summarize what was completed.
5. Identify the next step without starting it.