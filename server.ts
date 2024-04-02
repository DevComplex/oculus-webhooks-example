import { Hono } from "https://deno.land/x/hono@v3.4.1/mod.ts";

const app = new Hono();

const globalBooks = []

// Redirect root URL
app.get("/", (c) => c.redirect("/books"));

// List all books
app.get("/hello", async (c) => {
  return c.json({ message: "hello world" });
});
