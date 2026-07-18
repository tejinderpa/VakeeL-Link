import React, { useEffect, useState } from 'react';
import {
  User,
  Mail,
  Shield,
  Bell,
  CreditCard,
  Camera,
  CheckCircle2,
  Lock,
  Smartphone,
  Trash2,
} from 'lucide-react';
import UserSidebar from '../components/UserSidebar';
import useAuth from '../components/useAuth';
import { API_BASE_URL } from '../utils/api';

export default function Profile() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('personal');
  const [fullName, setFullName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem('vakeellink_token');
      if (!token || token === 'mock_jwt_token') return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.full_name) setFullName(data.full_name);
      } catch (_err) {
        // Keep local fallback when backend isn't available.
      }
    };
    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setToast('Name cannot be empty');
      return;
    }

    const token = localStorage.getItem('vakeellink_token');
    if (!token || token === 'mock_jwt_token') {
      const savedUser = JSON.parse(localStorage.getItem('vakeellink_user') || '{}');
      localStorage.setItem('vakeellink_user', JSON.stringify({ ...savedUser, name: trimmedName }));
      setToast('Saved locally (demo mode)');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ full_name: trimmedName }),
      });
      if (!res.ok) throw new Error();
      setToast('Profile updated');
    } catch (_err) {
      setToast('Unable to save profile right now');
    }
  };

  const handleUpdatePassword = () => {
    if (!currentPassword || !newPassword) {
      setToast('Enter current and new password');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setToast('Password update request submitted');
  };

  const handleToggle2FA = () => {
    setTwoFactorEnabled((prev) => !prev);
    setToast(twoFactorEnabled ? 'Two-factor disabled' : 'Two-factor enabled');
  };

  const tabs = [
    { id: 'personal', label: 'Personal info', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-shadow focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';

  return (
    <div className="min-h-screen bg-[#faf8ff] text-slate-900">
      <UserSidebar />

      <main className="min-h-screen min-w-0 md:pl-[260px] lg:pl-[280px]">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold text-[#0f2d5e]">Account settings</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Manage your personal information, security, and subscription preferences.
            </p>
          </header>

          <div className="flex flex-col gap-8 lg:flex-row">
            <aside className="w-full shrink-0 lg:w-56">
              <nav className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-4 py-3 text-left text-sm font-semibold transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#0f2d5e] text-white'
                        : 'text-slate-600 hover:bg-white hover:text-[#0f2d5e]'
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="min-w-0 flex-1">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                {activeTab === 'personal' && (
                  <div className="space-y-8">
                    <div className="flex flex-col items-center gap-5 sm:flex-row">
                      <div className="relative group">
                        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 text-2xl font-bold text-[#0f2d5e]">
                          {user?.name?.charAt(0) || 'U'}
                          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <Camera size={20} className="text-white" />
                          </div>
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-600">
                          <CheckCircle2 size={12} className="text-white" />
                        </div>
                      </div>
                      <div className="text-center sm:text-left">
                        <h2 className="text-xl font-semibold text-[#0f2d5e]">
                          {user?.name || 'User Name'}
                        </h2>
                        <p className="text-sm text-slate-500 capitalize">
                          {user?.role || 'Client'} account
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 border-t border-slate-100 pt-6 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                          Full name
                        </label>
                        <div className="relative">
                          <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                          Email address
                        </label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            defaultValue={user?.email}
                            disabled
                            className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleSaveProfile}
                      className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                    >
                      Save changes
                    </button>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-lg font-semibold text-[#0f2d5e]">Security & password</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Update your password and manage two-factor authentication.
                      </p>
                    </div>

                    <div className="space-y-4 border-t border-slate-100 pt-6">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                          Current password
                        </label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                          New password
                        </label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="password"
                            placeholder="New password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleUpdatePassword}
                        className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                      >
                        Update password
                      </button>
                    </div>

                    <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <Smartphone size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">
                            Two-factor authentication
                          </h4>
                          <p className="text-xs text-slate-500">
                            Status: {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleToggle2FA}
                        className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                      >
                        {twoFactorEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'notifications' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-[#0f2d5e]">Notification preferences</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Control which updates you receive via email and push.
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {[
                        { title: 'Case updates', desc: 'Alerts for status changes in your active matters.' },
                        { title: 'Meeting reminders', desc: 'Reminders for upcoming consultations.' },
                        { title: 'Marketplace offers', desc: 'Exclusive deals from legal professionals.' },
                        { title: 'System alerts', desc: 'Security alerts and system maintenance notes.' },
                      ].map((item) => (
                        <div
                          key={item.title}
                          className="flex items-center justify-between gap-4 py-4"
                        >
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                            <p className="text-xs text-slate-500">{item.desc}</p>
                          </div>
                          <div className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-blue-600">
                            <span className="pointer-events-none inline-block h-5 w-5 translate-x-5 transform rounded-full bg-white shadow ring-0 transition" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'billing' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-[#0f2d5e]">Subscription & billing</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Manage your plan and view recent transaction history.
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#0f2d5e] p-6 text-white">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                            Active plan
                          </span>
                          <h4 className="mt-3 text-2xl font-bold">VakeelLink Premium</h4>
                        </div>
                        <span className="text-2xl font-bold">
                          $49<span className="text-sm font-medium text-blue-200">/mo</span>
                        </span>
                      </div>
                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5">
                        <p className="text-xs text-blue-100">Next renewal: June 15, 2024</p>
                        <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0f2d5e] hover:bg-blue-50">
                          Manage
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Billing history
                      </h4>
                      <div className="space-y-2">
                        {[
                          { date: 'May 15, 2024', amount: '$49.00', status: 'Success' },
                          { date: 'Apr 15, 2024', amount: '$49.00', status: 'Success' },
                        ].map((inv) => (
                          <div
                            key={inv.date}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
                                <CreditCard size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{inv.date}</p>
                                <p className="text-xs text-emerald-600">{inv.status}</p>
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-slate-900">{inv.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center">
                <div>
                  <h4 className="text-sm font-semibold text-rose-700">Danger zone</h4>
                  <p className="mt-0.5 text-xs text-rose-600/80">
                    Permanently delete your account and all associated data.
                  </p>
                </div>
                <button className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50">
                  <Trash2 size={16} />
                  Delete account
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
