<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

$pdo = db_connect();
$token = bearer_token();
if (!$token) json_out(403, array('error' => 'غير مصرح'));
$stmt = $pdo->prepare('SELECT role FROM hr_sessions WHERE token = ? AND expires_at > NOW()');
$stmt->execute(array($token));
$sess = $stmt->fetch();
if (!$sess || $sess['role'] !== 'hr') json_out(403, array('error' => 'غير مصرح'));

json_out(200, array('count' => 0, 'files' => array(), 'note' => 'يُرسل البريد مباشرة عبر PHP، لا يوجد صندوق صادر محلي.'));
