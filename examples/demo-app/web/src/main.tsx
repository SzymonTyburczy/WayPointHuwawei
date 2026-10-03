// Web entry: CityRide and Waypoint in a phone frame, with the page's controls
// and the inspector around it. `npm run web` serves it; `npm run web:build` writes dist/.
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { Waypoint, type Rect } from 'waypoint-sdk';

import App from '../../src/App';
import type { Condition } from '../../src/app/spec';
import { WINDOW } from '../../src/app/layout';
import { configure, type WebConfig } from './config.web';
import { startInspector } from './inspector';
import { setScreenElement } from './screen';
import { loadCore, speechSettings } from './webModules';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const config: WebConfig = { condition: 'A', llamaUrl: '', speak: false, listenLanguage: 'en-US', voiceInput: 'keyboard' };

function fit() {
  const stage = $('wp-stage');
  const avail = Math.min(stage.clientWidth, WINDOW.w);
  const tall = Math.max(420, window.innerHeight - 120);
  const scale = Math.min(1, avail / WINDOW.w, tall / WINDOW.h);
  const screen = $('wp-screen');
  screen.style.transform = `scale(${scale})`;
  $('wp-phone').style.width = `${WINDOW.w * scale}px`;
  $('wp-phone').style.height = `${WINDOW.h * scale}px`;
}

function highlight(frame: Rect | null) {
  const box = $('wp-hl');
  box.hidden = !frame;
  if (!frame) return;
  Object.assign(box.style, { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.w}px`, height: `${frame.h}px` });
}

async function main() {
  const screen = $('wp-screen');
  setScreenElement(screen);
  window.addEventListener('resize', fit);
  fit();

  try {
    await loadCore();
  } catch (e) {
    $('wp-status').textContent = `The WebAssembly core did not load: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }

  const root = createRoot($('wp-app'));
  let generation = 0;
  const mount = () => {
    configure(config);
    speechSettings.speak = config.speak;
    root.render(
      <View key={++generation} style={{ flex: 1 }}>
        <App />
      </View>,
    );
  };
  mount();
  // For the console: await Waypoint.snapshot(), await Waypoint.audit()
  (window as unknown as { Waypoint: typeof Waypoint }).Waypoint = Waypoint;
  $('wp-status').textContent = '';
  const inspector = startInspector(highlight);
  const remount = () => {
    mount();
    setTimeout(inspector.refresh, 100);
  };

  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="wp-condition"]')) {
    input.addEventListener('change', () => {
      config.condition = input.value as Condition;
      remount();
    });
  }
  const url = $<HTMLInputElement>('wp-llama-url');
  const syncBrain = () => {
    const remote = $<HTMLInputElement>('wp-brain-llama').checked;
    url.disabled = !remote;
    config.llamaUrl = remote ? url.value.trim() : '';
    remount();
  };
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="wp-brain"]')) input.addEventListener('change', syncBrain);
  url.addEventListener('change', syncBrain);
  $<HTMLInputElement>('wp-speak').addEventListener('change', (e) => {
    config.speak = (e.target as HTMLInputElement).checked;
    speechSettings.speak = config.speak;
    if (!config.speak && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    remount();
  });
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="wp-voice"]')) {
    input.addEventListener('change', () => {
      config.voiceInput = input.value as WebConfig['voiceInput'];
      $<HTMLSelectElement>('wp-listen').disabled = config.voiceInput !== 'speech';
      remount();
    });
  }
  $<HTMLSelectElement>('wp-listen').addEventListener('change', (e) => {
    config.listenLanguage = (e.target as HTMLSelectElement).value;
    remount();
  });
  $('wp-reset').addEventListener('click', remount);
}

void main();
