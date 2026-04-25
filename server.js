const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let pendingRejects = {};

// ✅ ПРОВЕРКА
app.get("/", (req, res) => {
  res.send("Server is working");
});

// 📌 СОЗДАНИЕ ЗАЯВКИ
app.post("/book", async (req, res) => {
  const { date, time, training, format, name, contact, telegram_id } = req.body;

  try {
    // проверка слота
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?date=eq.${date}&time=eq.${time}&status=in.(pending,confirmed)`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const existing = await checkRes.json();

    if (existing.length > 0) {
      return res.status(400).json({
        ok: false,
        message: "Это время уже занято"
      });
    }

    // создаем заявку
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=representation"
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

    const [booking] = await createRes.json();

    // сообщение в группу
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
              { text: "✅ Принять", callback_data: `approve|${booking.id}|${telegram_id}` },
              { text: "❌ Отклонить", callback_data: `reject|${booking.id}|${telegram_id}` }
            ]
          ]
        }
      })
    });

    // клиенту
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_id,
        text: "✅ Вы записались. Ожидайте подтверждения"
      })
    });

    res.json({ ok: true });

  } catch (e) {
    console.log(e);
    res.status(500).json({ ok: false });
  }
});


// 📌 WEBHOOK
app.post(`/bot${TOKEN}`, async (req, res) => {
  const data = req.body;

  // ✏️ комментарий после reject
  if (data.message && pendingRejects[data.message.chat.id]) {

    const comment = data.message.text;
    const info = pendingRejects[data.message.chat.id];

    const bookingId = info.bookingId;
    const userId = info.userId;

    // PATCH
    await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: "rejected"
      })
    });

    // сообщение клиенту
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

  // кнопки
  if (data.callback_query) {

    await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: data.callback_query.id
      })
    });

    const { data: cbData, message } = data.callback_query;
    const [action, bookingId, userId] = cbData.split("|");

    // ✅ ПРИНЯТЬ
    if (action === "approve") {
    const oldText = message.text;

await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: message.chat.id,
    message_id: message.message_id,
    text: `
${oldText}

Статус: ✅ Подтверждено
`,
    reply_markup: { inline_keyboard: [] }
  })
});

      // клиенту
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: userId,
          text: "✅ Ваша заявка подтверждена"
        })
      });

      // обновляем сообщение
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
        userId
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
