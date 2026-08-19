# EXE Bridge Architecture

## الهدف

```text
https://hr-alsalman.com/api/
              ↓ HTTPS + x-auth
       Windows Electron EXE
              ↓ HTTP/HTTPS + Internal API Key
         internal-server
```

تطبيق Windows هو الوسيط الوحيد. لا يحتوي EXE على بيانات MySQL ولا يتصل بقاعدة البيانات مباشرة. كذلك لا يملك الموقع أو السيرفر الداخلي أي اتصال مباشر أحدهما بالآخر.

## مسار التشغيل

1. يبدأ EXE خادم loopback على `127.0.0.1` لخدمة الواجهة العربية الحالية.
2. يفحص `https://hr-alsalman.com/api/ping.php`، ويسجل الدخول عبر `login.php` ويحفظ التوكن البعيد في الذاكرة فقط.
3. يقرأ `db.php` ويقارن `version` و`updatedAt`.
4. يرسل النسخة المستلمة، من داخل EXE، إلى `internal-server/api/store` مع `operation_id` و`source_version`.
5. لا يستبدل نسخة محلية أو داخلية ذات تعديلات غير مدمجة؛ يسجل التعارض للمراجعة.
6. يحدث Cache داخل Electron `userData/data` بعد نجاح المقارنة.

## تعديل البيانات داخل EXE

كل وظائف النظام تعدل وثيقة HR الحالية نفسها. بعد كل حفظ:

1. يكتب EXE نسخة ذرية في `userData/data/store.json`.
2. ينشئ عملية UUID داخل `internal-queue.json`.
3. يرسل العملية إلى `internal-server/api/sync` مع `base_version`.
4. يسجل السيرفر العملية في `history.json` ويرفض تكرار `operation_id`.
5. عند خطأ `409` يحفظ EXE النسختين في `internal-conflicts.json` ولا يحذف التعديل المحلي.

المرفقات تستخدم المسار نفسه عبر `/api/attachments`، مع دمج آخر عملية للمفتاح الواحد داخل Queue.

## حالات الانقطاع

- **انقطاع الموقع فقط:** يستمر EXE من Cache، ويستمر بإرسال تعديلات المستخدم إلى السيرفر الداخلي.
- **انقطاع السيرفر الداخلي فقط:** يحفظ EXE التعديلات محلياً وفي Queue، ثم يرسلها بالترتيب عند عودة السيرفر.
- **انقطاع الاثنين:** يعمل EXE من Cache ويحفظ Queue محلياً.
- **عودة الموقع:** يجلب EXE الإصدار الجديد. إذا وجدت تعديلات محلية/داخلية غير مدمجة يسجل تعارضاً بدلاً من الاستبدال التلقائي.

## إعداد السيرفر الداخلي

من إعدادات نسخة Windows يحدد المدير:

- عنوان API، مثل `http://192.168.1.50:3000/api`.
- مفتاح API المطابق للمتغير `INTERNAL_API_KEY` على السيرفر الداخلي.

المفتاح محفوظ محلياً داخل `userData` ولا يرسل إلى موقع الشركة.

## API السيرفر الداخلي

| Endpoint | الغرض |
|---|---|
| `GET /api/ping` | الصحة، الإصدار، وآخر تحديث |
| `GET/PUT /api/store` | قراءة أو حفظ النسخة القادمة من الموقع عبر EXE |
| `POST /api/sync` | تعديل صادر من EXE مع optimistic version |
| `GET/PUT/DELETE /api/attachments?key=` | المرفقات |
| `GET /api/backup` | نسخة شاملة |
| `GET /api/history` | سجل العمليات ومعرّفات منع التكرار |

## ملفات التخزين الداخلي

- `store.json`: البيانات والإصدارات.
- `attachments/`: المرفقات بمفاتيح مجزأة.
- `backups/`: نسخ ذرية لكل حفظ.
- `history.json`: سجل المزامنة و`operation_id`.

## الأمان

- الموقع يستخدم HTTPS فقط ورمز جلسة `x-auth`.
- الاتصال الداخلي يدعم HTTP داخل LAN أو HTTPS، ويستخدم `X-API-Key`/Bearer.
- لا توجد بيانات MySQL في Electron أو السيرفر الداخلي.
- تغييرات البيانات تتطلب جلسة Electron مصادقاً عليها.
- Cache غير المصادق عليه لا يعيد كلمات مرور الموظفين إلى renderer.
