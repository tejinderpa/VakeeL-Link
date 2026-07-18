import { Lock } from 'lucide-react';
import { writeStoredPortal } from '../utils/authPortal';

/**
 * Client / Advocate switcher for auth pages.
 * When locked (e.g. after signup handoff), shows a frozen role chip.
 */
export default function AuthPortalToggle({
  portal,
  locked = false,
  onChange,
  clientLabel = 'Client',
  lawyerLabel = 'Advocate',
}) {
  const isClient = portal === 'client';

  if (locked) {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0f2d5e] text-white">
              <Lock size={15} strokeWidth={2.25} />
            </span>
            <div className="min-w-0 text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Portal selected
              </p>
              <p className="truncate text-sm font-semibold text-[#0f2d5e]">
                {isClient ? clientLabel : lawyerLabel} account
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Locked
          </span>
        </div>
        {typeof onChange === 'function' ? (
          <button
            type="button"
            onClick={() => {
              const next = isClient ? 'lawyer' : 'client';
              writeStoredPortal(next);
              onChange(next, { unlock: true });
            }}
            className="mt-3 w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            Switch to {isClient ? lawyerLabel : clientLabel} portal
          </button>
        ) : null}
      </div>
    );
  }

  const select = (next) => {
    writeStoredPortal(next);
    onChange?.(next, { unlock: false });
  };

  return (
    <div
      className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"
      role="tablist"
      aria-label="Account type"
    >
      <button
        type="button"
        role="tab"
        aria-selected={isClient}
        onClick={() => select('client')}
        className={`rounded-lg py-2.5 text-sm font-semibold transition-all duration-300 ease-out ${
          isClient
            ? 'bg-[#0f2d5e] text-white shadow-sm'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        }`}
      >
        {clientLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!isClient}
        onClick={() => select('lawyer')}
        className={`rounded-lg py-2.5 text-sm font-semibold transition-all duration-300 ease-out ${
          !isClient
            ? 'bg-[#0f2d5e] text-white shadow-sm'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        }`}
      >
        {lawyerLabel}
      </button>
    </div>
  );
}
