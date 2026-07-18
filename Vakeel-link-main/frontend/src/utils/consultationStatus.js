const STATUS_META = {
  pending: {
    label: 'Pending',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  active: {
    label: 'Active',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  completed: {
    label: 'Completed',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  // legacy / display aliases
  accepted: {
    label: 'Active',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  confirmed: {
    label: 'Active',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  declined: {
    label: 'Cancelled',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

export function normalizeStatus(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'accepted' || s === 'confirmed') return 'active';
  if (s === 'declined') return 'cancelled';
  if (s === 'draft') return 'pending';
  return s;
}

export function statusLabel(status) {
  const key = normalizeStatus(status);
  return STATUS_META[key]?.label || STATUS_META.pending.label;
}

export function statusBadgeClass(status) {
  const key = normalizeStatus(status);
  return STATUS_META[key]?.badge || STATUS_META.pending.badge;
}

export function isOpenStatus(status) {
  const key = normalizeStatus(status);
  return key === 'pending' || key === 'active';
}

export function isPastStatus(status) {
  const key = normalizeStatus(status);
  return key === 'completed' || key === 'cancelled';
}

export function toTitleCase(value = '') {
  return String(value)
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatRelativeTime(iso) {
  if (!iso) return 'Recently';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Recently';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function mapConsultationForClient(item) {
  const status = normalizeStatus(item.status);
  const mode = (item.mode || 'chat').toLowerCase();
  const type =
    mode === 'video' ? 'Video Call' : mode === 'in_person' ? 'In-person' : 'Chat';
  const scheduled = item.scheduled_at ? new Date(item.scheduled_at) : null;
  return {
    id: item.id,
    lawyerName: item.lawyer_name || item.lawyerName || 'Assigned Lawyer',
    clientName: item.client_name || item.clientName || 'Client',
    specialization: toTitleCase(item.domain || item.specialization || 'General Law'),
    domain: item.domain || 'general',
    date: scheduled
      ? scheduled.toLocaleDateString()
      : item.created_at
        ? new Date(item.created_at).toLocaleDateString()
        : 'TBD',
    time: scheduled
      ? scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'TBD',
    status,
    statusLabel: statusLabel(status),
    type,
    mode,
    meetingUrl: item.meeting_url || '',
    location: item.location || '',
    clientMessage: item.client_message || item.message || '',
    userId: item.user_id,
    lawyerId: item.lawyer_id,
    createdAt: item.created_at,
    scheduledAt: item.scheduled_at,
  };
}

export function mapConsultationForLawyer(item) {
  const status = normalizeStatus(item.status);
  return {
    id: item.id,
    clientName: item.client_name || item.clientName || 'Client',
    category: toTitleCase(item.domain || 'General Law'),
    domain: item.domain || 'general',
    submittedAt: formatRelativeTime(item.created_at),
    message: item.client_message || 'No message provided.',
    status,
    statusLabel: statusLabel(status),
    userId: item.user_id,
    lawyerId: item.lawyer_id,
    createdAt: item.created_at,
    scheduledAt: item.scheduled_at,
    mode: item.mode || 'chat',
  };
}
