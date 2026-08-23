<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';

$pdo = db_connect();
$stmt = $pdo->query('SELECT version, data, updated_at FROM hr_store WHERE id = 1');
$row = $stmt->fetch();

json_out(200, array(
    'ok' => true,
    'initialized' => !empty($row['data']),
    'version' => $row ? (int)$row['version'] : 0,
    'updatedAt' => $row ? $row['updated_at'] : null,
));
