<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

$pdo = db_connect();

$stmt = $pdo->query('SELECT COUNT(*) c FROM hr_store WHERE id = 1 AND data IS NOT NULL');
$initialized = (int)$stmt->fetch()['c'] > 0;

if ($initialized) {
    $token = bearer_token();
    $ok = false;
    if ($token) {
        $s = $pdo->prepare('SELECT token FROM hr_sessions WHERE token = ? AND expires_at > NOW()');
        $s->execute(array($token));
        $ok = (bool)$s->fetch();
    }
    if (!$ok) json_out(401, array('error' => 'غير مصرح'));
}

$key = isset($_GET['key']) ? $_GET['key'] : '';
if ($key === '') json_out(400, array('error' => 'مفتاح مفقود'));
if (strlen($key) > 191) json_out(400, array('error' => 'المفتاح طويل جداً'));

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT v FROM hr_kv WHERE k = ?');
    $stmt->execute(array($key));
    $row = $stmt->fetch();
    $val = $row ? json_decode($row['v'], true) : null;
    json_out(200, array('key' => $key, 'value' => $val));
}

if ($method === 'PUT') {
    $body = read_json_body();
    $value = isset($body['value']) ? $body['value'] : null;
    if ($value === null) {
        $stmt = $pdo->prepare('DELETE FROM hr_kv WHERE k = ?');
        $stmt->execute(array($key));
        json_out(200, array('ok' => true));
    }
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $stmt = $pdo->prepare('INSERT INTO hr_kv (k, v, updated_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = NOW()');
    $stmt->execute(array($key, $json));
    json_out(200, array('ok' => true));
}

if ($method === 'DELETE') {
    $stmt = $pdo->prepare('DELETE FROM hr_kv WHERE k = ?');
    $stmt->execute(array($key));
    json_out(200, array('ok' => true, 'deleted' => true));
}

json_out(405, array('error' => 'طريقة غير مسموحة'));
