# Autofix: from audit to source

The audit panel suggests labels and applies them live through the override store.
`waypoint-fix` makes them permanent: it finds each control by its `testID` in the
source and adds the label next to it.

```sh
# 1. In the app: audit → Accept (or Accept all) → Export fixes
hdc hilog | grep WAYPOINT_FIXES | tail -1 | sed 's/.*WAYPOINT_FIXES //' > fixes.json
# 2. Preview, then write
npx --prefix packages/waypoint-fix tsx packages/waypoint-fix/src/cli.ts --fixes fixes.json src/
npx --prefix packages/waypoint-fix tsx packages/waypoint-fix/src/cli.ts --fixes fixes.json --write src/
```

| Source pattern | Edit |
| --- | --- |
| `<Pressable testID="tab-settings" …>` | adds `accessibilityLabel="Settings"` |
| `<View testID={'x'} …>` | same; labels with quotes or braces become `{"…"}` |
| `{ testID: 'tab-settings', … }` | adds `label: 'Settings'` (`--object-prop` changes the name) |

- Elements that already have `accessibilityLabel`, `aria-label` or the object
  property are left alone; a second run changes nothing.
- Only string-literal `testID`s match. Computed ones are listed as "not found".
- Inputs: a `{testID: label}` map, the app's export, the evaluation's `audit.json`,
  or a list of findings with `testID` and `suggestion.label`.
- Without `--write` the tool prints a diff and changes nothing.

Example on the demo app, using the evaluation's suggestions (no model, so the
fallback labels "Gear" and "Person" are what a developer would review and
improve before writing):

```diff
-  { testID: 'tab-settings', screen: 'settings', icon: 'ic_gear', handLabel: 'Settings' },
+  { testID: 'tab-settings', label: 'Gear', screen: 'settings', icon: 'ic_gear', handLabel: 'Settings' },
```
