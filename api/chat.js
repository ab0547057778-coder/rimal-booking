import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const firebaseConfig = {
  projectId: "alrimal2",
};

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    ...firebaseConfig,
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

  // صيغة مثل 2026-04-10
  const isoMatch = text.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/);
  if (isoMatch) return isoMatch[1];

  // صيغة مثل 10/4/2026 أو 10-4-2026
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

    // إذا العميل كتب تاريخ، نتحقق أولًا من Firebase
    if (requestedDate) {
      const availability = await checkDateAvailability(requestedDate);

      if (!availability.isAvailable) {
        return res.status(200).json({
          reply: `التاريخ ${requestedDate} غير متاح حاليًا. أرسل لي تاريخ ثاني وأشيك لك مباشرة.`,
        });
      }

      return res.status(200).json({
        reply: `التاريخ ${requestedDate} متاح مبدئيًا ✅\nإذا حاب أكمل الحجز أرسل لي:\n- الاسم\n- رقم الجوال\n- مدة الحجز (12 أو 24 ساعة)\n- نوع اليوم`,
      });
    }

    // إذا ما فيه تاريخ، يرد رد عام
    return res.status(200).json({
      reply: `حياك الله 🌷\nأرسل لي تاريخ الحجز بالشكل هذا:\n2026-04-10\nوأشيك لك فورًا هل هو متاح أو لا.`,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
}
