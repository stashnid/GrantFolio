import { initializeApp } from "firebase-admin/app";
import pg from "pg";
import express from "express";
import { createApp } from "./app.js";
import { configuration } from "./config.js";
const config = configuration();
initializeApp({ projectId: config.projectId });
const db = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const app = createApp(db);
app.use(express.static("frontend/dist"));
app.get("/{*path}", (_req, res) =>
  res.sendFile("index.html", { root: "frontend/dist" }),
);
app.listen(
  Number(process.env.PORT ?? 8080),
  process.env.HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  () => console.log("GrantFolio listening"),
);
