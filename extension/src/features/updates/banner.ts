// Bandeau en haut des options quand une version plus récente de Barrage est
// publiée, avec le lien vers le guide de mise à jour du site.
import { UPDATE_GUIDE_URL } from "../../core/config.ts";
import { fromTemplate, part, type View } from "../../ui/dom.ts";
import template from "./banner.html";
import "./updates.css";
import { updateAvailable } from "./version.ts";

export function mountUpdateBanner(container: HTMLElement): View {
  container.append(fromTemplate(template));
  const banner = part(container, "banner");
  const message = part(container, "message");
  part<HTMLAnchorElement>(container, "link").href = UPDATE_GUIDE_URL;
  const installed = chrome.runtime.getManifest().version;

  return {
    render(state) {
      banner.hidden = !updateAvailable(state.latestVersion);
      if (!banner.hidden) message.textContent = `Version ${state.latestVersion} publiée, vous avez la ${installed}.`;
    },
  };
}
