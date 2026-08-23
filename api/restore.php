<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, array('error' => 'طريقة غير مسموحة'));
$pdo = db_connect();
$session = require_session($pdo, array('hr'));
$input = read_json_body();
$restored = isset($input['store']) && is_array($input['store']) ? $input['store'] : $input;
$db = isset($restored['db']) ? $restored['db'] : null;
if (!is_array($db) || !isset($db['employees']) || !is_array($db['employees'])) {
    json_out(400, array('error' => 'invalid_backup'));
}

$pdo->beginTransaction();
$stmt = $pdo->query('SELECT version, data FROM hr_store WHERE id = 1 FOR UPDATE');
$current = $stmt->fetch();
$currentDb = $current && $current['data'] ? json_decode($current['data'], true) : null;
$db = protect_super_admin($currentDb, $db);
$currentVersion = (int)($current ? $current['version'] : 0);
$restoredVersion = isset($restored['version']) ? (int)$restored['version'] : 0;
$version = max($currentVersion, $restoredVersion) + 1;
$json = json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$backup = $pdo->prepare('INSERT INTO hr_backups (at, version, data) VALUES (NOW(), ?, ?)');
$backup->execute(array($currentVersion, $current && $current['data'] ? $current['data'] : null));
$update = $pdo->prepare('UPDATE hr_store SET version = ?, data = ?, updated_at = NOW() WHERE id = 1');
$update->execute(array($version, $json));
$pdo->commit();
try { require_once __DIR__ . '/../lib/mirror.php'; sync_mirror_tables($db); } catch (Throwable $e) { /* لا تفشل الاستعادة بسبب جداول التقارير */ }
json_out(200, array('ok' => true, 'version' => $version));
