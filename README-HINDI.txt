World Of Animations — Character Actions panel patch

Problem:
ActionPanelComponent already exists in the repo, but EditorShellComponent does not import/render it.
This patch wires it into the right-side panel so actions like Walk, Run, Sit, Get Up, Jump, Wave,
Point, Idle and Talk can be added to the selected character's timeline (depending on the rig's actions).

Apply:
1. Extract this ZIP.
2. Copy the files into the same relative paths inside your repo, replacing the existing files.
3. In terminal, go to:
   2DAnimation/2DAnimation.UI
4. Run: npm install   (only if dependencies are not installed)
5. Run: npm start
6. Select Raju on the stage. The right panel should show Properties and Actions.
7. Use individual action buttons or "Demo: Walk → Idle → Sit → Talk → Get Up → Walk".

This is a small patch, not a complete repository ZIP. It intentionally does not overwrite other project files.
I have not run the Angular build/runtime in this environment, so verify locally after applying.
