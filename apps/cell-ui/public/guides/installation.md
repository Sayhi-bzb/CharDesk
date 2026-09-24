# Installation

Install the complete editable Cell UI source through the shadcn registry.

## Configure

In your React project's components.json, add or merge these fields:

```json
{
  "aliases": { "lib": "@/lib" },
  "registries": {
    "@chardesk": "https://sayhi-bzb.github.io/CharDesk/{name}.json"
  }
}
```

## Command

Install the full cell-ui item. The registry copies source to your lib alias and declares npm dependencies.

```sh
npx shadcn@latest add @chardesk/cell-ui
```

## Without configuration

To install without a registries entry, use the GitHub address:

```sh
npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui
```

## Manual

The published item JSON is the authoritative file and dependency list. Install its dependencies; copy each files[].content to files[].target, resolving @lib through components.json aliases.lib. Keep relative paths, including the keyboard adapter. Do not install the private workspace package.

[Published item JSON](https://sayhi-bzb.github.io/CharDesk/cell-ui.json)

## Update

The installed files are yours to edit. Before a later shadcn add overwrites them, review its diff against your local changes. The repository verifies fresh installation with npm run cell-ui:registry:smoke.
