import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

function normalizeArabicDigits(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .trim();
}

function extractDateFromMessage(message) {
  const text = normalizeArabicDigits(message);

  const isoMatch = text.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/);
  if (isoMatch) return isoMatch[1];

  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

async function checkDateAvailability(date) {
  const snapshot = await db.collection("bookings").where("date", "==", date).get();

  const activeBookings = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => item.status !== "cancelled");

  return {
    isAvailable: activeBookings.length === 0,
    bookings: activeBookings,
  };
}

function buildSystemPrompt(extraContext = "") {
  return `
أنت مساعد ذكي خاص بمنتجع ومخيم رمال.
مهمتك الرد فقط على أسئلة العملاء المتعلقة بالمنتجع.
لا تتكلم في مواضيع خارجية.
كن مختصرًا، واضحًا، احترافيًا، وبلهجة سعودية طبيعية.

معلومات المنتجع:
- الاسم: منتجع ومخيم رمال
- مدة الحجز:
  12 ساعة:
    وسط الأسبوع: 800 ريال
    نهاية الأسبوع: 950 ريال
    الأعياد: 1200 ريال
  24 ساعة:
    وسط الأسبوع: 1300 ريال
    نهاية الأسبوع: 1700 ريال
    الأعياد: 2200 ريال

الخدمات:
- مجلس رجال
- مجلس حريم
- مطبخ
- ملعب
- مسبح
- ألعاب مائية
- ألعاب أطفال

معلومات إضافية:
- الملعب الصابوني: 150 ريال
- الملعب الصابوني لا يتاح إلا بعد وجود حجز
- لن يتم تأكيد الحجز إلا بعد دفع العربون
- يتم دفع باقي المبلغ والتأمين 500 ريال عند الدخول
- التأمين 500 ريال ويدفع قبل الدخول ويسترجع عند سلامة محتويات المنتجع
- يجب مراقبة الأطفال في المسبح وحوله لأن عمق المسبح 2 متر
- يجب المحافظة على محتويات المنتجع ويتحمل المستأجر أي أضرار
- يخصم 100 ريال في حال عدم نظافة المنتجع
- العربون لا يسترجع في حال إلغاء الحجز
- لا يسمح بإخراج الفرش أو الأثاث للخارج

إذا سأل العميل عن الحجز:
- قل له يقدر يحجز من النموذج الموجود بالموقع
- أو يتواصل عبر الواتساب
- وإذا كان التاريخ متاح، شجعه يكمل الحجز

رقم الواتساب:
0556662246

${extraContext}
`;
}

async function askAI(message, extraContext = "") {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://your-site.vercel.app",
      "X-Title": "Rimal Booking",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt(extraContext) },
        { role: "user", content: message },
      ],
      temperature: 0.4,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenRouter request failed");
  }

  return data?.choices?.[0]?.message?.content || "تعذر الرد الآن، حاول مرة ثانية.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    const requestedDate = extractDateFromMessage(message);

    // إذا فيه تاريخ: نفحص التوفر أولًا ثم نخلي AI يرد على أساس النتيجة
    if (requestedDate) {
      const availability = await checkDateAvailability(requestedDate);

      if (!availability.isAvailable) {
        const reply = await askAI(
          message,
          `معلومة مؤكدة من النظام: التاريخ ${requestedDate} غير متاح حاليًا بسبب وجود حجز سابق غير ملغي. لا تقل ربما. لا تعرض هذا التاريخ كمتاح. اطلب من العميل تاريخًا آخر.`
        );

        return res.status(200).json({ reply });
      }

      const reply = await askAI(
        message,
        `معلومة مؤكدة من النظام: التاريخ ${requestedDate} متاح مبدئيًا حاليًا. شجع العميل على إكمال الحجز واطلب منه الاسم ورقم الجوال ومدة الحجز ونوع اليوم إن كانت غير مذكورة.`
      );

      return res.status(200).json({ reply });
    }

    // إذا ما فيه تاريخ: يشتغل البوت الطبيعي
    const reply = await askAI(message);

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
}
