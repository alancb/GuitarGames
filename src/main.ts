import "./styles.css";
import { createApp } from "./app";
import { BrowserChordInput } from "./audio/microphoneChordInput";

const container = document.querySelector<HTMLElement>("#app");

if (!container) {
  throw new Error("Could not find the root app container.");
}

createApp(container, {
  audio: new BrowserChordInput()
});
