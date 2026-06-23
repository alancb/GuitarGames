import { defineConfig } from "vite";

const githubPagesBase = "/GuitarGames/";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? githubPagesBase : "/",
  test: {
    environment: "jsdom",
    globals: true
  }
});
