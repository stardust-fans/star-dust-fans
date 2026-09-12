import { describe, expect, it } from "vitest";
import constantsSource from "../src/shared/constants.js?raw";
import navSource from "../src/public/components/NavBar.vue?raw";
import routerSource from "../src/public/router/index.js?raw";
import viewSource from "../src/public/views/OmewView.vue?raw";
import loginSource from "../src/public/views/LoginView.vue?raw";
import wranglerSource from "../wrangler.jsonc?raw";
import workerSource from "../worker.js?raw";

describe("OMEW public page contract", () => {
  it("registers a full-bleed /omew route and a navigation entry", () => {
    expect(routerSource).toContain('path: "/omew"');
    expect(routerSource).toContain('name: "omew"');
    expect(routerSource).toContain('component: OmewView');
    expect(routerSource).toContain("meta: { fullBleed: true, requiresAuth: true }");
    expect(routerSource).toContain("query: { return_to: to.fullPath }");
    expect(navSource).toContain('to="/omew"');
  });

  it("keeps the identity bridge on the site as standard OIDC instead of a child-window token exchange", () => {
    expect(viewSource).not.toContain("star-dust-session");
    expect(viewSource).not.toContain("postMessage");
    expect(workerSource).not.toContain("/api/omew/session");
    expect(workerSource).toContain("handleOidcRequest");
    expect(loginSource).toContain("requested.startsWith('/')");
    expect(loginSource).toContain("!requested.startsWith('//')");
    expect(loginSource).toContain("window.location.assign(returnTo)");
  });

  it("embeds the site OMEW instance with a usable fallback", () => {
    expect(constantsSource).toContain('OMEW_URL = "https://omew.stardustinfinity.top"');
    expect(constantsSource).toContain("/api/auth/oidc/start?return_to=%2F");
    expect(viewSource).toContain(":src=" + "\"OMEW_SSO_URL\"");
    expect(viewSource).toContain(":href=" + "\"OMEW_SSO_URL\"");
    expect(viewSource).toContain('target="_blank"');
    expect(viewSource).toContain("clipboard-read");
    expect(viewSource).toContain("clipboard-write");
    expect(viewSource).toContain("publickey-credentials-get");
    expect(viewSource).toContain("@load=\"handleLoad\"");
    expect(viewSource).toContain("通过星尘站统一身份验证");
  });

  it("keeps direct history URLs on the public SPA entry", () => {
    expect(wranglerSource).toContain('"binding": "ASSETS"');
    expect(wranglerSource).toContain('"not_found_handling": "single-page-application"');
    expect(wranglerSource).toContain('"run_worker_first": ["/api/*", "/.well-known/*", "/oauth/*", "/saml/*", "/scim/*"]');
    expect(workerSource).toContain("env.ASSETS.fetch(request)");
  });

  it("declares the production OIDC issuer without placing client credentials in source", () => {
    expect(wranglerSource).toContain('"OIDC_ISSUER": "https://stardustinfinity.top"');
    expect(wranglerSource).not.toContain("OIDC_CLIENTS");
    expect(wranglerSource).not.toContain("OIDC_SIGNING_JWKS");
  });
});
