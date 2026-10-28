import { TACTICS } from '../scenarios.js';
import { ALL_TACTICS } from './config.js';
import { round } from './utils.js';
import { plans, messages } from './store.js';

export const ORG = [
  { name: 'Razvoj', n: 24, click: 0.21, report: 0.46, minutes: 14, trend: [0.18, 0.24, 0.29, 0.35, 0.41, 0.46], weak: 'tehnicni' },
  { name: 'Finance', n: 11, click: 0.27, report: 0.38, minutes: 22, trend: [0.12, 0.17, 0.22, 0.28, 0.33, 0.38], weak: 'avtoriteta' },
  { name: 'Prodaja', n: 17, click: 0.34, report: 0.29, minutes: 31, trend: [0.1, 0.13, 0.17, 0.21, 0.26, 0.29], weak: 'nujnost' },
  { name: 'IT', n: 6, click: 0.17, report: 0.61, minutes: 7, trend: [0.38, 0.44, 0.49, 0.53, 0.58, 0.61], weak: 'zaupanje' },
  { name: 'Kadrovska služba', n: 5, click: 0.25, report: 0.4, minutes: 19, trend: [0.2, 0.23, 0.3, 0.33, 0.37, 0.4], weak: 'radovednost' },
  { name: 'Uprava', n: 3, click: 0.3, report: 0.35, minutes: 25, trend: [], weak: 'nujnost' },
];
export function orgAnalytics() {
  const visible = ORG.filter((d) => d.n >= 5);
  const total = ORG.reduce((s, d) => s + d.n, 0);
  const avg = (k) => round(visible.reduce((s, d) => s + d[k] * d.n, 0) / visible.reduce((s, d) => s + d.n, 0), 2);
  return {
    kThreshold: 5,
    employees: total,
    clickRate: avg('click'),
    reportRate: avg('report'),
    medianMinutes: 16,
    months: ['maj', 'jun', 'jul', 'avg', 'sep', 'okt'],
    departments: ORG.map((d) => (d.n >= 5 ? { ...d, weakLabel: TACTICS[d.weak].label, hidden: false } : { name: d.name, n: d.n, hidden: true })),
    tactics: ALL_TACTICS.map((t, i) => ({ key: t, label: TACTICS[t].label, clickRate: [0.31, 0.29, 0.38, 0.24, 0.19][i] })),
  };
}
export function campaignReports() {
  return [...plans.values()].reverse().map(p => {
    const recipients = new Set(p.items.filter(i => i.chosen).map(i => i.userId));
    const sent = messages.filter(m => m.planId === p.id);
    const answers = sent.filter(m => m.resolved);
    const respondents = new Set(answers.map(m => m.userId));
    const base = { id: p.id, name: p.name, groupName: p.groupName, status: p.status, createdAt: p.createdAt, recipients: recipients.size, delivered: sent.length, cost: p.totalCost || 0 };
    if (recipients.size < 5 || respondents.size < 5) return { ...base, hidden: true };
    const reports = answers.filter(m => m.resolved.outcome === 'success');
    const times = reports.map(m => m.resolved.responseMs).sort((a, b) => a - b);
    const medianMs = !times.length ? null : times.length % 2 ? times[Math.floor(times.length / 2)] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2;
    return { ...base, hidden: false, responses: answers.length, reportRate: reports.length / answers.length,
      clickRate: answers.filter(m => m.resolved.outcome === 'fail').length / answers.length, medianSeconds: medianMs === null ? null : Math.round(medianMs / 1000) };
  });
}
