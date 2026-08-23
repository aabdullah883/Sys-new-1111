<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/mirror.php';

function session_row($pdo) {
    $token = bearer_token();
    if (!$token) return null;
    $stmt = $pdo->prepare('SELECT * FROM hr_sessions WHERE token = ? AND expires_at > NOW()');
    $stmt->execute(array($token));
    $row = $stmt->fetch();
    return $row ?: null;
}

$pdo = db_connect();
$stmt = $pdo->query('SELECT version, data, updated_at FROM hr_store WHERE id = 1');
$store = $stmt->fetch();
$initialized = !empty($store['data']);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if ($initialized) {
        $sess = session_row($pdo);
        if (!$sess) json_out(401, array('error' => 'غير مصرح'));
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $dbJson = $store && $store['data'] ? $store['data'] : 'null';
    echo '{"version":' . (int)($store ? $store['version'] : 0) . ',"db":' . $dbJson . ',"updatedAt":' . json_encode($store ? $store['updated_at'] : null) . '}';
    exit;
}

if ($method === 'PUT') {
    if ($initialized) {
        $sess = session_row($pdo);
        if (!$sess) json_out(401, array('error' => 'غير مصرح'));
    }
    $raw = read_raw_body();
    $body = json_decode($raw, true);
    if (!$body || !isset($body['db'])) json_out(400, array('error' => 'بيانات ناقصة'));

    $curVersion = (int)($store ? $store['version'] : 0);
    if ($initialized && isset($body['version']) && (int)$body['version'] !== $curVersion) {
        json_out(409, array('error' => 'النسخة قديمة', 'version' => $curVersion));
    }

    $nextDb = protect_super_admin($store && $store['data'] ? json_decode($store['data'], true) : null, $body['db']);
    $newVersion = $curVersion + 1;
    $dbJsonToStore = json_encode($nextDb, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $upd = $pdo->prepare('UPDATE hr_store SET version = ?, data = ?, updated_at = NOW() WHERE id = 1');
    $upd->execute(array($newVersion, $dbJsonToStore));

    // نسخة احتياطية كل 6 ساعات (لا توقف الاستجابة عند حدوث خطأ فيها)
    try {
        $chk = $pdo->query("SELECT COUNT(*) c FROM hr_backups WHERE at > DATE_SUB(NOW(), INTERVAL 6 HOUR)");
        if ((int)$chk->fetch()['c'] === 0) {
            $bk = $pdo->prepare('INSERT INTO hr_backups (at, version, data) VALUES (NOW(), ?, ?)');
            $bk->execute(array($newVersion, $dbJsonToStore));
            $pdo->exec("DELETE FROM hr_backups WHERE at < DATE_SUB(NOW(), INTERVAL 15 DAY)");
        }
    } catch (Throwable $e) { /* تجاهل */ }

    // مزامنة جداول التقارير (لا توقف الاستجابة عند حدوث خطأ فيها)
    try { sync_mirror_tables($nextDb); } catch (Throwable $e) { /* تجاهل */ }

    json_out(200, array('ok' => true, 'version' => $newVersion));
}

json_out(405, array('error' => 'طريقة غير مسموحة'));
