import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const basePath = "/incident-triage-app";
const port = Number(process.env.PORT ?? 4174);
const app = express();

app.use(basePath, express.static(distDir));
app.get(`${basePath}/*`, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
app.listen(port, "0.0.0.0", () => console.log(`GitHub Pages-compatible preview: http://localhost:${port}${basePath}/`));
