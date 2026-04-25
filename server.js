import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// тест
app.get("/", (req, res) => {
  res.send("Server is working");
});

// запись
app.post("/book", async (req, res) => {
  const data = req.body;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();
  res.json(result);
});

// получение слотов
app.get("/slots", async (req, res) => {
  const date = req.query.date;

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?date=eq.${date}`,
    {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const result = await response.json();
  res.json(result);
});

app.listen(3000, () => {
  console.log("Server started");
});
