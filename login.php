<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, array('error' => 'طريقة غير مسموحة'));

$body = read_json_body();
$id = isset($body['id']) ? $body['id'] : '';
$pass = isset($body['pass']) ? $body['pass'] : '';
if ($id === '') json_out(400, array('error' => 'أدخل رقم الهوية أو الرقم الوظيفي'));

$pdo = db_connect();
$ip = client_ip();

$stmt = $pdo->prepare("SELECT COUNT(*) c FROM hr_audit WHERE action='login_fail' AND ip=? AND at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
$stmt->execute(array($ip));
$fails = (int)$stmt->fetch()['c'];
if ($fails >= 15) json_out(429, array('error' => 'محاولات كثيرة، انتظر 15 دقيقة'));

$stmt = $pdo->query('SELECT data FROM hr_store WHERE id = 1');
$row = $stmt->fetch();
$data = $row ? $row['data'] : null;

$emp = null;
if ($data) {
    $db = json_decode($data, true);
    if ($db && !empty($db['employees'])) {
        $key = normNum($id);
        foreach ($db['employees'] as $e) {
            if (normNum(isset($e['id']) ? $e['id'] : '') === $key) { $emp = $e; break; }
            if (!empty($e['iqama']) && normNum($e['iqama']) === $key) { $emp = $e; break; }
            if (!empty($e['mobile']) && normNum($e['mobile']) === $key) { $emp = $e; break; }
        }
    }
}

$passOk = $emp && isset($emp['pass']) && $emp['pass'] === $pass;
$isActive = !$emp || !isset($emp['active']) || $emp['active'] !== false;

if (!$emp || !$passOk || !$isActive) {
    $stmt = $pdo->prepare('INSERT INTO hr_audit (at, emp_id, action, details, ip) VALUES (NOW(), ?, ?, ?, ?)');
    $stmt->execute(array($id, 'login_fail', 'محاولة دخول فاشلة', $ip));
    json_out(401, array('error' => 'بيانات الدخول غير صحيحة'));
}

$token = bin2hex(random_bytes(24));
$stmt = $pdo->prepare(
    'INSERT INTO hr_sessions (token, emp_id, emp_name, role, created_at, expires_at)
     VALUES (?,?,?,?,NOW(), DATE_ADD(NOW(), INTERVAL ' . SESSION_HOURS . ' HOUR))'
);
$stmt->execute(array($token, $emp['id'], isset($emp['name']) ? $emp['name'] : '', isset($emp['role']) ? $emp['role'] : ''));

$stmt = $pdo->prepare('INSERT INTO hr_audit (at, emp_id, emp_name, action, details, ip) VALUES (NOW(), ?, ?, ?, ?, ?)');
$stmt->execute(array($emp['id'], isset($emp['name']) ? $emp['name'] : '', 'login', 'دخول ناجح', $ip));

json_out(200, array(
    'token' => $token,
    'id' => $emp['id'],
    'role' => isset($emp['role']) ? $emp['role'] : '',
    'name' => isset($emp['name']) ? $emp['name'] : '',
));
