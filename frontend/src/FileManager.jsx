import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import './FileManager.css';

function formatSize(bytes) {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function getFileIcon(item) {
  if (item.type === 'directory') return '📁';
  const ext = item.name.split('.').pop().toLowerCase();
  const icons = {
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
    pdf: '📄', doc: '📝', docx: '📝', txt: '📝', md: '📝',
    js: '📜', jsx: '📜', ts: '📜', tsx: '📜', py: '📜', php: '📜', rb: '📜',
    html: '🌐', css: '🎨', json: '📋', xml: '📋', yml: '📋', yaml: '📋',
    zip: '📦', tar: '📦', gz: '📦', rar: '📦',
    mp3: '🎵', wav: '🎵', mp4: '🎬', avi: '🎬', mov: '🎬',
  };
  return icons[ext] || '📄';
}

function isTextFile(name) {
  const ext = name.split('.').pop().toLowerCase();
  const textExts = [
    'txt', 'md', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx',
    'json', 'xml', 'yml', 'yaml', 'php', 'py', 'rb', 'java', 'c', 'h',
    'cpp', 'cs', 'go', 'rs', 'sh', 'bash', 'sql', 'conf', 'cfg', 'ini',
    'log', 'env', 'gitignore', 'htaccess', 'csv', 'svg',
  ];
  return textExts.includes(ext) || !name.includes('.');
}

// Toast component
function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return <div className="toast">{message}</div>;
}

// Context menu
function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  return (
    <div className="context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="context-menu-sep" />;
        return (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => { item.onClick(); onClose(); }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Modal
function Modal({ title, children, onClose, actions }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onClose}>キャンセル</button>
          {actions}
        </div>
      </div>
    </div>
  );
}

