export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    const systemPrompt = `
أنت مساعد ذكي خاص بمنتجع ومخيم الرمال.
مهمتك الرد فقط على أسئلة العملاء المتعلقة بالمنتجع.
لا تتكلم في مواضيع خارجية.
كن مختصرًا، واضحًا، واحترافيًا.

معلومات المنتجع:
- الاسم: منتجع ومخيم الرمال
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

رقم الواتساب:
0556662246
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://your-site.vercel.app",
        "X-Title": "Rimal Booking"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.4
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: data?.error?.message || "OpenRouter request failed"
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "تعذر الرد الآن، حاول مرة ثانية.";

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
