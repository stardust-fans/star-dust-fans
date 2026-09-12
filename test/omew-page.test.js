import { describe, expect, it } from "vitest";
import constantsSource from "../src/shared/constants.js?raw";
import navSource from "../src/public/components/NavBar.vue?raw";
import routerSource from "../src/public/router/index.js?raw";
import viewSource from "../src/public/views/OmewView.vue?raw";
import wranglerSource from "../wrangler.jsonc?raw";
import workerSource from "../worker.js?raw";

describe("OMEW public page contract", () => {
  it("registers a full-bleed /omew route and a navigation entry", () => {
    expect(routerSource).toContain('path: "/omew"');
    expect(routerSource).toContain('name: "omew"');
    expect(routerSource).toContain('component: OmewView');
    expect(routerSource).toContain("meta: { fullBleed: true }");
    expect(navSource).toContain('to="/omew"');
  });

  it("embeds the site OMEW instance with a usable fallback and session handoff", () => {
    expect(constantsSource).toContain('OMEW_URL = "https://omew.stardustinfinity.top"');
    expect(viewSource).toContain(":src=" + "\"OMEW_URL\"");
    expect(navSource).toContain('>论坛</RouterLink>');
    expect(constantsSource).toContain('omew: "论坛 · 星尘粉丝站"');
    expect(viewSource).toContain('title="星尘论坛"');
    expect(viewSource).not.toContain('target="_blank"');
    expect(viewSource).toContain("clipboard-read");
    expect(viewSource).toContain("clipboard-write");
    expect(viewSource).toContain("publickey-credentials-get");
    expect(viewSource).toContain("@load=\"handleLoad\"");
    expect(viewSource).toContain('fetch("/api/omew/session"');
    expect(viewSource).toContain('type: STAR_DUST_SESSION_EVENT');
    expect(viewSource).toContain('window.addEventListener("message"');
  });

  it("keeps direct history URLs on the public SPA entry", () => {
    expect(wranglerSource).toContain('"binding": "ASSETS"');
    expect(wranglerSource).toContain('"not_found_handling": "single-page-application"');
    expect(workerSource).toContain("env.ASSETS.fetch(request)");
  });
});
