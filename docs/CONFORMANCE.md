# React Native accessibility props on HarmonyOS (spike S4)

Each row: does the HarmonyOS screen reader announce the prop when it is set on an
RNOH 0.77 component? This is the basis of stretch rule R7 (RFC §7). Fill it on the
target during S4; leave a cell empty until it is tested.

Target: ________ (emulator image / device, OS build) · RNOH ________ · Date ________

| Prop | Component | Expected announcement | Announced? | Notes |
| --- | --- | --- | --- | --- |
| `accessibilityLabel` | Pressable | the label | | |
| `accessibilityLabel` | Image (`accessible`) | the label | | |
| `accessibilityHint` | Pressable | the hint after the label | | Community report: needs manual handling |
| `accessibilityRole="button"` | Pressable | "button" | | |
| `accessibilityRole="tab"` | Pressable | "tab" | | |
| `accessibilityRole="switch"` | Pressable | "switch" | | |
| `accessibilityRole="header"` | Text | "heading" | | |
| `accessibilityRole="radio"` | Pressable | "radio button" | | |
| `accessibilityRole="link"` | Text | "link" | | |
| `accessibilityRole="image"` | Image | "image" | | |
| `accessibilityState.selected` | tab | "selected" | | |
| `accessibilityState.checked` | switch | "on" / "off" | | |
| `accessibilityState.disabled` | button | "disabled" / "dimmed" | | |
| `accessible` grouping | View with two Text children | children read as one element | | |
| `accessibilityElementsHidden` | View | subtree skipped | | |
| `importantForAccessibility="no-hide-descendants"` | View | subtree skipped | | |
| `accessibilityLiveRegion="polite"` | guide caption | caption read on change | | |
| `TextInput` without label, with placeholder | TextInput | the placeholder | | |

Roles reported as mapped on RNOH (community write-up, low reliability): 12. List
the ones found unmapped here; R7 v1 flags them.
