<?php
// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, COPY, RENAME, MKDIR, RMDIR, CHMOD, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Path, X-Destination, X-Permissions, X-New-Name');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Get credentials from query parameters
$username = $_GET['username'] ?? '';
$password = $_GET['password'] ?? '';
$hostname = $_GET['hostname'] ?? '';
$port = isset($_GET['port']) && $_GET['port'] !== '' ? (int)$_GET['port'] : 21;

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'username and password are required']);
    exit;
}

// If hostname is not provided, extract from username
if (empty($hostname)) {
    $parts = explode('@', $username);
    if (count($parts) >= 2) {
        $domain = end($parts);
        $ip = gethostbyname($domain);
        if ($ip !== $domain) {
            $ptr = gethostbyaddr($ip);
            if ($ptr !== false && $ptr !== $ip) {
                $hostname = $ptr;
            } else {
                $hostname = $domain;
            }
        } else {
            $hostname = $domain;
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'hostname is required or username must contain @domain']);
        exit;
    }
}

// Connect to FTP
$conn = @ftp_connect($hostname, $port);
if (!$conn) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to connect to FTP server: ' . $hostname . ':' . $port]);
    exit;
}

$login = @ftp_login($conn, $username, $password);
if (!$login) {
    ftp_close($conn);
    http_response_code(401);
    echo json_encode(['error' => 'FTP login failed']);
    exit;
}

@ftp_pasv($conn, true);

$method = $_SERVER['REQUEST_METHOD'];
$path = isset($_SERVER['HTTP_X_PATH']) ? $_SERVER['HTTP_X_PATH'] : ($_GET['path'] ?? '/');

try {
    switch ($method) {
        case 'GET':
            handleGet($conn, $path);
            break;
        case 'POST':
        case 'PUT':
            handleUpload($conn, $path);
            break;
        case 'DELETE':
            handleDelete($conn, $path);
            break;
        case 'MKDIR':
            handleMkdir($conn, $path);
            break;
        case 'RMDIR':
            handleRmdir($conn, $path);
            break;
        case 'CHMOD':
            handleChmod($conn, $path);
            break;
        case 'COPY':
            handleCopy($conn, $path);
            break;
        case 'RENAME':
            handleRename($conn, $path);
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

ftp_close($conn);

// --- Handler Functions ---

function handleGet($conn, $path) {
    // Check if it's a file download request
    if (isset($_GET['download']) && $_GET['download'] === '1') {
        downloadFile($conn, $path);
        return;
    }

    // Check if it's a file read request
    if (isset($_GET['read']) && $_GET['read'] === '1') {
        ftpReadFile($conn, $path);
        return;
    }

    // List directory
    listDirectory($conn, $path);
}

function listDirectory($conn, $path) {
    $rawList = @ftp_rawlist($conn, $path);
    if ($rawList === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to list directory: ' . $path]);
        return;
    }

    $items = [];
    foreach ($rawList as $line) {
        $parsed = parseRawListLine($line);
        if ($parsed && $parsed['name'] !== '.' && $parsed['name'] !== '..') {
            $items[] = $parsed;
        }
    }

    echo json_encode(['path' => $path, 'items' => $items]);
}

function parseRawListLine($line) {
    // Unix-style: drwxr-xr-x 2 user group 4096 Jan 01 12:00 dirname
    $regex = '/^([drwxlsStT\-]{10})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/';
    if (preg_match($regex, $line, $matches)) {
        $permissions = $matches[1];
        $isDir = ($permissions[0] === 'd');
        $isLink = ($permissions[0] === 'l');
        $name = $matches[7];

        // Handle symbolic links
        if ($isLink && strpos($name, ' -> ') !== false) {
            $parts = explode(' -> ', $name, 2);
            $name = $parts[0];
        }

        return [
            'name' => $name,
            'type' => $isDir ? 'directory' : ($isLink ? 'link' : 'file'),
            'permissions' => $permissions,
            'owner' => $matches[3],
            'group' => $matches[4],
            'size' => (int)$matches[5],
            'date' => $matches[6],
        ];
    }
    return null;
}

function downloadFile($conn, $path) {
    $tmpFile = tempnam(sys_get_temp_dir(), 'ftp_');
    $result = @ftp_get($conn, $tmpFile, $path, FTP_BINARY);
    if (!$result) {
        @unlink($tmpFile);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to download file: ' . $path]);
        return;
    }

    $filename = basename($path);
    $mime = mime_content_type($tmpFile) ?: 'application/octet-stream';

    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($tmpFile));
    readfile($tmpFile);
    @unlink($tmpFile);
    exit;
}

function ftpReadFile($conn, $path) {
    $tmpFile = tempnam(sys_get_temp_dir(), 'ftp_');
    $result = @ftp_get($conn, $tmpFile, $path, FTP_BINARY);
    if (!$result) {
        @unlink($tmpFile);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to read file: ' . $path]);
        return;
    }

    $content = file_get_contents($tmpFile);
    @unlink($tmpFile);
    echo json_encode(['path' => $path, 'content' => $content]);
}

function handleUpload($conn, $path) {
    // Handle multipart file upload
    if (!empty($_FILES)) {
        $results = [];
        foreach ($_FILES as $file) {
            if (is_array($file['name'])) {
                for ($i = 0; $i < count($file['name']); $i++) {
                    $remotePath = rtrim($path, '/') . '/' . $file['name'][$i];
                    $result = @ftp_put($conn, $remotePath, $file['tmp_name'][$i], FTP_BINARY);
                    $results[] = [
                        'name' => $file['name'][$i],
                        'success' => $result,
                    ];
                }
            } else {
                $remotePath = rtrim($path, '/') . '/' . $file['name'];
                $result = @ftp_put($conn, $remotePath, $file['tmp_name'], FTP_BINARY);
                $results[] = [
                    'name' => $file['name'],
                    'success' => $result,
                ];
            }
        }
        echo json_encode(['results' => $results]);
        return;
    }

    // Handle raw body upload (for file editing/saving)
    $body = file_get_contents('php://input');
    $tmpFile = tempnam(sys_get_temp_dir(), 'ftp_');
    file_put_contents($tmpFile, $body);
    $result = @ftp_put($conn, $path, $tmpFile, FTP_BINARY);
    @unlink($tmpFile);

    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to upload file: ' . $path]);
        return;
    }

    echo json_encode(['success' => true, 'path' => $path]);
}

