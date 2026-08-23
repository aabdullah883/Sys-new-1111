<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

$token = bearer_token();
if ($token) {
    $pdo = db_connect();
    $stmt = $pdo->prepare('DELETE FROM hr_sessions WHERE token = ?');
    $stmt->execute(array($token));
}
json_out(200, array('ok' => true));
