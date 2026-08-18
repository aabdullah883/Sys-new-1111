<?php
/**
 * إعدادات نظام الموارد البشرية
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'hr_system');
define('DB_USER', 'hr_system');
define('DB_PASS', 'Abdullah461883');

// ===== إعدادات البريد =====
define('MAIL_METHOD', 'phpmail');
define('MAIL_FROM', 'hr@alsalman.com.sa');
define('MAIL_FROM_NAME', 'نظام الموارد البشرية');

define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 465);
define('SMTP_USER', '');
define('SMTP_PASS', '');

define('SESSION_HOURS', 12);
date_default_timezone_set('Asia/Riyadh');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
