# الطالب الذكي — مراجعة ذكية قبل الاختبارات

الطالب يصوّر صفحة من الكتاب أو يكتب اسم الدرس، ويطلع له:
ملخص بأهم النقاط + شرح مبسط + بطاقات مراجعة + اختبار قصير بنتيجة ونجوم.

- بدون تسجيل وبدون بيانات شخصية. الدروس تنحفظ في جوال الطالب.
- الصور ما تنحفظ: تروح لـ Gemini عن طريق دالة Supabase وبس.
- حد مجاني يومي لكل جهاز (3 دروس افتراضيًا).

## التجهيز (مرة وحدة)
1. Supabase → SQL Editor: الصق `supabase/setup.sql` واضغط Run.
2. Supabase → Edge Functions → Deploy a new function → Via Editor
   - الاسم: `smart-study`
   - الصق محتوى `supabase/functions/smart-study/index.ts` واضغط Deploy.
   - من إعدادات الدالة: أطفئ **Enforce JWT verification** (التطبيق يستخدم المفتاح العام publishable).
3. Supabase → Edge Functions → Secrets: أضف `GEMINI_API_KEY` (مفتاحك من Google AI Studio، بخطة مدفوعة).
   اختياري: `SS_DAILY_LIMIT` و `GEMINI_MODEL`.

## البناء
Codemagic → workflow «الطالب الذكي — آيفون» (bundle id: com.salemaljabri.smartstudent).
