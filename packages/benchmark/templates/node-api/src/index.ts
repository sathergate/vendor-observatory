import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "node-api" });
});

app.get("/api/items", (_req, res) => {
  res.json({ items: [], count: 0 });
});

app.post("/api/items", (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  res.status(201).json({ id: "1", name, createdAt: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
