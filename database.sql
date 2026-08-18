-- =====================================================================
--  نظام الموارد البشرية — شركة السلمان للتجارة والصناعة
--  قاعدة بيانات كاملة جاهزة: تُنشئ الجداول + تزرع حسابَي الدخول مباشرة
--  الاستيراد: phpMyAdmin ← اختر قاعدتك أولاً من القائمة ← Import ← اختر هذا الملف ← Go
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) المخزن الرئيسي (JSON كامل بيانات النظام)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_store` (
  `id`         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `version`    INT UNSIGNED     NOT NULL DEFAULT 0,
  `data`       LONGTEXT         NULL,
  `updated_at` DATETIME         NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2) الملفات والصور والمرفقات
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_kv` (
  `k`          VARCHAR(191) NOT NULL,
  `v`          LONGTEXT     NULL,
  `updated_at` DATETIME     NULL,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3) جلسات الدخول
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_sessions` (
  `token`      CHAR(48)     NOT NULL,
  `emp_id`     VARCHAR(32)  NOT NULL,
  `emp_name`   VARCHAR(160) NULL,
  `role`       VARCHAR(32)  NULL,
  `created_at` DATETIME     NULL,
  `expires_at` DATETIME     NOT NULL,
  PRIMARY KEY (`token`),
  KEY `idx_exp` (`expires_at`),
  KEY `idx_emp` (`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4) جدول الموظفين (تقارير)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_employees` (
  `id`            VARCHAR(32)  NOT NULL,
  `name`          VARCHAR(160) NULL,
  `iqama`         VARCHAR(32)  NULL,
  `iqama_expiry`  DATE         NULL,
  `mobile`        VARCHAR(32)  NULL,
  `email`         VARCHAR(160) NULL,
  `role`          VARCHAR(32)  NULL,
  `branch`        VARCHAR(16)  NULL,
  `dept`          VARCHAR(80)  NULL,
  `title`         VARCHAR(120) NULL,
  `nationality`   VARCHAR(60)  NULL,
  `join_date`     DATE         NULL,
  `contract_end`  DATE         NULL,
  `salary`        DECIMAL(12,2) NULL,
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_at`    DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_iqama` (`iqama`),
  KEY `idx_branch` (`branch`),
  KEY `idx_role` (`role`),
  KEY `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5) جدول المعاملات (تقارير)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_requests` (
  `id`           VARCHAR(32)  NOT NULL,
  `type`         VARCHAR(32)  NULL,
  `emp_id`       VARCHAR(32)  NULL,
  `emp_name`     VARCHAR(160) NULL,
  `branch`       VARCHAR(16)  NULL,
  `status`       VARCHAR(24)  NULL,
  `stage`        VARCHAR(32)  NULL,
  `assignee`     VARCHAR(32)  NULL,
  `created_at`   DATETIME     NULL,
  `due_at`       DATE         NULL,
  `completed_at` DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_emp` (`emp_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6) الحضور والانصراف
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_attendance` (
  `day`       DATE        NOT NULL,
  `emp_id`    VARCHAR(32) NOT NULL,
  `check_in`  VARCHAR(8)  NULL,
  `check_out` VARCHAR(8)  NULL,
  PRIMARY KEY (`day`,`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7) رموز استعادة كلمة المرور
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_reset_codes` (
  `emp_id`     VARCHAR(32) NOT NULL,
  `code`       CHAR(6)     NOT NULL,
  `tries`      TINYINT     NOT NULL DEFAULT 0,
  `expires_at` DATETIME    NOT NULL,
  PRIMARY KEY (`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8) سجل العمليات
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_audit` (
  `id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `at`       DATETIME     NULL,
  `emp_id`   VARCHAR(32)  NULL,
  `emp_name` VARCHAR(160) NULL,
  `action`   VARCHAR(64)  NULL,
  `details`  VARCHAR(255) NULL,
  `ip`       VARCHAR(64)  NULL,
  PRIMARY KEY (`id`),
  KEY `idx_at` (`at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9) النسخ الاحتياطية
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_backups` (
  `id`      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `at`      DATETIME NULL,
  `version` INT UNSIGNED NULL,
  `data`    LONGTEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
--  زرع البيانات الأولية: حساب مدير الموارد البشرية + موظف القسم
--  (لا يُنفَّذ إلا إذا كانت القاعدة فارغة فعلاً — آمن على أي بيانات موجودة)
-- =====================================================================
INSERT INTO hr_store (id, version, data, updated_at)
SELECT 1, 1, '{"employees": [{"id": "1005807605", "name": "مدير الموارد البشرية", "nameEn": "", "pass": "12345", "mustChangePass": true, "role": "hr", "branch": "B1", "dept": "الموارد البشرية", "title": "مدير عام الموارد البشرية", "nationality": "سعودي", "iqama": "1005807605", "iqamaExpiry": null, "gender": "ذكر", "birthDate": "", "marital": "", "passport": {"no": "", "expiry": ""}, "address": {"city": "", "district": ""}, "emergency": {"name": "", "relation": "", "mobile": ""}, "qualification": {"degree": "", "major": "", "year": "", "institute": ""}, "expYears": "", "mobile": "", "email": "", "salary": 0, "pay": {"basic": 0, "housing": 0, "transport": 0, "other": 0}, "bank": {"name": "", "iban": ""}, "dependents": [], "notes": [], "achievements": [], "joinDate": "2026-08-12", "contractStart": "", "contractEnd": "", "contractType": "غير محدد المدة", "contractImg": 0, "contractDecision": "", "insurance": {"company": "", "policy": "", "cls": "", "expiry": ""}, "leaveBalance": 30, "leaveTaken": 0, "managerId": null, "active": true, "profileComplete": false, "photo": 0, "iqamaImg": 0, "passportImg": 0, "certImg": 0, "createdAt": "2026-08-12T13:28:32.718Z"}, {"id": "2442061814", "name": "موظف قسم الموارد البشرية", "nameEn": "", "pass": "123456", "mustChangePass": true, "role": "hr_staff", "branch": "B1", "dept": "الموارد البشرية", "title": "أخصائي موارد بشرية", "nationality": "سعودي", "iqama": "2442061814", "iqamaExpiry": null, "gender": "ذكر", "birthDate": "", "marital": "", "passport": {"no": "", "expiry": ""}, "address": {"city": "", "district": ""}, "emergency": {"name": "", "relation": "", "mobile": ""}, "qualification": {"degree": "", "major": "", "year": "", "institute": ""}, "expYears": "", "mobile": "", "email": "", "salary": 0, "pay": {"basic": 0, "housing": 0, "transport": 0, "other": 0}, "bank": {"name": "", "iban": ""}, "dependents": [], "notes": [], "achievements": [], "joinDate": "2026-08-12", "contractStart": "", "contractEnd": "", "contractType": "غير محدد المدة", "contractImg": 0, "contractDecision": "", "insurance": {"company": "", "policy": "", "cls": "", "expiry": ""}, "leaveBalance": 30, "leaveTaken": 0, "managerId": "1005807605", "active": true, "profileComplete": false, "photo": 0, "iqamaImg": 0, "passportImg": 0, "certImg": 0, "createdAt": "2026-08-12T13:28:32.718Z"}], "requests": [], "notifs": [], "docs": [], "tasks": [], "pages": [], "chats": [], "att": {}, "archive": {"employees": [], "requests": [], "chats": [], "messages": []}, "types": {}, "empFields": [], "logins": [], "alerted": {}, "resets": [], "assets": [], "vehicles": [], "gov": [], "evals": [], "seq": {"req": 1000, "n": 0, "t": 0}, "branches": [{"id": "B1", "name": "الإدارة العامة", "city": "الإدارة العامة"}, {"id": "B2", "name": "فندق السلمان", "city": "فندق السلمان"}, {"id": "B3", "name": "مخابز السلمان", "city": "مخابز السلمان"}, {"id": "B4", "name": "السلمان للتسوق", "city": "السلمان للتسوق"}, {"id": "B5", "name": "صيدليات السلمان", "city": "صيدليات السلمان"}, {"id": "B6", "name": "السلمان للزراعة", "city": "السلمان للزراعة"}, {"id": "B7", "name": "السلمان للطباعة", "city": "السلمان للطباعة"}, {"id": "B8", "name": "مصنع السلمان", "city": "مصنع السلمان"}], "depts": ["الموارد البشرية", "المالية", "المبيعات", "التشغيل", "تقنية المعلومات", "المشتريات", "خدمة العملاء", "الصيانة"], "nations": ["سعودي", "مصري", "هندي", "باكستاني", "بنغلاديشي", "فلبيني", "سوداني", "يمني", "سوري", "أردني", "لبناني", "فلسطيني", "عراقي", "كويتي", "إماراتي", "بحريني", "عماني", "قطري", "تونسي", "مغربي", "جزائري", "ليبي", "موريتاني", "صومالي", "إثيوبي", "إريتري", "جيبوتي", "كيني", "أوغندي", "نيجيري", "غاني", "تشادي", "نيبالي", "سريلانكي", "إندونيسي", "ماليزي", "تايلندي", "فيتنامي", "بورمي", "صيني", "تركي", "أفغاني", "إيراني", "أوزبكي", "كازاخي", "بريطاني", "أمريكي", "كندي", "فرنسي", "ألماني", "أخرى"], "settings": {"orgName": "شركة السلمان للتجارة والصناعة", "orgNameEn": "Al Salman Trd & Industrial Co.", "intro": "الحديث عن شركة السلمان منذ عهد مؤسسها والدنا الشيخ صالح بن عبد الله السلمان يرحمه الله بشتى فروعها ( مخابز السلمان – السلمان للزراعة – السلمان للتسوق – السلمان للطباعة – صيدليات السلمان ) يختلف تماماً عن الأهداف..", "brand": {"color": "#1C6BA8", "accent": "#8A99A6", "ink": "#132A3F"}, "hrEmail": "aabdullah883@gmail.com", "hrMobile": "", "mailApprovals": true, "mailDaily": true, "mailHour": 16, "workStart": "08:00", "workEnd": "17:00", "lateAfter": "08:15", "alertIqama": 60, "alertContract": 60, "alertDoc": 60, "alertIns": 45, "defaultLeave": 30, "gmInLeave": false, "waOn": true, "chains": {"leave": {"steps": ["manager", "branch", "hr"], "exec": true, "sla": 3}, "visit": {"steps": ["manager", "branch", "hr"], "exec": true, "sla": 5}, "bank": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 5}, "contract": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 10}, "eos": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 14}, "inquiry": {"steps": ["hr_staff"], "exec": false, "sla": 2}, "insurance": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 7}, "letter": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 2}, "sim": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 4}, "iqama": {"steps": ["branch", "hr_staff", "hr"], "exec": true, "sla": 7}, "exit": {"steps": ["manager", "branch", "hr_staff", "hr"], "exec": true, "sla": 3}}, "perms": {"hr": {"hrdash": true, "inbox": true, "proc": true, "allreq": true, "inquiries": true, "staff": true, "team": true, "brreq": true, "contracts": true, "brcontracts": true, "insur": true, "iqamas": true, "docs": true, "daily": true, "nations": true, "reports": true, "archive": true, "custody": true, "evals": true, "vehicles": true, "gov": true, "brdash": true, "resets": true, "att": true, "hrteam": true, "tasksAdmin": true, "builder": true, "settings": true, "perms": true, "addEmp": true, "editEmp": true, "deleteEmp": true, "viewSalary": true, "resetPass": true, "editDocs": true, "assignReq": true, "chat": true, "chatAll": true, "deleteTask": true, "deleteAchv": true, "adminReq": true, "archiveDelete": true, "exportData": true, "whats": true}, "hr_staff": {"hrdash": 1, "inbox": 1, "proc": 1, "allreq": 1, "inquiries": 1, "staff": 1, "contracts": 1, "insur": 1, "iqamas": 1, "docs": 1, "daily": 1, "nations": 1, "archive": 1, "resets": 1, "att": 1, "custody": 1, "evals": 1, "vehicles": 1, "gov": 1, "brdash": 1, "hrteam": 1, "tasksAdmin": 1, "assignReq": 1, "addEmp": 1, "chat": 1, "editEmp": 1, "viewSalary": 1, "resetPass": 1, "editDocs": 1, "exportData": 1, "whats": 1, "reports": 1}, "gm": {"hrdash": 1, "inbox": 1, "allreq": 1, "reports": 1, "nations": 1, "chat": 1}, "branch": {"inbox": 1, "team": 1, "brcontracts": 1, "brreq": 1, "chat": 1, "att": 1, "brdash": 1, "gov": 1, "evals": 1, "custody": 1, "vehicles": 1}, "hr_branch": {"inbox": 1, "team": 1, "brcontracts": 1, "brreq": 1, "chat": 1, "att": 1, "brdash": 1, "custody": 1, "gov": 1, "evals": 1}, "manager": {"inbox": 1, "team": 1, "chat": 1, "att": 1, "evals": 1}, "employee": {"chat": 1}}, "chainsV2": true}}', NOW()
WHERE NOT EXISTS (SELECT 1 FROM hr_store WHERE id = 1 AND data IS NOT NULL);

-- =====================================================================
--  حسابات الدخول الجاهزة بعد الاستيراد:
--  1005807605 / 12345    ← مدير الموارد البشرية (كامل الصلاحيات)
--  2442061814 / 123456   ← موظف قسم الموارد البشرية
--  كلاهما يُطلب تغيير كلمة المرور عند أول دخول
-- =====================================================================
