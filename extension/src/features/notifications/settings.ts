// Section « Notifications » des options : activer ou couper les notifications sur x.com.
import { fromTemplate, part, type View } from "../../ui/dom.ts";
import "./settings.css";
import template from "./settings.html";
import { setNotify } from "./store.ts";

export function mountNotifications(container: HTMLElement): View {
  container.append(fromTemplate(template));
  const input = part<HTMLInputElement>(container, "notify");
  input.addEventListener("change", () => void setNotify(input.checked));
  return {
    render(state) {
      input.checked = state.notify;
    },
  };
}
