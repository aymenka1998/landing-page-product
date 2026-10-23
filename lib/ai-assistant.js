const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string' },
    tagline: { type: 'string' },
    description: { type: 'string' },
    badge: { type: 'string' },
    guaranteeText: { type: 'string' },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          icon: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['icon', 'title', 'description'],
      },
    },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['name', 'type', 'tagline', 'description', 'badge', 'guaranteeText', 'features', 'faq'],
};

const ANSWER_LIMITS = {
  product: 500,
  audience: 300,
  problem: 500,
  benefits: 700,
  specifications: 1000,
  contents: 400,
  shippingWarranty: 500,
};

async function generateProductDraft(answers) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('أضف GEMINI_API_KEY في إعدادات Vercel أو ملف .env المحلي لتفعيل المساعد.');
    error.status = 503;
    throw error;
  }

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    const error = new Error('أدخل معلومات المنتج أولاً.');
    error.status = 400;
    throw error;
  }

  const cleanAnswers = {};
  for (const [key, max] of Object.entries(ANSWER_LIMITS)) {
    const value = typeof answers[key] === 'string' ? answers[key].trim() : '';
    if (value.length > max) {
      const error = new Error('أحد الأجوبة أطول من الحد المسموح. اختصره ثم حاول مجدداً.');
      error.status = 400;
      throw error;
    }
    cleanAnswers[key] = value;
  }

  if (!cleanAnswers.product || !cleanAnswers.benefits) {
    const error = new Error('اكتب اسم المنتج أو وصفه، واذكر أهم فائدة واحدة على الأقل.');
    error.status = 400;
    throw error;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
  const prompt = [
    'أنت مساعد كتابة لمتجر إلكتروني جزائري. اكتب بالعربية الواضحة وبأسلوب مختصر وصادق.',
    'استخدم الحقائق التي قدمها المستخدم فقط. لا تخترع مواصفات أو شهادات أو نتائج صحية أو ضماناً أو سعراً أو مدة توصيل.',
    'إذا لم يذكر المستخدم معلومة، اترك الحقل الخاص بها فارغاً أو اجعل قائمته فارغة. يمكنك صياغة الفوائد المذكورة بلغة تسويقية معتدلة دون إضافة ادعاءات جديدة.',
    'أنشئ 3 إلى 5 مزايا وأسئلة شائعة لا تجيب إلا بما ورد في المدخلات. أخرج البيانات حسب مخطط JSON فقط.',
    `إجابات صاحب المتجر: ${JSON.stringify(cleanAnswers)}`,
  ].join('\n\n');
  const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        thinkingConfig: { thinkingLevel: 'minimal' },
        maxOutputTokens: 1400,
      },
    });
  const requestModel = (modelId, timeoutMs) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: requestBody,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let response;
  try {
    response = await requestModel(model, 5000);
  } catch (error) {
    if (fallbackModel === model || error.name !== 'TimeoutError') throw error;
    response = await requestModel(fallbackModel, 18000);
  }
  if (response.status === 503 && fallbackModel !== model) response = await requestModel(fallbackModel, 18000);

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(response.status === 400
      ? 'رفض Gemini صيغة الطلب. تحقق من مخطط الاستجابة.'
      : response.status === 403
        ? 'مفتاح Gemini غير صحيح أو لا يملك صلاحية استخدام Gemini API.'
        : response.status === 503
          ? 'نموذج Gemini مشغول مؤقتاً. أعد المحاولة بعد قليل.'
          : response.status === 429
            ? 'وصلت إلى حد الاستخدام المجاني لـ Gemini. انتظر تجدد الحصة أو تحقق من إعدادات الاستخدام.'
            : 'تعذر توليد الاقتراح الآن. حاول مرة أخرى.');
    error.status = [400, 403, 429, 503].includes(response.status) ? response.status : 502;
    throw error;
  }

  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  if (!text) {
    const error = new Error('لم يصل اقتراح قابل للاستخدام. أعد المحاولة بإجابات أوضح.');
    error.status = 502;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('وصلت استجابة غير مكتملة من المساعد. أعد المحاولة.');
    error.status = 502;
    throw error;
  }
}

module.exports = { generateProductDraft };
