<?php
/**
 * دوال مساعدة عامة
 */

// حماية: يمنع أي تحذير/إشعار PHP عرضي من إفساد رد JSON
ob_start();
ini_set('display_errors', '0');
error_reporting(E_ALL);


function normNum($v) {
    static $map = array(
        '٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9',
        '۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9',
    );
    $s = (string)$v;
    $s = strtr($s, $map);
    $s = preg_replace('/[\x{200f}\x{200e}]/u', '', $s);
    $s = preg_replace('/[\s\-]+/u', '', $s);
    return trim($s);
}

function json_out($code, $data) {
    // تفريغ أي مخرجات سابقة (تحذيرات/إشعارات PHP) قبل إرسال JSON نظيف
    while (ob_get_level() > 0) { ob_end_clean(); }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body() {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return array();
    $data = json_decode($raw, true);
    return is_array($data) ? $data : array();
}

function read_raw_body() {
    $raw = file_get_contents('php://input');
    return $raw === false ? '' : $raw;
}

function bearer_token() {
    if (!empty($_SERVER['HTTP_X_AUTH'])) return trim($_SERVER['HTTP_X_AUTH']);
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if ($headers) {
            foreach ($headers as $k => $v) {
                if (strtolower($k) === 'x-auth') return trim($v);
            }
        }
    }
    return '';
}

function client_ip() {
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
}

function require_session($pdo, $roles = null) {
    $token = bearer_token();
    if (!$token) json_out(401, array('error' => 'غير مصرح'));
    $stmt = $pdo->prepare('SELECT * FROM hr_sessions WHERE token = ? AND expires_at > NOW()');
    $stmt->execute(array($token));
    $session = $stmt->fetch();
    if (!$session) json_out(401, array('error' => 'غير مصرح'));
    if (is_array($roles) && !in_array($session['role'], $roles, true)) {
        json_out(403, array('error' => 'غير مصرح'));
    }
    return $session;
}

function active_hr($db) {
    if (!is_array($db) || empty($db['employees']) || !is_array($db['employees'])) return null;
    foreach ($db['employees'] as $employee) {
        if (isset($employee['role']) && $employee['role'] === 'hr'
            && (!isset($employee['active']) || $employee['active'] !== false)) return $employee;
    }
    return null;
}

/** يحافظ على حساب مدير HR النشط عند حفظ أو استعادة بيانات كاملة. */
function protect_super_admin($previous, $next) {
    if (!is_array($next)) return $next;
    $protected = active_hr($previous);
    if (!$protected) return $next;
    if (!isset($next['employees']) || !is_array($next['employees'])) $next['employees'] = array();
    $found = false;
    foreach ($next['employees'] as $i => $employee) {
        if (isset($employee['id']) && (string)$employee['id'] === (string)$protected['id']) {
            $next['employees'][$i]['id'] = $protected['id'];
            $next['employees'][$i]['pass'] = $protected['pass'];
            $next['employees'][$i]['role'] = 'hr';
            $next['employees'][$i]['active'] = true;
            $next['employees'][$i]['superAdmin'] = true;
            $found = true;
            break;
        }
    }
    if (!$found) $next['employees'][] = $protected;
    return $next;
}