// Tree Item
function TreeItem({ item, path, currentPath, onNavigate, credentials, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const fullPath = path === '/' ? '/' + item.name : path + '/' + item.name;
  const isActive = currentPath === fullPath;

  const toggle = async (e) => {
    e.stopPropagation();
    if (!expanded && children.length === 0) {
      try {
        const data = await api.listDirectory(credentials, fullPath);
        setChildren(data.items.filter((i) => i.type === 'directory'));
      } catch { /* ignore */ }
    }
    setExpanded(!expanded);
  };

  return (
    <>
      <div
        className={`tree-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onNavigate(fullPath)}
      >
        <span className={`tree-toggle ${expanded ? 'open' : ''}`} onClick={toggle}>▶</span>
        <span className="tree-icon">📁</span>
        <span className="tree-name">{item.name}</span>
      </div>
      {expanded && children.map((child) => (
        <TreeItem
          key={child.name}
          item={child}
          path={fullPath}
          currentPath={currentPath}
          onNavigate={onNavigate}
          credentials={credentials}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

export default function FileManager({ credentials, onLogout }) {
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState([]);
  const [rootDirs, setRootDirs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = useCallback((msg) => setToast(msg), []);

  const loadDirectory = useCallback(async (path) => {
    setLoading(true);
    try {
      const data = await api.listDirectory(credentials, path);
      setItems(data.items);
      setSelected(null);

      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('path', path);
      window.history.replaceState({}, '', url);
    } catch (err) {
      showToast('エラー: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [credentials, showToast]);

  const loadRootDirs = useCallback(async () => {
    try {
      const data = await api.listDirectory(credentials, '/');
      setRootDirs(data.items.filter((i) => i.type === 'directory'));
    } catch { /* ignore */ }
  }, [credentials]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const path = url.searchParams.get('path') || '/';
    setCurrentPath(path);
    loadDirectory(path);
    loadRootDirs();
  }, [loadDirectory, loadRootDirs]);

  const navigate = (path) => {
    setCurrentPath(path);
    loadDirectory(path);
  };

  const refresh = () => loadDirectory(currentPath);

  // Breadcrumb
  const breadcrumbs = currentPath.split('/').filter(Boolean);

  // File operations
  const handleUpload = async (files) => {
    try {
      await api.uploadFiles(credentials, currentPath, files);
      showToast('アップロード完了');
      refresh();
    } catch (err) {
      showToast('アップロード失敗: ' + err.message);
    }
  };

  const handleDelete = async (item) => {
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    if (!confirm(`"${item.name}" を削除しますか？`)) return;
    try {
      if (item.type === 'directory') {
        await api.removeDirectory(credentials, fullPath);
      } else {
        await api.deleteFile(credentials, fullPath);
      }
      showToast('削除しました');
      refresh();
    } catch (err) {
      showToast('削除失敗: ' + err.message);
    }
  };

  const handleRename = (item) => {
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    setModal({
      type: 'rename',
      title: '名前を変更',
      value: item.name,
      onSubmit: async (newName) => {
        try {
          await api.renameFile(credentials, fullPath, newName);
          showToast('名前を変更しました');
          setModal(null);
          refresh();
        } catch (err) {
          showToast('名前変更失敗: ' + err.message);
        }
      },
    });
  };

  const handleCopy = (item) => {
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    const ext = item.name.includes('.') ? '.' + item.name.split('.').pop() : '';
    const baseName = item.name.includes('.') ? item.name.slice(0, -ext.length) : item.name;
    const destPath = currentPath === '/'
      ? '/' + baseName + '_copy' + ext
      : currentPath + '/' + baseName + '_copy' + ext;
    setModal({
      type: 'copy',
      title: 'コピー',
      value: destPath,
      onSubmit: async (dest) => {
        try {
          await api.copyFile(credentials, fullPath, dest);
          showToast('コピーしました');
          setModal(null);
          refresh();
        } catch (err) {
          showToast('コピー失敗: ' + err.message);
        }
      },
    });
  };

  const handleChmod = (item) => {
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    const currentPerms = permissionsToOctal(item.permissions);
    setModal({
      type: 'chmod',
      title: 'パーミッション変更',
      value: currentPerms,
      onSubmit: async (perms) => {
        try {
          await api.changePermissions(credentials, fullPath, perms);
          showToast('パーミッションを変更しました');
          setModal(null);
          refresh();
        } catch (err) {
          showToast('パーミッション変更失敗: ' + err.message);
        }
      },
    });
  };

  const handleEdit = async (item) => {
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    try {
      const data = await api.readFile(credentials, fullPath);
      setModal({
        type: 'edit',
        title: item.name + ' を編集',
        value: data.content,
        path: fullPath,
        onSubmit: async (content) => {
          try {
            await api.saveFile(credentials, fullPath, content);
            showToast('保存しました');
            setModal(null);
            refresh();
          } catch (err) {
            showToast('保存失敗: ' + err.message);
          }
        },
      });
    } catch (err) {
      showToast('ファイル読み込み失敗: ' + err.message);
    }
  };

  const handleDownload = (item) => {
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    api.downloadFile(credentials, fullPath);
  };

  const handleCreateDir = () => {
    setNewMenuOpen(false);
    setModal({
      type: 'mkdir',
      title: '新しいフォルダ',
      value: '',
      onSubmit: async (name) => {
        const fullPath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
        try {
          await api.createDirectory(credentials, fullPath);
          showToast('フォルダを作成しました');
          setModal(null);
          refresh();
          loadRootDirs();
        } catch (err) {
          showToast('フォルダ作成失敗: ' + err.message);
        }
      },
    });
  };

  const handleCreateFile = () => {
    setNewMenuOpen(false);
    setModal({
      type: 'newfile',
      title: '新しいファイル',
      value: '',
      content: '',
      onSubmit: async (name, content) => {
        const fullPath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
        try {
          await api.saveFile(credentials, fullPath, content || '');
          showToast('ファイルを作成しました');
          setModal(null);
          refresh();
        } catch (err) {
          showToast('ファイル作成失敗: ' + err.message);
        }
      },
    });
  };

  // Double-click handler
  const handleDoubleClick = (item) => {
    if (item.type === 'directory') {
      const newPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
      navigate(newPath);
    } else if (isTextFile(item.name)) {
      handleEdit(item);
    } else {
      handleDownload(item);
    }
  };

  // Context menu handler
  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setSelected(item.name);
    const menuItems = [];

    if (item.type === 'directory') {
      menuItems.push({ icon: '📂', label: '開く', onClick: () => {
        const p = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
        navigate(p);
      }});
    } else {
      menuItems.push({ icon: '⬇️', label: 'ダウンロード', onClick: () => handleDownload(item) });
      if (isTextFile(item.name)) {
        menuItems.push({ icon: '✏️', label: '編集', onClick: () => handleEdit(item) });
      }
    }

    menuItems.push({ separator: true });
    menuItems.push({ icon: '✂️', label: '名前を変更', onClick: () => handleRename(item) });
    if (item.type === 'file') {
      menuItems.push({ icon: '📋', label: 'コピー', onClick: () => handleCopy(item) });
    }
    menuItems.push({ icon: '🔒', label: 'パーミッション変更', onClick: () => handleChmod(item) });
    menuItems.push({ separator: true });
    menuItems.push({ icon: '🗑️', label: '削除', danger: true, onClick: () => handleDelete(item) });

    setContextMenu({ x: e.clientX, y: e.clientY, items: menuItems });
  };

  // Drag & drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(Array.from(e.dataTransfer.files));
    }
  };

  // Permission string to octal
  function permissionsToOctal(perms) {
    if (!perms || perms.length < 10) return '755';
    let octal = '';
    for (let i = 0; i < 3; i++) {
      let val = 0;
      const base = 1 + i * 3;
      if (perms[base] === 'r') val += 4;
      if (perms[base + 1] === 'w') val += 2;
      if (perms[base + 2] === 'x' || perms[base + 2] === 's' || perms[base + 2] === 't') val += 1;
      octal += val;
    }
    return octal;
  }

  // Sort: directories first, then alphabetical
  const sortedItems = [...items].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      className="file-manager"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {loading && <div className="loading-bar" />}

      {/* Header */}
      <div className="header">
        <div className="header-logo">
          <span>📁</span> Web FTP
        </div>
        <div className="header-path">
          <button className="breadcrumb-item" onClick={() => navigate('/')}>
            🏠
          </button>
          {breadcrumbs.map((part, i) => {
            const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="breadcrumb-sep">›</span>
                <button
                  className={`breadcrumb-item ${i === breadcrumbs.length - 1 ? 'active' : ''}`}
                  onClick={() => navigate(path)}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={refresh} title="更新">🔄</button>
          <button className="icon-btn" onClick={onLogout} title="ログアウト">🚪</button>
        </div>
      </div>

      <div className="main-layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="new-menu-wrapper">
              <button className="new-btn" onClick={() => setNewMenuOpen(!newMenuOpen)}>
                <span className="plus">+</span> 新規
              </button>
              {newMenuOpen && (
                <div className="context-menu new-menu" onClick={() => setNewMenuOpen(false)}>
                  <button className="context-menu-item" onClick={handleCreateDir}>
                    <span>📁</span> 新しいフォルダ
                  </button>
                  <button className="context-menu-item" onClick={handleCreateFile}>
                    <span>📄</span> 新しいファイル
                  </button>
                  <div className="context-menu-sep" />
                  <button className="context-menu-item" onClick={() => { setNewMenuOpen(false); fileInputRef.current?.click(); }}>
                    <span>⬆️</span> ファイルをアップロード
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="tree-container">
            <div
              className={`tree-item ${currentPath === '/' ? 'active' : ''}`}
              style={{ paddingLeft: 8 }}
              onClick={() => navigate('/')}
            >
              <span className="tree-icon">🏠</span>
              <span className="tree-name">ルート</span>
            </div>
            {rootDirs.map((dir) => (
              <TreeItem
                key={dir.name}
                item={dir}
                path="/"
                currentPath={currentPath}
                onNavigate={navigate}
                credentials={credentials}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="content">
          <div className="content-toolbar">
            <button className="toolbar-btn" onClick={() => fileInputRef.current?.click()}>
              ⬆️ アップロード
            </button>
            <button className="toolbar-btn" onClick={handleCreateDir}>
              📁 新しいフォルダ
            </button>
            {selected && (() => {
              const item = items.find((i) => i.name === selected);
              if (!item) return null;
              return (
                <>
                  <div className="toolbar-spacer" />
                  <button className="toolbar-btn" onClick={() => handleRename(item)}>✂️ 名前変更</button>
                  {item.type === 'file' && (
                    <button className="toolbar-btn" onClick={() => handleCopy(item)}>📋 コピー</button>
                  )}
                  <button className="toolbar-btn" onClick={() => handleChmod(item)}>🔒 パーミッション</button>
                  {item.type === 'file' && (
                    <button className="toolbar-btn" onClick={() => handleDownload(item)}>⬇️ ダウンロード</button>
                  )}
                  {item.type === 'file' && isTextFile(item.name) && (
                    <button className="toolbar-btn" onClick={() => handleEdit(item)}>✏️ 編集</button>
                  )}
                  <button className="toolbar-btn danger" onClick={() => handleDelete(item)}>🗑️ 削除</button>
                </>
              );
            })()}
          </div>

          <div className="file-list-container">
            <div className="file-list-header">
              <span></span>
              <span>名前</span>
              <span>サイズ</span>
              <span>パーミッション</span>
              <span>更新日</span>
            </div>

            {sortedItems.length === 0 && !loading && (
              <div className="empty-state">
                <div className="icon">📂</div>
                <div>このフォルダは空です</div>
              </div>
            )}

            {sortedItems.map((item) => (
              <div
                key={item.name}
                className={`file-row ${selected === item.name ? 'selected' : ''}`}
                onClick={() => setSelected(item.name)}
                onDoubleClick={() => handleDoubleClick(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <span className="file-row-icon">{getFileIcon(item)}</span>
                <span className="file-row-name">{item.name}</span>
                <span className="file-row-size">{item.type === 'directory' ? '—' : formatSize(item.size)}</span>
                <span className="file-row-perms">{item.permissions}</span>
                <span className="file-row-date">{item.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files.length > 0) {
            handleUpload(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />

      {/* Drag overlay */}
      {dragging && (
        <div className="upload-overlay">
          <div className="upload-overlay-text">ファイルをドロップしてアップロード</div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Modals */}
      {modal && modal.type === 'rename' && (
        <ModalInput
          title={modal.title}
          initialValue={modal.value}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
          label="新しい名前"
        />
      )}

      {modal && modal.type === 'copy' && (
        <ModalInput
          title={modal.title}
          initialValue={modal.value}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
          label="コピー先パス"
        />
      )}

      {modal && modal.type === 'chmod' && (
        <ModalInput
          title={modal.title}
          initialValue={modal.value}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
          label="パーミッション (例: 755)"
        />
      )}

      {modal && modal.type === 'mkdir' && (
        <ModalInput
          title={modal.title}
          initialValue={modal.value}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
          label="フォルダ名"
          placeholder="新しいフォルダ"
        />
      )}

      {modal && modal.type === 'newfile' && (
        <ModalNewFile
          title={modal.title}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {modal && modal.type === 'edit' && (
        <ModalEditor
          title={modal.title}
          initialValue={modal.value}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// Modal subcomponents

function ModalInput({ title, initialValue, onSubmit, onClose, label, placeholder }) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <Modal title={title} onClose={onClose} actions={
      <button className="modal-btn primary" onClick={() => onSubmit(value)}>OK</button>
    }>
      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>{label}</label>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit(value)}
      />
    </Modal>
  );
}

function ModalNewFile({ title, onSubmit, onClose }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <Modal title={title} onClose={onClose} actions={
      <button className="modal-btn primary" onClick={() => onSubmit(name, content)}>作成</button>
    }>
      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>ファイル名</label>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="index.html"
      />
      <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>内容（オプション）</label>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ minHeight: 120 }} />
    </Modal>
  );
}

function ModalEditor({ title, initialValue, onSubmit, onClose }) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="modal-overlay editor-modal" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <textarea value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onClose}>キャンセル</button>
          <button className="modal-btn primary" onClick={() => onSubmit(value)}>保存</button>
        </div>
      </div>
    </div>
  );
}
