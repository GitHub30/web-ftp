const PROD_ENDPOINT = 'https://xs679698.xsrv.jp/web-ftp/ftp.php';

function getBaseUrl() {
  if (import.meta.env.DEV) {
    return '/ftp.php';
  }
  return PROD_ENDPOINT;
}

function buildUrl(params, extra = {}) {
  const url = new URL(getBaseUrl(), window.location.origin);
  url.searchParams.set('username', params.username);
  url.searchParams.set('password', params.password);
  if (params.hostname) {
    url.searchParams.set('hostname', params.hostname);
  }
  if (params.port) {
    url.searchParams.set('port', params.port);
  }
  Object.entries(extra).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });
  return url.toString();
}

export async function listDirectory(credentials, path = '/') {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to list directory');
  }
  return res.json();
}

export async function downloadFile(credentials, path) {
  const url = buildUrl(credentials, { path, download: '1' });
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to download file');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = path.split('/').pop();
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readFile(credentials, path) {
  const url = buildUrl(credentials, { path, read: '1' });
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to read file');
  return res.json();
}

export async function uploadFiles(credentials, path, files) {
  const url = buildUrl(credentials, { path });
  const formData = new FormData();
  for (const file of files) {
    formData.append('files[]', file);
  }
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Failed to upload files');
  return res.json();
}

export async function saveFile(credentials, path, content) {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: content,
  });
  if (!res.ok) throw new Error('Failed to save file');
  return res.json();
}

export async function deleteFile(credentials, path) {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete file');
  return res.json();
}

export async function createDirectory(credentials, path) {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url, { method: 'MKDIR' });
  if (!res.ok) throw new Error('Failed to create directory');
  return res.json();
}

export async function removeDirectory(credentials, path) {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url, { method: 'RMDIR' });
  if (!res.ok) throw new Error('Failed to remove directory');
  return res.json();
}

export async function changePermissions(credentials, path, permissions) {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url, {
    method: 'CHMOD',
    headers: { 'X-Permissions': permissions },
  });
  if (!res.ok) throw new Error('Failed to change permissions');
  return res.json();
}

export async function copyFile(credentials, source, destination) {
  const url = buildUrl(credentials, { path: source });
  const res = await fetch(url, {
    method: 'COPY',
    headers: { 'X-Destination': destination },
  });
  if (!res.ok) throw new Error('Failed to copy file');
  return res.json();
}

export async function renameFile(credentials, path, newName) {
  const url = buildUrl(credentials, { path });
  const res = await fetch(url, {
    method: 'RENAME',
    headers: { 'X-New-Name': newName },
  });
  if (!res.ok) throw new Error('Failed to rename file');
  return res.json();
}

export async function testConnection(credentials) {
  return listDirectory(credentials, '/');
}
