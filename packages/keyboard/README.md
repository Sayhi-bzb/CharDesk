# @chardesk/keyboard

Private, DOM-free normalized keyboard facts shared by Cell UI and the CharDesk Host.

`KeyInput` preserves key phase, logical key, physical code, location, modifiers,
repeat, and composition. `createKeyInput()` supplies deterministic defaults.
The `@chardesk/keyboard/browser` entry is the only native event adapter.

Dependency direction:

```text
native KeyboardEvent -> @chardesk/keyboard/browser -> KeyInput
                                                    ├─ Host shortcut/keymap
                                                    ├─ Canvas Intent rules
                                                    └─ Cell UI Widget rules
```

The root entry is DOM-free. The package does not own shortcut routing, Widget
behavior, Canvas behavior, text insertion, composition sessions, or clipboard
events.
