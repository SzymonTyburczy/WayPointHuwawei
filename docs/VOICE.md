# Voice control

Waypoint can be used without looking at the screen: say a goal, hear each step
with the position of the element to tap, and ask what is on the screen. It is
built on the same snapshot, planner and guide as the touch UI. Voice adds two
things a screen-reader user needs: where the highlighted element is, and a
spoken summary of the screen.

> RFC-001 lists voice input and non-English UI as non-goals for the MVP. This
> feature goes beyond the RFC. The guide's model prompts stay in English; spoken
> commands and replies work in English and Polish.

## Commands

A command must be the whole utterance ("stop" stops the guide; "stop the
notifications" is a goal). Politeness words ("please", "proszę", "hey Waypoint")
are ignored.

| Intent | English | Polski | What happens |
| --- | --- | --- | --- |
| goal | anything else; "help me …", "I want to …" are stripped | „pomóż mi …”, „chcę …” | the guide starts; every step is spoken |
| describe | what is here, what can I do, read the screen | co tu jest, co mogę zrobić, przeczytaj ekran | screen title, number of controls, the first five names, how many are unnamed |
| where am I | where am I, which screen | gdzie jestem, jaki to ekran | screen title, plus the goal and the step while guiding |
| repeat | repeat, say again | powtórz, jeszcze raz | the last prompt again |
| next | next, done, continue | dalej, gotowe, zrobione | repeats the current step; with no guide running, restarts the last goal |
| back | back, go back | wróć, cofnij | a reminder to use the back gesture (the guide never acts for you) |
| stop | stop, cancel | stop, przestań, zatrzymaj, anuluj | stops the guide |
| read everything | read everything, read all | przeczytaj wszystko | the screen-reader transcript, up to 15 stops |
| audit | check accessibility, audit | sprawdź dostępność, audyt | the screen's score (0–100) with error and warning counts |
| help | help, what can you do | pomoc, co umiesz | the list above |

The reply language follows the speaker (`lang="auto"`) or is fixed (`'en'`/`'pl'`).

## Spoken steps

```text
User:     "see my past tickets"
Waypoint: Okay: see my past tickets.
Waypoint: Tap "Tickets", at the bottom.
Waypoint: Tap "Ticket history", at the top.
```

The position comes from a 3 × 3 grid over the element's centre. Names come from the
planner's sanitised candidate list and never from raw screen text. After 20 s
without a change the step is repeated with "Still waiting".

The thesis of the RFC is audible in condition A of the demo:

```text
User:     "co tu jest?"
Waypoint: Ekran CityRide. 8 elementów do dotknięcia: Plan a journey, Service alerts i Hide offer.
          5 elementów nie ma nazwy.
```

`npm run voice-demo` in `eval/` replays a full conversation against the simulated
app in conditions A and C and writes `eval/results/voice-demo.md`.

## Architecture

```text
VoiceButton (React) ──► SpeechInput.listen() ──► WaypointPlatform.startListening (ArkTS, Core Speech Kit)
      ▲                        ▲                         │ "WaypointSpeech" device events
      │                        └─────────────────────────┘ partial / final / error / end
      ▼
VoiceController ── parseUtterance → intent ── guide / describe / audit ──► say.* (EN/PL)
      ▲                                                                       │
      └── onGuideState(state): steps, reminders, outcomes ──────────────► WaypointPlatform.speak
```

| File | Role |
| --- | --- |
| `packages/waypoint-sdk/src/voice/intents.ts` | Normalisation (Polish letters folded), commands, goal extraction, language guess |
| `packages/waypoint-sdk/src/voice/messages.ts` | Every spoken sentence in EN and PL, including plural rules and positions |
| `packages/waypoint-sdk/src/voice/VoiceController.ts` | The state machine; all dependencies injected |
| `packages/waypoint-sdk/src/voice/SpeechInput.ts` | Recognition behind an interface; the platform implementation with a timeout |
| `packages/waypoint-sdk/src/react/VoiceButton.tsx` | Push-to-talk button, transcript bubble, typed fallback |
| `harmony/waypoint/src/main/ets/WaypointPlatformTurboModule.ets` | Core Speech Kit recognition and synthesis, the microphone permission, events |

## Platform notes and limits

- **Permission.** `ohos.permission.MICROPHONE` (user_grant) is declared in the demo
  app's `module.json5`. It is requested the first time the microphone is pressed.
- **Languages.** Core Speech Kit's recognition and synthesis languages depend on the
  device, the OS build and the region. Not every build supports `en-US` or `pl-PL`.
  When the recogniser cannot be created, `startListening` resolves `false` and the
  button switches to a text field that accepts the same commands. Speech output
  tries the requested language, then the engine default, then stays silent; the
  caption remains on screen. Record what the target supports during spike S4.
- **Emulator.** Without a microphone, use the typed fallback; everything after
  recognition is identical.
- **Privacy.** Recognition runs through the system speech service. Waypoint sends no
  audio anywhere itself. Transcripts are used only to choose the intent.
- **Not verified on a device yet.** The JS side has 32 tests (intents, positions,
  controller, recognition events and timeouts). The ArkTS module is written against
  the Core Speech Kit API and needs the S1/S4 device run.
