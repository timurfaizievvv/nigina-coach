const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let pendingRejects = {};

// ✅ ПРОВЕРКА СЕРВЕРА
app.get("/", (req, res) => {
  res.send("Server is working");
});

// 📌 СОЗДАНИЕ ЗАЯВКИ
app.post("/book", async (req, res) => {
  const { date, time, training, format, name, contact, telegram_id } = req.body;

  try {
    // 🔥 ПРОВЕРКА СЛОТА
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?date=eq.${date}&time=eq.${time}&status=in.(pending,confirmed)`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });

    const existing = await checkRes.json();

    if (existing.length > 0) {
      return res.status(400).json({
        ok: false,
        message: "Это время уже занято"
      });
    }

    // ✅ СОЗДАЕМ ЗАЯВКУ
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        date,
        time,
        training,
        format,
        name,
        contact,
        telegram_id,
        status: "pending"
      })
    });

    const [newBooking] = await createRes.json();

    // 📤 В ГРУППУ
    const text = `
📥 Новая заявка

👤 ${name}
📅 ${date}
⏰ ${time}
🏋️ ${training}
📌 ${format}
📞 ${contact}

Статус: ⏳ Ожидание
`;

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Принять", callback_data: `approve|${newBooking.id}` },
              { text: "❌ Отклонить", callback_data: `reject|${newBooking.id}` }
            ]
          ]
        }
      })
    });

    // 📩 КЛИЕНТУ
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_id,
        text: "✅ Вы записались. Ожидайте подтверждения"
      })
    });

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});


// 📌 WEBHOOK
app.post(`/bot${TOKEN}`, async (req, res) => {
  const data = req.body;

  // ❌ КОММЕНТАРИЙ ОТКЛОНЕНИЯ
  if (data.message && pendingRejects[data.message.chat.id]) {

    const comment = data.message.text;
    const info = pendingRejects[data.message.chat.id];
    const bookingId = info.bookingId;
    const userId = info.userId;

    // 🔥 ОБНОВЛЯЕМ СТАТУС
    await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        status: "rejected"
      })
    });

    // 📩 КЛИЕНТУ
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: userId,
        text: `❌ Заявка отклонена\n\nПричина: ${comment}`
      })
    });

    delete pendingRejects[data.message.chat.id];
  }

  // 📌 КНОПКИ
  if (data.callback_query) {

    const callbackId = data.callback_query.id;

    await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackId
      })
    });

    const { data: cbData, message } = data.callback_query;
    const [action, bookingId] = cbData.split("|");

    // ✅ ПРИНЯТЬ
    if (action === "approve") {

      await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          status: "confirmed"
        })
      });

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: "✅ Заявка принята",
          reply_markup: { inline_keyboard: [] }
        })
      });
    }

    // ❌ ОТКЛОНИТЬ
    if (action === "reject") {

      pendingRejects[message.chat.id] = {
        bookingId,
        userId: data.callback_query.from.id
      };

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: "✏️ Напишите причину отказа:"
        })
      });
    }
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
