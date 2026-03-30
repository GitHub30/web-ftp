import { useState, useEffect } from 'react';
import Login from './Login';
import FileManager from './FileManager';
import './App.css';

function getCredentialsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get('username');
  const password = params.get('password');
  const hostname = params.get('hostname') || '';
  const port = params.get('port') || '';
  if (username && password) {
    return { username, password, hostname, port };
  }
  return null;
}

function setCredentialsInUrl(credentials) {
  const url = new URL(window.location.href);
  url.searchParams.set('username', credentials.username);
  url.searchParams.set('password', credentials.password);
  if (credentials.hostname) {
    url.searchParams.set('hostname', credentials.hostname);
  } else {
    url.searchParams.delete('hostname');
  }
  if (credentials.port) {
    url.searchParams.set('port', credentials.port);
  } else {
    url.searchParams.delete('port');
  }
  window.history.replaceState({}, '', url);
}

function clearCredentialsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('username');
  url.searchParams.delete('password');
  url.searchParams.delete('hostname');
  url.searchParams.delete('port');
  url.searchParams.delete('path');
  window.history.replaceState({}, '', url);
}

export default function App() {
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    const creds = getCredentialsFromUrl();
    if (creds) {
      setCredentials(creds);
    }
  }, []);

  const handleLogin = (creds) => {
    setCredentials(creds);
    setCredentialsInUrl(creds);
  };

  const handleLogout = () => {
    setCredentials(null);
    clearCredentialsFromUrl();
  };

  if (!credentials) {
    return <Login onLogin={handleLogin} />;
  }

  return <FileManager credentials={credentials} onLogout={handleLogout} />;
}
