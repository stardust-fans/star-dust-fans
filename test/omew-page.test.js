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

  it("embeds the OMEW self-deployment wizard with a usable fallback", () => {
    expect(constantsSource).toContain('OMEW_DEPLOY_URL = "https://overture.lsy-demo.workers.dev/?src=lsy-404%2FOMEW"');
    expect(viewSource).toContain(":src=" + "\"OMEW_DEPLOY_URL\"");
    expect(viewSource).toContain('target="_blank"');
    expect(viewSource).toContain("clipboard-read");
    expect(viewSource).toContain("clipboard-write");
    expect(viewSource).toContain("@load=\"handleLoad\"");
    expect(viewSource).toContain("自己的 Cloudflare 账户");
  });

  it("keeps direct history URLs on the public SPA entry", () => {
    expect(wranglerSource).toContain('"binding": "ASSETS"');
    expect(wranglerSource).toContain('"not_found_handling": "single-page-application"');
    expect(workerSource).toContain("env.ASSETS.fetch(request)");
  });
});
