# AlSalman HR Internal Server

Backend داخلي مستقل يعمل بـ Node.js دون MySQL أو اتصال بموقع الشركة. يتعامل معه Windows EXE فقط.

```bash
# أنشئ مفتاحاً قوياً ومختلفاً لكل منشأة
set INTERNAL_API_KEY=replace-with-a-long-random-secret
set INTERNAL_HOST=0.0.0.0
set INTERNAL_PORT=3000
node server.js
```

على Linux استخدم `export` بدلاً من `set`. البيانات تحفظ افتراضياً في `internal-server/data`، ويمكن تغييرها بواسطة `INTERNAL_DATA`. أدخل في إعدادات EXE العنوان `http://IP:3000/api` والمفتاح نفسه. يوصى بجدار ناري يسمح فقط لأجهزة Windows المعتمدة، وبـ HTTPS إذا عبر الاتصال شبكات غير موثوقة.
