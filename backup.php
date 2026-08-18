<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

$pdo = db_connect();
$token = bearer_token();
if (!$token) json_out(403, array('error' => 'غير مصرح'));
$stmt = $pdo->prepare('SELECT role FROM hr_sessions WHERE token = ? AND expires_at > NOW()');
$stmt->execute(array($token));
$sess = $stmt->fetch();
if (!$sess || ($sess['role'] !== 'hr' && $sess['role'] !== 'gm')) json_out(403, array('error' => 'غير مصرح'));

$stmt = $pdo->query('SELECT version, data FROM hr_store WHERE id = 1');
$row = $stmt->fetch();

header('Content-Type: application/json; charset=utf-8');
echo '{"exportedAt":' . json_encode(gmdate('c')) . ',"version":' . (int)($row ? $row['version'] : 0) . ',"db":' . ($row && $row['data'] ? $row['data'] : 'null') . '}';
