import { useState } from 'react';
import { authAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authAPI.login({ username, password });
      localStorage.setItem('jewelerp_token', res.data.token);
      localStorage.setItem('jewelerp_user', JSON.stringify(res.data.user));
      toast.success(`Welcome, ${res.data.user.fullName}`);
      navigate('/');
    } catch (error) {
      toast.error('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-jewel-dark flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-96">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-jewel-gold">JewelERP</h1>
          <p className="text-gray-500 text-sm">Jewelry Retail Management System</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="form-label block">Username</label>
            <input
              type="text"
              className="form-input w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="form-label block">Password</label>
            <input
              type="password"
              className="form-input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full py-2" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-gray-400">
          Default: admin / admin123
        </div>
      </div>
    </div>
  );
}
