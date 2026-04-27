require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("./"));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// ================= НАПОМИНАНИЯ =================
function scheduleReminder(date, time, chat_id) {
  const trainingDate = new Date(`${date} ${time}`);
  const now = new Date();

  const ms24h = trainingDate - now - (24 * 60 * 60 * 1000);
  const ms2h = trainingDate - now - (2 * 60 * 60 * 1000);

  if (ms24h > 0) {
    setTimeout(() => {
      fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: `Доброго времени суток!\nНапоминаю, что завтра Вы записаны ко мне на тренировку в ${time} ✨`
        }),
      });
    }, ms24h);
  }

  if (ms2h > 0) {
    setTimeout(() => {
      fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: `Доброго времени суток!\nНапоминаю, что через 2 часа состоится наша тренировка ✨`
        }),
      });
    }, ms2h);
  }
}

// ================= СОХРАНЕНИЕ В SUPABASE =================
async function save(data) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      Prefer: "return=representation" // 🔥 важно
    },
    body: JSON.stringify([data]) // 🔥 важно (массив)
  });

  const text = await response.text();
  console.log("SUPABASE RESPONSE:", text);

  if (!response.ok) {
    throw new Error("Ошибка записи в Supabase");
  }

  return text;
}

// ================= TELEGRAM =================
async function sendTG(text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.CHAT_ID,
      text,
    }),
  });
}

// ================= BOOK =================
app.post("/book", async (req, res) => {
  const data = req.body;
  data.status = "active";

  console.log("NEW BOOKING:", data); // 🔥 лог входящих данных

  try {
    await save(data);

    // в группу
    await sendTG(`
🗓️ Новая запись
👤 ${data.name}
☎️ ${data.contact}
✨ ${data.training}
📍 ${data.format}
📆 ${data.date} ${data.time}
    `);

    // напоминания
    // scheduleReminder(data.date, data.time, data.chat_id);

    // клиенту
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.chat_id,
        text: "Вы успешно записаны на тренировку ✨\n\nЕсли у Вас есть вопросы, свяжитесь со мной @niginacoach"
      }),
    });

    res.json({ ok: true });

  } catch (e) {
    console.log("ERROR:", e.message);
    res.status(500).json({ error: "Ошибка записи" });
  }
});

// ================= ПОЛУЧЕНИЕ =================
app.get("/slots-all", async (req, res) => {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });

  const data = await r.json();
  res.json(data);
});

// ================= МОИ ЗАПИСИ =================
app.get("/my-bookings/:chat_id", async (req, res) => {
  const chat_id = req.params.chat_id;

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/records?chat_id=eq.${chat_id}&order=date.asc`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );

    const data = await r.json();
    res.json(data);

  } catch (e) {
    console.log("ERROR MY BOOKINGS:", e);
    res.status(500).json({ error: "Ошибка получения записей" });
  }
});

// ================= CRON НАПОМИНАНИЯ =================
setInterval(async () => {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/records`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });

    const bookings = await r.json();
    const now = new Date();

    console.log("CRON RUN:", new Date().toLocaleString());
    console.log("ВСЕГО ЗАПИСЕЙ:", bookings.length);

    for (const b of bookings) {

      // ❗ ПРОПУСКАЕМ ОТМЕНЕННЫЕ
      if (b.status === "cancelled") continue;

      if (!b.date || !b.time || !b.chat_id) continue;

      const trainingDate = new Date(b.date + "T" + b.time);
      const diff = trainingDate - now;

      const minutes = diff / (1000 * 60);

      console.log("ПРОВЕРКА:", b.date, b.time, "минут до:", minutes);

      // 🔔 24 часа (1440 минут)
      if (minutes <= 1440 && minutes > 1380 && !b.reminded_24h) {

        console.log("🔥 ОТПРАВКА 24ч:", b.time);

        await sendReminder(
          b.chat_id,
          `Напоминаю, что завтра тренировка в ${b.time} ✨`
        );

        await markReminder(b.id, "reminded_24h");
      }

      // 🔔 2 часа (120 минут)
      if (minutes <= 120 && minutes > 90 && !b.reminded_2h) {

        console.log("🔥 ОТПРАВКА 2ч:", b.time);

        await sendReminder(
          b.chat_id,
          `Через 2 часа тренировка ✨`
        );

        await markReminder(b.id, "reminded_2h");
      }
    }

  } catch (e) {
    console.log("CRON ERROR", e);
  }
}, 60 * 1000);

// ================= REMINDER HELPERS =================
async function sendReminder(chat_id, text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

async function markReminder(id, field) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    },
    body: JSON.stringify({ [field]: true })
  });
}

// ================= ОТМЕНА ЗАПИСИ =================
app.post("/cancel", async (req, res) => {
  const { id } = req.body;

  try {
    // 🔍 получаем запись
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/records?id=eq.${id}`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );

    const data = await r.json();
    const booking = data[0];

    // ❌ БЛОКИРОВКА ОТМЕНЫ МЕНЕЕ ЧЕМ ЗА 2 ЧАСА
const now = new Date();
const trainingDate = new Date(booking.date + "T" + booking.time);

const diffMs = trainingDate - now;
const diffMinutes = diffMs / (1000 * 60);

if (diffMinutes < 120) {
  return res.status(400).json({
    error: "Слишком поздно отменять"
  });
}

    // 🔥 УДАЛЯЕМ запись (вместо cancelled)
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });

    // ✅ клиенту
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: booking.chat_id,
        text: "Вы успешно отменили тренировку ❌"
      }),
    });

    // ✅ в группу
    await sendTG(`
❌ Заявка отменена
👤 ${booking.name}
☎️ ${booking.contact}
✨ ${booking.training}
📍 ${booking.format}
📆 ${booking.date} ${booking.time}
    `);

    res.json({ ok: true });

  } catch (e) {
    console.log("CANCEL ERROR", e);
    res.status(500).json({ error: "Ошибка отмены" });
  }
});

// ================= ROOT =================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.listen(PORT, () => console.log("Server started"));
