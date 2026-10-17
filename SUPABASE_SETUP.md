# إعداد Supabase مع لوحة Vercel

## قاعدة البيانات والصور

1. افتح SQL Editor في مشروع Supabase وشغّل `supabase/schema.sql`.
2. شغّل بعدها `supabase/seed_product.sql` لاستيراد بيانات المنتج الحالية.
3. من Authentication → Users أنشئ مستخدم المسؤول ببريده وكلمة مروره. عطّل التسجيل العام في إعدادات Authentication؛ تسجيل الدخول مخصص لهذا المستخدم.

## متغيرات Vercel

في مشروع **لوحة التحكم** أضف المتغيرات التالية لكل من Production وPreview، ثم أعد النشر:

- `NEXT_PUBLIC_SUPABASE_URL` — رابط المشروع؛ اجعل Visibility = `config`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — المفتاح الذي يبدأ بـ `sb_publishable_`؛ اجعل Visibility = `config`.
- `SUPABASE_SECRET_KEY` — المفتاح السري الذي يبدأ بـ `sb_secret_`؛ اجعل Visibility = `secret`، ولا تضعه في الواجهة أو المستودع.
- `ADMIN_EMAIL` — نفس بريد مستخدم المسؤول الذي أنشأته في Supabase؛ اجعل Visibility = `config`.
- `GEMINI_API_KEY` — مفتاح Google AI Studio لتشغيل المساعد الذكي؛ اجعل Visibility = `secret` ولا تضعه في مشروع صفحة المنتج.
- `GEMINI_MODEL` — اختياري؛ الافتراضي `gemini-3.1-flash-lite`.

في مشروع **صفحة المنتج** أضف `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` فقط، واجعل Visibility = `config` لكليهما. لا تضف المفتاح السري لهذا المشروع.

## تسجيل الدخول من Vercel

افتح رابط لوحة Vercel من أي شبكة، ثم أدخل كلمة مرور المسؤول فقط. يحتفظ الخادم ببريد Supabase في متغير `ADMIN_EMAIL`؛ لا يظهر البريد في نموذج الدخول. بعد نجاح الدخول، تحفظ جلسة آمنة في المتصفح.

بعد تشغيل SQL وإضافة المتغيرات وإنشاء المستخدم، أعد نشر مشروعي Vercel. تغييرات المنتج والصور التي تحفظها اللوحة تُقرأ بعد ذلك من Supabase في صفحة المنتج.
