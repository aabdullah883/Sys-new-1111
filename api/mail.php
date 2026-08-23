<?php
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/mail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, array('error' => 'طريقة غير مسموحة'));

$pdo = db_connect();
$token = bearer_token();
if (!$token) json_out(401, array('error' => 'غير مصرح'));
$stmt = $pdo->prepare('SELECT role FROM hr_sessions WHERE token = ? AND expires_at > NOW()');
$stmt->execute(array($token));
$sess = $stmt->fetch();
if (!$sess || ($sess['role'] !== 'hr' && $sess['role'] !== 'hr_staff')) json_out(403, array('error' => 'غير مصرح'));

$body = read_json_body();
$to = isset($body['to']) ? $body['to'] : '';
$subject = isset($body['subject']) ? $body['subject'] : '';
$text = isset($body['text']) ? $body['text'] : '';
if (!$to || !$subject) json_out(400, array('error' => 'بيانات ناقصة'));

$r = mail_send($to, $subject, $text);
json_out(200, array('ok' => true, 'sent' => (bool)$r['ok'], 'reason' => isset($r['reason']) ? $r['reason'] : ''));