function handleDelete($conn, $path) {
    $result = @ftp_delete($conn, $path);
    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete file: ' . $path]);
        return;
    }
    echo json_encode(['success' => true]);
}

function handleMkdir($conn, $path) {
    $result = @ftp_mkdir($conn, $path);
    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create directory: ' . $path]);
        return;
    }
    echo json_encode(['success' => true, 'path' => $result]);
}

function handleRmdir($conn, $path) {
    // Recursively remove directory
    if (!removeDirectory($conn, $path)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to remove directory: ' . $path]);
        return;
    }
    echo json_encode(['success' => true]);
}

function removeDirectory($conn, $path) {
    $list = @ftp_rawlist($conn, $path);
    if ($list) {
        foreach ($list as $line) {
            $parsed = parseRawListLine($line);
            if ($parsed && $parsed['name'] !== '.' && $parsed['name'] !== '..') {
                $fullPath = rtrim($path, '/') . '/' . $parsed['name'];
                if ($parsed['type'] === 'directory') {
                    removeDirectory($conn, $fullPath);
                } else {
                    @ftp_delete($conn, $fullPath);
                }
            }
        }
    }
    return @ftp_rmdir($conn, $path);
}

function handleChmod($conn, $path) {
    $permissions = isset($_SERVER['HTTP_X_PERMISSIONS']) ? $_SERVER['HTTP_X_PERMISSIONS'] : ($_GET['permissions'] ?? '');
    if (empty($permissions)) {
        http_response_code(400);
        echo json_encode(['error' => 'permissions parameter is required']);
        return;
    }

    $mode = octdec($permissions);
    $result = @ftp_chmod($conn, $mode, $path);
    if ($result === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to change permissions: ' . $path]);
        return;
    }
    echo json_encode(['success' => true, 'permissions' => decoct($result)]);
}

function handleCopy($conn, $path) {
    $destination = isset($_SERVER['HTTP_X_DESTINATION']) ? $_SERVER['HTTP_X_DESTINATION'] : '';
    if (empty($destination)) {
        http_response_code(400);
        echo json_encode(['error' => 'X-Destination header is required']);
        return;
    }

    // FTP doesn't have native copy, so download then upload
    $tmpFile = tempnam(sys_get_temp_dir(), 'ftp_');
    $result = @ftp_get($conn, $tmpFile, $path, FTP_BINARY);
    if (!$result) {
        @unlink($tmpFile);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to read source file: ' . $path]);
        return;
    }

    $result = @ftp_put($conn, $destination, $tmpFile, FTP_BINARY);
    @unlink($tmpFile);
    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to copy file to: ' . $destination]);
        return;
    }

    echo json_encode(['success' => true, 'source' => $path, 'destination' => $destination]);
}

function handleRename($conn, $path) {
    $newName = isset($_SERVER['HTTP_X_NEW_NAME']) ? $_SERVER['HTTP_X_NEW_NAME'] : '';
    if (empty($newName)) {
        http_response_code(400);
        echo json_encode(['error' => 'X-New-Name header is required']);
        return;
    }

    $dir = dirname($path);
    $newPath = rtrim($dir, '/') . '/' . $newName;

    $result = @ftp_rename($conn, $path, $newPath);
    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to rename: ' . $path]);
        return;
    }

    echo json_encode(['success' => true, 'oldPath' => $path, 'newPath' => $newPath]);
}
