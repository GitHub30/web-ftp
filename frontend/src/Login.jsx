import { useState } from 'react';
import { testConnection } from './api';
import './Login.css';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const credentials = { username, password, hostname: hostname || '', port: port || '' };
    try {
      await testConnection(credentials);
      onLogin(credentials);
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="logo">📁</div>
        <h1>Web FTP</h1>
        <p className="subtitle">FTPサーバーに接続</p>

        {error && <div className="login-error">{error}</div>}

        <div className="form-group">
          <label>ユーザー名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="user@example.com"
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            required
          />
        </div>

        <div className="form-group">
          <label>ホスト名（オプション）</label>
          <input
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="ftp.example.com"
          />
        </div>

        <div className="form-group">
          <label>ポート番号（オプション）</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="21"
            min="1"
            max="65535"
          />
        </div>

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? '接続中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}
