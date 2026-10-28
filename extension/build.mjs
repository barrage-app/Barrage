import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

function copyStatic() {
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("src/entries/options.html", "dist/options.html");
  cpSync("icons", "dist/icons", { recursive: true });
}

const ctx = await esbuild.context({
  entryPoints: {
    background: "src/entries/background.ts",
    content: "src/entries/content.ts",
    options: "src/entries/options.ts",
  },
  // Gabarits des fonctionnalités embarqués comme texte ; les CSS importés
  // donnent content.css et options.css.
  loader: { ".html": "text" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [
    {
      name: "copy-static",
      setup(build) {
        build.onEnd(() => copyStatic());
      },
    },
  ],
});

if (watch) {
  await ctx.watch();
  console.log("Barrage : surveillance des fichiers, Ctrl+C pour arrêter.");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
