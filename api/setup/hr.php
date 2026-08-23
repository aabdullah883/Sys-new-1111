<?php
require_once __DIR__ . '/../../lib/helpers.php';
require_once __DIR__ . '/../../lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, array('error' => 'طريقة غير مسموحة'));

$pdo = db_connect();
$pdo->beginTransaction();
$stmt = $pdo->query('SELECT version, data FROM hr_store WHERE id = 1 FOR UPDATE');
$store = $stmt->fetch();
$db = $store && $store['data'] ? json_decode($store['data'], true) : null;
if (!$db || !isset($db['employees']) || !is_array($db['employees'])) {
    $pdo->rollBack();
    json_out(409, array('error' => 'setup_not_available'));
}
if (active_hr($db)) {
    $pdo->rollBack();
    json_out(409, array('error' => 'setup_not_available'));
}

$body = read_json_body();
$id = normNum(isset($body['id']) ? $body['id'] : '');
$name = trim(isset($body['name']) ? $body['name'] : '');
$password = isset($body['password']) ? (string)$body['password'] : '';
if (!preg_match('/^\d{4,20}$/', $id) || mb_strlen($name) < 3 || strlen($password) < 10
    || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    $pdo->rollBack();
    json_out(400, array('error' => 'invalid_setup'));
}

$index = null;
foreach ($db['employees'] as $i => $employee) {
    if (normNum(isset($employee['id']) ? $employee['id'] : '') === $id
        || normNum(isset($employee['iqama']) ? $employee['iqama'] : '') === $id) {
        $index = $i;
        break;
    }
}
$account = $index === null ? array() : $db['employees'][$index];
$account['id'] = $id;
if (empty($account['iqama'])) $account['iqama'] = $id;
$account['name'] = $name;
$account['pass'] = $password;
$account['role'] = 'hr';
$account['active'] = true;
$account['mustChangePass'] = false;
$account['superAdmin'] = true;
if ($index === null) $db['employees'][] = $account;
else $db['employees'][$index] = $account;

$version = (int)($store ? $store['version'] : 0) + 1;
$json = json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$upd = $pdo->prepare('UPDATE hr_store SET version = ?, data = ?, updated_at = NOW() WHERE id = 1');
$upd->execute(array($version, $json));
$pdo->commit();
json_out(200, array('ok' => true, 'version' => $version));
