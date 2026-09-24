# Installation

Install the complete editable Cell UI source through the shadcn registry.

## Command

In a React project with components.json and an aliases.lib target, add the full cell-ui item. The registry copies source to your configured lib alias and declares npm dependencies.

```tsx
npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui
```

## Manual

The published item JSON is the authoritative file and dependency list. Install its dependencies; copy each files[].content to files[].target, resolving @lib through components.json aliases.lib. Keep relative paths, including the keyboard adapter. Do not install the private workspace package.

[Published item JSON](https://sayhi-bzb.github.io/CharDesk/cell-ui.json)

## Update

The installed files are yours to edit. Before a later shadcn add overwrites them, review its diff against your local changes. The repository verifies fresh installation with npm run cell-ui:registry:smoke.
