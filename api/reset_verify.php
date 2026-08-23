<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, array('error' => 'طريقة غير مسموحة'));

$body = read_json_body();
$id = isset($body['id']) ? $body['id'] : '';
$code = isset($body['code']) ? trim($body['code']) : '';
$pass = isset($body['pass']) ? $body['pass'] : '';
if ($id === '') json_out(400, array('error' => 'بيانات ناقصة'));

$pdo = db_connect();
$stmt = $pdo->query('SELECT version, data FROM hr_store WHERE id = 1');
$store = $stmt->fetch();
$db = $store && $store['data'] ? json_decode($store['data'], true) : null;
if (!$db || empty($db['employees'])) json_out(404, array('error' => 'حساب غير موجود'));

$key = normNum($id);
$empIndex = null;
foreach ($db['employees'] as $i => $e) {
    if (normNum(isset($e['id']) ? $e['id'] : '') === $key
        || (!empty($e['iqama']) && normNum($e['iqama']) === $key)
        || (!empty($e['mobile']) && normNum($e['mobile']) === $key)) { $empIndex = $i; break; }
}
if ($empIndex === null) json_out(404, array('error' => 'حساب غير موجود'));
$emp = $db['employees'][$empIndex];

$stmt = $pdo->prepare('SELECT * FROM hr_reset_codes WHERE emp_id = ? AND expires_at > NOW()');
$stmt->execute(array($emp['id']));
$rec = $stmt->fetch();
if (!$rec) json_out(400, array('error' => 'انتهت صلاحية الرمز، اطلب رمزاً جديداً'));

if ((int)$rec['tries'] >= 5) {
    $pdo->prepare('DELETE FROM hr_reset_codes WHERE emp_id = ?')->execute(array($emp['id']));
    json_out(429, array('error' => 'محاولات كثيرة، اطلب رمزاً جديداً'));
}
$pdo->prepare('UPDATE hr_reset_codes SET tries = tries + 1 WHERE emp_id = ?')->execute(array($emp['id']));

if ($code !== $rec['code']) json_out(400, array('error' => 'الرمز غير صحيح'));
if (strlen($pass) < 6) json_out(400, array('error' => 'كلمة المرور يجب ألا تقل عن 6 خانات'));

$pdo->prepare('DELETE FROM hr_reset_codes WHERE emp_id = ?')->execute(array($emp['id']));

$db['employees'][$empIndex]['pass'] = $pass;
$db['employees'][$empIndex]['mustChangePass'] = false;
$db['employees'][$empIndex]['passChangedAt'] = gmdate('Y-m-d\TH:i:s\Z');

$newVersion = (int)$store['version'] + 1;
$newJson = json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$pdo->prepare('UPDATE hr_store SET version = ?, data = ?, updated_at = NOW() WHERE id = 1')
    ->execute(array($newVersion, $newJson));

json_out(200, array('ok' => true));
