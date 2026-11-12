// الطالب الذكي — دالة المراجعة الذكية (Supabase Edge Function)
// تستقبل صورة درس أو موضوع مكتوب، وترجع: ملخص + بطاقات مراجعة + اختبار قصير.
// الأسرار (تحطها أنت بنفسك في Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY   مفتاحك من Google AI Studio (لا ترسله لأحد)
//   GEMINI_MODEL     اختياري (الافتراضي gemini-2.5-flash-lite)
//   SS_DAILY_LIMIT   اختياري: عدد الدروس المجانية في اليوم لكل جهاز (الافتراضي 3)
// الصور ما تنحفظ أبدًا: تروح للتحليل بس.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const SUBJECTS = ['رياضيات', 'علوم', 'فيزياء', 'كيمياء', 'أحياء', 'لغة عربية', 'لغة إنجليزية', 'دراسات اجتماعية', 'تربية إسلامية', 'تقنية المعلومات', 'أخرى'];

function prompt(subject: string, grade: string, topic: string, hasImage: boolean) {
  return `أنت معلم عُماني صبور ولطيف، تساعد طالبًا في ${grade || 'المرحلة المدرسية'} على مراجعة مادة ${subject || 'دراسية'} قبل الاختبار، على طريقة مناهج وزارة التربية والتعليم في سلطنة عُمان.
${hasImage ? 'المرفق صورة من كتاب أو دفتر الطالب.' : ''}${topic ? `\nموضوع الدرس كما كتبه الطالب: «${topic}»` : ''}

قواعد مهمة:
- هدفك أن يفهم الطالب ويتذكر، لا أن تحل له الواجب. إذا كانت الصورة واجبًا أو أسئلة، اشرح المفهوم وطريقة الحل بخطوات، ولا تكتب الإجابة النهائية لكل سؤال.
- إذا لم تكن الصورة أو الموضوع مادة دراسية مناسبة لطالب مدرسة، أرجع {"error":"not_study"} فقط.
- اكتب بالعربية الفصحى البسيطة (وإذا كانت المادة لغة إنجليزية فاكتب الأمثلة بالإنجليزية والشرح بالعربية).
- محتوى مناسب للأطفال، بدون روابط وبدون أي بيانات شخصية.

أرجع JSON فقط بهذا الشكل بالضبط:
{
  "title": "عنوان الدرس (قصير)",
  "subject": "اسم المادة",
  "summary": ["٣ إلى ٧ نقاط قصيرة تلخص أهم ما في الدرس"],
  "explain": "شرح مبسط في فقرة أو فقرتين، مع مثال",
  "cards": [{"q": "سؤال مراجعة قصير", "a": "إجابة قصيرة"}],
  "quiz": [{"q": "سؤال اختيار من متعدد", "options": ["أ","ب","ج","د"], "answer": 0, "why": "سبب صحة الإجابة باختصار"}],
  "tip": "نصيحة قصيرة للمذاكرة لهذا الدرس"
}
- البطاقات من 5 إلى 8، والاختبار من 5 إلى 8 أسئلة، وكل سؤال 4 خيارات، و"answer" رقم الخيار الصحيح من 0 إلى 3.`;
}

async function bump(device: string, limit: number) {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return { ok: true, left: limit - 1 };
  const r = await fetch(url + '/rest/v1/rpc/ss_bump', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_device: device, p_limit: limit }),
  });
  if (!r.ok) return { ok: true, left: limit - 1 };   // لو الجدول ناقص، لا نوقف الطالب
  const n = await r.json();                           // يرجع العدد بعد الزيادة، أو -1 إذا وصل الحد
  return n < 0 ? { ok: false, left: 0 } : { ok: true, left: Math.max(0, limit - n) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: any; try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const device = String(body.device || '').slice(0, 64);
  const image = typeof body.image === 'string' ? body.image.replace(/^data:image\/\w+;base64,/, '') : '';
  const topic = String(body.topic || '').slice(0, 400).trim();
  const subject = SUBJECTS.includes(body.subject) ? body.subject : '';
  const grade = String(body.grade || '').slice(0, 30);
  if (!/^[a-z0-9-]{16,64}$/i.test(device)) return json({ error: 'device' }, 400);
  if (!image && topic.length < 3) return json({ error: 'empty' }, 400);
  if (image.length > 3_000_000) return json({ error: 'too_big' }, 413);

  if (body.check) {                                    // سؤال: كم باقي اليوم؟ (بدون استهلاك)
    return json({ ok: true });
  }

  const KEY = Deno.env.get('GEMINI_API_KEY');
  if (!KEY) return json({ error: 'no_key' }, 503);
  const limit = Number(Deno.env.get('SS_DAILY_LIMIT') || 3);
  const use = await bump(device, limit);
  if (!use.ok) return json({ error: 'limit', left: 0 }, 429);

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
  const parts: any[] = [{ text: prompt(subject, grade, topic, !!image) }];
  if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });
  const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 4096 } }),
  });
  if (!g.ok) { console.error('gemini', g.status, (await g.text()).slice(0, 300)); return json({ error: 'ai' }, 502); }
  const out = await g.json();
  const txt = out?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  let data: any; try { data = JSON.parse(txt); } catch { return json({ error: 'ai_format' }, 502); }
  if (data?.error === 'not_study') return json({ error: 'not_study', left: use.left }, 422);

  // تنظيف بسيط
  const S = (v: any, n = 400) => String(v ?? '').slice(0, n);
  const lesson = {
    title: S(data.title, 80) || 'درس جديد',
    subject: S(data.subject, 40) || subject,
    summary: (Array.isArray(data.summary) ? data.summary : []).slice(0, 8).map((x: any) => S(x, 300)),
    explain: S(data.explain, 1600),
    cards: (Array.isArray(data.cards) ? data.cards : []).slice(0, 10).map((c: any) => ({ q: S(c.q, 200), a: S(c.a, 300) })).filter((c: any) => c.q && c.a),
    quiz: (Array.isArray(data.quiz) ? data.quiz : []).slice(0, 10).filter((q: any) => Array.isArray(q.options) && q.options.length >= 2)
      .map((q: any) => ({ q: S(q.q, 300), options: q.options.slice(0, 4).map((o: any) => S(o, 160)), answer: Math.max(0, Math.min(3, Number(q.answer) || 0)), why: S(q.why, 300) })),
    tip: S(data.tip, 300),
  };
  return json({ ok: true, lesson, left: use.left });
});
