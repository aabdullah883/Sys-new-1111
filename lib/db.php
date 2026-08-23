<?php
/**
 * الاتصال بقاعدة البيانات
 */
require_once __DIR__ . '/../config.php';

function db_connect() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ));
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array('error' => 'تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات config.php'), JSON_UNESCAPED_UNICODE);
        exit;
    }
    return $pdo;
}
