<?php
/**
 * إرسال البريد — طريقتان: PHP mail() المدمجة، أو SMTP مباشر (Gmail أو بريد الشركة)
 */
require_once __DIR__ . '/../config.php';

function mail_send($to, $subject, $text) {
    if (empty($to)) return array('ok' => false, 'reason' => 'لا يوجد بريد مسجّل');

    if (MAIL_METHOD === 'smtp' && SMTP_USER && SMTP_PASS) {
        return smtp_send($to, $subject, $text);
    }
    return phpmail_send($to, $subject, $text);
}

function phpmail_send($to, $subject, $text) {
    $headers = "From: " . mb_encode_mimeheader(MAIL_FROM_NAME, 'UTF-8') . " <" . MAIL_FROM . ">\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "Content-Transfer-Encoding: 8bit\r\n";
    $encSubject = mb_encode_mimeheader($subject, 'UTF-8');
    $ok = @mail($to, $encSubject, $text, $headers, '-f' . MAIL_FROM);
    return array('ok' => (bool)$ok, 'sent' => (bool)$ok, 'reason' => $ok ? '' : 'تعذر إرسال البريد عبر السيرفر (mail() غير مفعّلة)');
}

function smtp_send($to, $subject, $text) {
    $b64 = function ($t) { return base64_encode($t); };
    $encHeader = function ($t) use ($b64) { return '=?UTF-8?B?' . $b64($t) . '?='; };

    $msg = "From: " . $encHeader(MAIL_FROM_NAME) . " <" . MAIL_FROM . ">\r\n";
    $msg .= "To: " . $to . "\r\n";
    $msg .= "Subject: " . $encHeader($subject) . "\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $msg .= "Content-Transfer-Encoding: base64\r\n";
    $msg .= "Date: " . date('r') . "\r\n\r\n";
    $msg .= chunk_split($b64($text));

    $errno = 0; $errstr = '';
    $sock = @stream_socket_client(
        'ssl://' . SMTP_HOST . ':' . SMTP_PORT,
        $errno, $errstr, 15,
        STREAM_CLIENT_CONNECT,
        stream_context_create(array('ssl' => array('verify_peer' => true, 'verify_peer_name' => true)))
    );
    if (!$sock) return array('ok' => false, 'sent' => false, 'reason' => 'تعذر الاتصال بخادم البريد: ' . $errstr);

    stream_set_timeout($sock, 15);

    $read = function () use ($sock) {
        $data = '';
        while (!feof($sock)) {
            $line = fgets($sock, 515);
            if ($line === false) break;
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };
    $write = function ($t) use ($sock) { fwrite($sock, $t . "\r\n"); };

    $read();
    $write('EHLO hr-system'); $read();
    $write('AUTH LOGIN'); $read();
    $write(base64_encode(SMTP_USER)); $read();
    $write(base64_encode(SMTP_PASS));
    $authResp = $read();
    if (strpos($authResp, '235') !== 0 && strpos($authResp, '2') !== 0) {
        fclose($sock);
        return array('ok' => false, 'sent' => false, 'reason' => 'فشل تسجيل الدخول لخادم البريد');
    }
    $write('MAIL FROM:<' . MAIL_FROM . '>'); $read();
    $write('RCPT TO:<' . $to . '>'); $read();
    $write('DATA'); $read();
    $write($msg . "\r\n."); $read();
    $write('QUIT'); $read();
    fclose($sock);

    return array('ok' => true, 'sent' => true);
}
