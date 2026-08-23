<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, array('error' => 'طريقة غير مسموحة'));

$body = read_json_body();
$id = isset($body['id']) ? $body['id'] : '';
$method = isset($body['method']) ? $body['method'] : '';
if ($id === '') json_out(400, array('error' => 'بيانات ناقصة'));

$pdo = db_connect();
$stmt = $pdo->query('SELECT data FROM hr_store WHERE id = 1');
$row = $stmt->fetch();
$db = $row && $row['data'] ? json_decode($row['data'], true) : null;

$emp = null;
if ($db && !empty($db['employees'])) {
    $key = normNum($id);
    foreach ($db['employees'] as $e) {
        if (normNum(isset($e['id']) ? $e['id'] : '') === $key
            || (!empty($e['iqama']) && normNum($e['iqama']) === $key)
            || (!empty($e['mobile']) && normNum($e['mobile']) === $key)) { $emp = $e; break; }
    }
}
if (!$emp || (isset($emp['active']) && $emp['active'] === false)) {
    json_out(404, array('error' => 'لا يوجد حساب بهذا الرقم'));
}

$maskMail = function ($m) {
    if (!$m) return '';
    $i = strpos($m, '@');
    if ($i === false || $i < 1) return '***';
    return mb_substr($m, 0, 2) . '***' . mb_substr($m, $i - 1);
};
$maskPhone = function ($p) {
    if (!$p) return '';
    return substr($p, 0, 3) . '****' . substr($p, -2);
};

$info = array(
    'ok' => true,
    'email' => $maskMail(isset($emp['email']) ? $emp['email'] : ''),
    'mobile' => $maskPhone(isset($emp['mobile']) ? $emp['mobile'] : ''),
    'hasEmail' => !empty($emp['email']),
    'hasMobile' => !empty($emp['mobile']),
);

if ($method !== 'email') json_out(200, array_merge($info, array('sent' => false)));
if (empty($emp['email'])) json_out(200, array_merge($info, array('sent' => false, 'reason' => 'لا يوجد بريد مسجل')));

$code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$stmt = $pdo->prepare('REPLACE INTO hr_reset_codes (emp_id, code, tries, expires_at) VALUES (?,?,0,DATE_ADD(NOW(), INTERVAL 15 MINUTE))');
$stmt->execute(array($emp['id'], $code));

require_once __DIR__ . '/../lib/mail.php';
$text = "رمز استعادة كلمة المرور الخاص بك هو: $code\n\nالرمز صالح لمدة 15 دقيقة. إذا لم تطلب ذلك تجاهل هذه الرسالة وأبلغ إدارة الموارد البشرية.";
$r = mail_send($emp['email'], 'رمز استعادة كلمة المرور', $text);

json_out(200, array_merge($info, array('sent' => (bool)$r['ok'], 'reason' => isset($r['reason']) ? $r['reason'] : '')));
