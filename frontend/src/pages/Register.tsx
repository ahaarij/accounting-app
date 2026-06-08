import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Reconciliation App</h1>
          <p className="text-slate-400 text-sm mt-1">aarij co</p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Registration Submitted</h2>
            <p className="text-sm text-gray-500">Your account is pending approval. An administrator will review your request and activate your account.</p>
            <Link to="/login" className="block text-sm text-blue-600 hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Create account</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {[
              { label: 'Full name', value: name, set: setName, type: 'text', placeholder: 'Your name' },
              { label: 'Email', value: email, set: setEmail, type: 'email', placeholder: 'you@company.ae' },
              { label: 'Password', value: password, set: setPassword, type: 'password', placeholder: '••••••••' },
              { label: 'Confirm password', value: confirm, set: setConfirm, type: 'password', placeholder: '••••••••' },
            ].map(({ label, value, set, type, placeholder }) => (
              <div key={label} className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                <input
                  type={type} required value={value} onChange={(e) => set(e.target.value)}
                  placeholder={placeholder} minLength={type === 'password' ? 6 : undefined}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <button
              type="submit" disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Submitting…' : 'Request access'}
            </button>

            <p className="text-center text-xs text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:underline">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
