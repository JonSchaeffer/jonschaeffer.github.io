const express = require("express");
const { createDatabase } = require("@tinacms/datalayer");
const { TinaNodeBackend, LocalBackendAuthProvider } = require("@tinacms/datalayer");
const { GitHubProvider } = require("tinacms-gitprovider-github");
const { MongodbLevel } = require("mongodb-level");
const path = require("path");

const port = process.env.PORT || 3000;

async function start() {
  const app = express();

  const mongodbLevel = new MongodbLevel({
    collectionName: "tinacms",
    dbName: "tinacms",
    mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/tinacms",
  });

  const gitProvider = new GitHubProvider({
    branch: process.env.GITHUB_BRANCH || "main",
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    token: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
  });

  const database = await createDatabase({
    gitProvider,
    databaseAdapter: mongodbLevel,
  });

  const tinaBackend = TinaNodeBackend({
    authProvider: LocalBackendAuthProvider(),
    databaseClient: database,
  });

  // Serve the TinaCMS admin UI
  app.use("/admin", express.static(path.join(__dirname, "../static/admin")));

  // TinaCMS API routes
  app.all("/api/tina/*", (req, res) => {
    tinaBackend(req, res);
  });

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Redirect root to admin
  app.get("/", (req, res) => {
    res.redirect("/admin/index.html");
  });

  app.listen(port, () => {
    console.log(`TinaCMS backend listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start TinaCMS backend:", err);
  process.exit(1);
});
