<?php
/**
 * مزامنة جداول التقارير (hr_employees / hr_requests / hr_attendance)
 * تُستدعى بعد كل حفظ ناجح لقاعدة البيانات الرئيسية لتبقى جاهزة لاستعلامات SQL مباشرة
 */
require_once __DIR__ . '/db.php';

function sync_mirror_tables($dbArr) {
    $pdo = db_connect();

    // ===== الموظفون =====
    if (isset($dbArr['employees']) && is_array($dbArr['employees'])) {
        $pdo->exec('TRUNCATE TABLE hr_employees');
        $stmt = $pdo->prepare(
            'INSERT INTO hr_employees
             (id,name,iqama,iqama_expiry,mobile,email,role,branch,dept,title,nationality,join_date,contract_end,salary,active,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())'
        );
        foreach ($dbArr['employees'] as $e) {
            $pay = isset($e['pay']) && is_array($e['pay']) ? $e['pay'] : array();
            $salary = isset($pay['basic']) ? $pay['basic'] : (isset($e['salary']) ? $e['salary'] : null);
            $stmt->execute(array(
                isset($e['id']) ? $e['id'] : '',
                isset($e['name']) ? $e['name'] : '',
                isset($e['iqama']) ? $e['iqama'] : null,
                !empty($e['iqamaExpiry']) ? $e['iqamaExpiry'] : null,
                isset($e['mobile']) ? $e['mobile'] : null,
                isset($e['email']) ? $e['email'] : null,
                isset($e['role']) ? $e['role'] : null,
                isset($e['branch']) ? $e['branch'] : null,
                isset($e['dept']) ? $e['dept'] : null,
                isset($e['title']) ? $e['title'] : null,
                isset($e['nationality']) ? $e['nationality'] : null,
                !empty($e['joinDate']) ? $e['joinDate'] : null,
                !empty($e['contractEnd']) ? $e['contractEnd'] : null,
                $salary,
                (isset($e['active']) && $e['active'] === false) ? 0 : 1,
            ));
        }
    }

    // ===== المعاملات =====
    if (isset($dbArr['requests']) && is_array($dbArr['requests'])) {
        $pdo->exec('TRUNCATE TABLE hr_requests');
        $empBranch = array();
        if (isset($dbArr['employees'])) {
            foreach ($dbArr['employees'] as $e) {
                if (isset($e['id'])) $empBranch[$e['id']] = isset($e['branch']) ? $e['branch'] : null;
            }
        }
        $stmt = $pdo->prepare(
            'INSERT INTO hr_requests
             (id,type,emp_id,emp_name,branch,status,stage,assignee,created_at,due_at,completed_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        );
        foreach ($dbArr['requests'] as $r) {
            $chain = isset($r['chain']) && is_array($r['chain']) ? $r['chain'] : array();
            $step = isset($r['step']) ? (int)$r['step'] : 0;
            $stage = isset($chain[$step]['role']) ? $chain[$step]['role'] : null;
            $empId = isset($r['empId']) ? $r['empId'] : '';
            $stmt->execute(array(
                isset($r['id']) ? $r['id'] : '',
                isset($r['type']) ? $r['type'] : null,
                $empId,
                null,
                isset($empBranch[$empId]) ? $empBranch[$empId] : null,
                isset($r['status']) ? $r['status'] : null,
                $stage,
                isset($r['assignee']) ? $r['assignee'] : null,
                !empty($r['createdAt']) ? str_replace('T', ' ', substr($r['createdAt'], 0, 19)) : null,
                !empty($r['dueAt']) ? $r['dueAt'] : null,
                !empty($r['completedAt']) ? str_replace('T', ' ', substr($r['completedAt'], 0, 19)) : null,
            ));
        }
    }

    // ===== الحضور والانصراف =====
    if (isset($dbArr['att']) && is_array($dbArr['att'])) {
        $pdo->exec('TRUNCATE TABLE hr_attendance');
        $stmt = $pdo->prepare('INSERT INTO hr_attendance (day, emp_id, check_in, check_out) VALUES (?,?,?,?)');
        foreach ($dbArr['att'] as $day => $rows) {
            if (!is_array($rows)) continue;
            foreach ($rows as $empId => $rec) {
                $stmt->execute(array(
                    $day,
                    $empId,
                    isset($rec['in']) ? $rec['in'] : null,
                    isset($rec['out']) ? $rec['out'] : null,
                ));
            }
        }
    }
}
